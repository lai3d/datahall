// 用 Khronos glTF-Validator 检查 glb，按文件输出错误和警告数；有错误时退出码为 1。
// 用法：node scripts/validate-gltf.js <file.glb>...
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import validator from 'gltf-validator';

let failed = false;
for (const file of process.argv.slice(2)){
  const report = await validator.validateBytes(new Uint8Array(readFileSync(file)), {uri: basename(file), maxIssues: 50});
  const {numErrors, numWarnings, numInfos, messages} = report.issues;
  console.log(JSON.stringify({file: basename(file), errors: numErrors, warnings: numWarnings, infos: numInfos,
    messages: messages.filter(m => m.severity <= 1).map(m => `${m.code} ${m.pointer || ''} ${m.message}`)}));
  if (numErrors) failed = true;
}
process.exit(failed ? 1 : 0);
