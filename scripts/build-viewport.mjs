import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const crate = path.join(root, 'viewport');
const bindings = path.join(crate, 'target', 'browser-bindings');
const output = path.join(root, 'src', 'viewport-wasm');
const result = spawnSync('wasm-pack', [
  'build', crate, '--target', 'web', '--release', '--out-dir', bindings,
  '--no-typescript', '--no-opt', '--locked'
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync(output, { recursive: true });
for (const name of ['stair_viewport.js', 'stair_viewport_bg.wasm']) {
  copyFileSync(path.join(bindings, name), path.join(output, name));
}
