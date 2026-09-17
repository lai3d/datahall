// Checks glb files with the Khronos glTF-Validator and prints error and warning counts per file; exits with code 1 on errors.
// Usage: node scripts/validate-gltf.ts <file.glb>...
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
// gltf-validator has no type declarations; only validateBytes is used
// @ts-expect-error untyped package
import validatorModule from 'gltf-validator';

interface GltfMessage {code: string; severity: number; pointer?: string; message: string}
const validator = validatorModule as {
  validateBytes(data: Uint8Array, options: {uri: string; maxIssues: number}): Promise<{issues: {numErrors: number; numWarnings: number; numInfos: number; messages: GltfMessage[]}}>;
};

let failed = false;
for (const file of process.argv.slice(2)){
  const report = await validator.validateBytes(new Uint8Array(readFileSync(file)), {uri: basename(file), maxIssues: 50});
  const {numErrors, numWarnings, numInfos, messages} = report.issues;
  console.log(JSON.stringify({file: basename(file), errors: numErrors, warnings: numWarnings, infos: numInfos,
    messages: messages.filter(m => m.severity <= 1).map(m => `${m.code} ${m.pointer || ''} ${m.message}`)}));
  if (numErrors) failed = true;
}
process.exit(failed ? 1 : 0);
