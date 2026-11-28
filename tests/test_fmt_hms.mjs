// Run with: node tests/test_fmt_hms.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const line = source.split('\n').find(l => l.startsWith('const fmtHMS'));
const fmtHMS = new Function(`${line}\nreturn fmtHMS;`)();

assert.equal(fmtHMS(18342.7), '05:05:42');
assert.equal(fmtHMS(0), '00:00:00');
assert.equal(fmtHMS(undefined), '00:00:00');
assert.equal(fmtHMS('nope'), '00:00:00');
assert.equal(fmtHMS(-5), '00:00:00');
console.log('fmtHMS ok');
