// 容量模型：配电、液冷、风冷、后端网络、市电，任一不满足不能通电
export function fmt(kw){ return kw >= 1000 ? (kw / 1000).toFixed(2) + ' MW' : Math.round(kw) + ' kW'; }

export function compute(list, CAT, utility){
  const s = {it:0, gpus:0, liqHeat:0, airHeat:0, liqCap:0, airCap:0, dist:0, ports:0, ovh:0, capex:0, future:false, dense:false};
  for (const i of list){
    const t = CAT[i.type], kw = t.kw || 0;
    s.it += kw; s.gpus += t.gpus || 0;
    s.liqHeat += kw * (t.liq || 0); s.airHeat += kw * (1 - (t.liq || 0));
    s.liqCap += t.liqCool || 0; s.airCap += t.airCool || 0;
    s.dist += t.dist || 0; s.ports += t.ports || 0; s.ovh += t.ovh || 0; s.capex += t.cap || 0;
    if (t.future) s.future = true;
    if (i.type === 'dgx') s.dense = true;
  }
  // 教学用简化 PUE：液冷热量 ×0.08、风冷热量 ×0.30 的制冷耗电，加 IT×0.05 的配电损耗
  const chiller = s.liqHeat * .08 + s.airHeat * .30;
  const losses = s.it * .05;
  s.facility = s.it + s.ovh + chiller + losses;
  s.pue = s.it ? s.facility / s.it : 0;
  s.issues = [];
  const add = (lvl, txt) => s.issues.push({lvl, txt});
  if (s.it > s.dist) add('bad', `配电不足：机柜需要 ${fmt(s.it)}，配电柜只能分配 ${fmt(s.dist)}。加 RPP。`);
  if (s.liqHeat > s.liqCap) add('bad', `液冷不足：${fmt(s.liqHeat)} 热量，CDU 只能带走 ${fmt(s.liqCap)}。加 CDU。`);
  if (s.airHeat > s.airCap) add('bad', `风冷不足：${fmt(s.airHeat)} 热量，空调只能带走 ${fmt(s.airCap)}。加列间空调。`);
  if (s.gpus > s.ports) add('bad', `后端网络不足：${s.gpus} 颗 GPU，只有 ${s.ports} 个端口。加 IB 交换机柜。`);
  if (s.facility > utility * 1000) add('bad', `超出市电：设施总功耗 ${fmt(s.facility)}，市电只有 ${utility} MW。`);
  if (s.future) add('warn', 'Kyber 机柜需要 800 VDC 配电，目前还只是路线图产品。');
  if (s.dense) add('warn', 'DGX B200 整柜约 57 kW 纯风冷，现实中通常要配背板换热器。');
  s.blocking = s.issues.some(i => i.lvl === 'bad');
  return s;
}
