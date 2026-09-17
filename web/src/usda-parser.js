// usda 文本格式的精简解析器：只解析根层的 prim、属性、元数据和值，不做组合（references、sublayer 不展开）。
// 足够读取本项目导出、以及被 usdview、usdcat、Omniverse 重新保存过的文件。
// 不支持的语法（variantSet、spline 等）按括号配对整体跳过。

export class UsdaSyntaxError extends Error {
  constructor(message, line){ super(`第 ${line} 行：${message}`); this.line = line; }
}

const LIST_OPS = new Set(['add', 'append', 'delete', 'prepend', 'reorder']);
const SPECIFIERS = new Set(['def', 'over', 'class']);
const VARIABILITY = new Set(['uniform', 'varying', 'config']);

function tokenize(src){
  const tokens = [];
  let i = 0, line = 1;
  const push = (type, value) => tokens.push({type, value, line});
  const fail = msg => { throw new UsdaSyntaxError(msg, line); };
  while (i < src.length){
    const c = src[i];
    if (c === '\n'){ line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r'){ i++; continue; }
    if (c === '#'){ while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'"){
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length, out = '';
      for (;;){
        if (j >= src.length) fail('字符串没有结束');
        if (src.startsWith(q, j)) break;
        if (src[j] === '\\' && j + 1 < src.length){
          const e = src[j + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          j += 2; continue;
        }
        if (src[j] === '\n'){ if (!triple) fail('字符串没有结束'); line++; }
        out += src[j++];
      }
      push('string', out);
      i = j + q.length;
      continue;
    }
    if (c === '<'){
      const j = src.indexOf('>', i);
      if (j < 0) fail('路径没有结束');
      push('path', src.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    if (c === '@'){
      const q = src.startsWith('@@@', i) ? '@@@' : '@';
      const j = src.indexOf(q, i + q.length);
      if (j < 0) fail('资产路径没有结束');
      push('asset', src.slice(i + q.length, j));
      i = j + q.length;
      continue;
    }
    if ('(){}[]=,;:'.includes(c)){ push('punct', c); i++; continue; }
    const num = src.slice(i).match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|^-inf\b/);
    if (num){ push('number', num[0] === '-inf' ? -Infinity : Number(num[0])); i += num[0].length; continue; }
    // 标识符可以带命名空间和属性后缀：dchall:powerKw、outputs:surface.connect、float3[] 的 float3
    const id = src.slice(i).match(/^[A-Za-z_][\w]*(?:[:.][A-Za-z_][\w]*)*/);
    if (id){ push('ident', id[0]); i += id[0].length; continue; }
    fail(`无法识别的字符 ${JSON.stringify(c)}`);
  }
  push('eof', null);
  return tokens;
}

class Parser {
  constructor(tokens){ this.t = tokens; this.i = 0; }
  get peek(){ return this.t[this.i]; }
  at(offset){ return this.t[this.i + offset]; }
  next(){ return this.t[this.i++]; }
  is(type, value){ const p = this.peek; return p.type === type && (value === undefined || p.value === value); }
  accept(type, value){ if (this.is(type, value)) return this.next(); return null; }
  expect(type, value){
    if (this.is(type, value)) return this.next();
    const p = this.peek;
    throw new UsdaSyntaxError(`应为 ${value ?? type}，实际是 ${p.type === 'eof' ? '文件结尾' : JSON.stringify(p.value)}`, p.line);
  }

  // 跳过一个成对括号包起来的块（当前 token 必须是开括号）
  skipGroup(){
    const open = this.expect('punct').value, close = {'(': ')', '{': '}', '[': ']'}[open];
    let depth = 1;
    while (depth){
      const tok = this.next();
      if (tok.type === 'eof') throw new UsdaSyntaxError(`${open} 没有配对的 ${close}`, tok.line);
      if (tok.type === 'punct' && tok.value === open) depth++;
      if (tok.type === 'punct' && tok.value === close) depth--;
    }
  }

  value(){
    const tok = this.peek;
    if (tok.type === 'number' || tok.type === 'string' || tok.type === 'path' || tok.type === 'asset'){
      this.next();
      if (tok.type === 'asset') return this.is('path') ? {asset: tok.value, path: this.next().value} : {asset: tok.value};
      return tok.type === 'path' ? {path: tok.value} : tok.value;
    }
    if (tok.type === 'ident'){
      this.next();
      if (tok.value === 'true') return true;
      if (tok.value === 'false') return false;
      if (tok.value === 'None') return null;
      if (tok.value === 'inf') return Infinity;
      if (tok.value === 'nan') return NaN;
      return tok.value;
    }
    if (this.is('punct', '(') || this.is('punct', '[')){
      const close = this.next().value === '(' ? ')' : ']';
      const items = [];
      while (!this.accept('punct', close)){
        items.push(this.value());
        if (this.is('punct', '(')) this.skipGroup();      // sublayer 的层偏移 (offset = 0; scale = 1)
        if (!this.accept('punct', ',') && !this.is('punct', close)) this.expect('punct', close);
      }
      return items;
    }
    if (this.is('punct', '{')) return this.dictionary();
    throw new UsdaSyntaxError(`无法解析的值 ${JSON.stringify(tok.value)}`, tok.line);
  }

  // 字典：customLayerData、customData 的 `type name = value`，以及 timeSamples 的 `time: value`
  dictionary(){
    this.expect('punct', '{');
    const out = {};
    while (!this.accept('punct', '}')){
      if (this.at(1).type === 'punct' && this.at(1).value === ':'){
        const key = this.next().value; this.next();
        out[key] = this.value();
      } else {
        if (this.is('ident') && !(this.at(1).type === 'punct' && this.at(1).value === '=')){
          this.next();                                   // 值类型，例如 string、dictionary、double3
          if (this.is('punct', '[') && this.at(1).value === ']'){ this.next(); this.next(); }
        }
        const key = this.next().value;
        this.expect('punct', '=');
        out[key] = this.value();
      }
      this.accept('punct', ',') || this.accept('punct', ';');
    }
    return out;
  }

  // ( ... ) 元数据：key = value、带列表操作的 key、以及裸字符串形式的 doc
  metadata(){
    const out = {};
    this.expect('punct', '(');
    while (!this.accept('punct', ')')){
      if (this.is('string')){ out.doc = this.next().value; continue; }
      let op = null;
      if (this.is('ident') && LIST_OPS.has(this.peek.value) && this.at(1).type === 'ident') op = this.next().value;
      const key = this.expect('ident').value;
      this.expect('punct', '=');
      const value = this.value();
      out[key] = op ? {op, value} : value;
      this.accept('punct', ';');
    }
    return out;
  }

  layer(){
    const layer = {metadata: {}, prims: []};
    if (this.is('punct', '(')) layer.metadata = this.metadata();
    while (!this.is('eof')) this.primOrSkip(layer.prims);
    return layer;
  }

  primOrSkip(into){
    if (this.is('ident') && SPECIFIERS.has(this.peek.value)){ into.push(this.prim()); return; }
    const tok = this.peek;
    throw new UsdaSyntaxError(`应为 def、over 或 class，实际是 ${JSON.stringify(tok.value)}`, tok.line);
  }

  prim(){
    const specifier = this.next().value;
    const type = this.is('ident') ? this.next().value : null;
    const name = this.expect('string').value;
    const prim = {specifier, type, name, metadata: {}, props: {}, children: []};
    if (this.is('punct', '(')) prim.metadata = this.metadata();
    this.expect('punct', '{');
    while (!this.accept('punct', '}')){
      if (this.is('ident') && SPECIFIERS.has(this.peek.value) && this.at(1).type !== 'punct') prim.children.push(this.prim());
      else this.property(prim);
    }
    return prim;
  }

  property(prim){
    const start = this.peek;
    // reorder nameChildren / properties、variantSet 等不需要的语法整体跳过
    if (this.is('ident', 'reorder')){ while (!this.is('punct', '[')) this.next(); this.skipGroup(); return; }
    if (this.is('ident', 'variantSet')){ while (!this.is('punct', '{')) this.next(); this.skipGroup(); return; }
    let op = null, custom = false;
    if (this.is('ident') && LIST_OPS.has(this.peek.value)) op = this.next().value;
    if (this.accept('ident', 'custom')) custom = true;
    if (this.is('ident') && VARIABILITY.has(this.peek.value)) this.next();
    const isRel = this.accept('ident', 'rel');
    let type = 'rel';
    if (!isRel){
      type = this.expect('ident').value;
      if (this.is('punct', '[')){ this.next(); this.expect('punct', ']'); type += '[]'; }
    }
    const fullName = this.expect('ident').value;
    const [name, suffix] = fullName.match(/^(.*?)(?:\.(connect|timeSamples|spline|default))?$/).slice(1);
    const prop = prim.props[name] || (prim.props[name] = {type, custom, line: start.line});
    if (this.accept('punct', '=')){
      const value = this.value();
      if (suffix === 'connect') prop.connect = value;
      else if (suffix === 'timeSamples') prop.timeSamples = value;
      else if (!suffix) prop.value = op ? {op, value} : value;
    }
    if (this.is('punct', '(')) prop.metadata = this.metadata();
    this.accept('punct', ';');
  }
}

export function parseUsda(src){
  const header = src.match(/^#usda\s+(\d+\.\d+)/);
  if (!header) throw new UsdaSyntaxError('不是 usda 文本文件（缺少 #usda 文件头）', 1);
  const layer = new Parser(tokenize(src.slice(header[0].length))).layer();
  layer.version = header[1];
  return layer;
}
