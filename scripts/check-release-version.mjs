import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const tag=process.argv[2];
assert.match(tag??'',/^v\d+\.\d+\.\d+$/,'Expected a vX.Y.Z release tag');
const version=tag.slice(1);
const read=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
assert.equal(json('package.json').version,version,'package.json');
assert.equal(json('package-lock.json').version,version,'package-lock.json');
assert.equal(json('src-tauri/tauri.conf.json').version,version,'Tauri configuration');
assert.match(read('Cargo.toml'),new RegExp(`^version = "${version.replaceAll('.','\\.')}"$`,'m'),'Cargo workspace');
assert.match(read('Cargo.lock'),new RegExp(`name = "open-stair-studio"\\r?\\nversion = "${version.replaceAll('.','\\.')}"`),'Cargo lockfile');
assert.match(read('src/stair.js'),new RegExp(`version: '${version.replaceAll('.','\\.')}'`),'project version');
console.log(`Release versions agree: ${tag}`);
