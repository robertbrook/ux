import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ReplMachine } from '../src/repl-machine.js';

const wasm = await readFile(new URL('../public/uxn.wasm', import.meta.url));
const create = () => new ReplMachine().init(wasm);
function evaluate(repl, source) {
  repl.submit(source);
  while (repl.advance()) {}
}

test('REPL preserves both stacks, RAM and definitions without reexecuting old entries', async () => {
  const repl = await create();
  evaluate(repl, '#03 #04 ADD #09 STH');
  assert.deepEqual(repl.snapshot().wst, [7]);
  assert.deepEqual(repl.snapshot().rst, [9]);
  evaluate(repl, '#02 MUL STHr');
  assert.deepEqual(repl.snapshot().wst, [14, 9]);
  evaluate(repl, '#2a #10 STZ #12 #9000 STA');
  evaluate(repl, '#10 LDZ #9000 LDA');
  assert.deepEqual(repl.snapshot().wst, [14, 9, 42, 18]);
  evaluate(repl, '%DOUBLE { DUP ADD } !skip @double DOUBLE JMP2r @skip');
  evaluate(repl, '#03 DOUBLE #04 double');
  assert.deepEqual(repl.snapshot().wst, [14, 9, 42, 18, 6, 8]);
});

test('assembly errors leave scratch state and code allocation untouched', async () => {
  const repl = await create();
  evaluate(repl, '#2a');
  const before = repl.snapshot();
  for (const source of ['#gg', 'missing', '( unclosed', '|0100 #01', '|00 #01', '#1', '%BRK { #01 }']) {
    assert.throws(() => repl.submit(source));
    assert.deepEqual(repl.snapshot(), before);
  }
  evaluate(repl, '#02 ADD');
  assert.deepEqual(repl.snapshot().wst, [44]);
});

test('REPL accepts zero-page symbols but prevents code writes into earlier gaps', async () => {
  const repl = await create();
  evaluate(repl, '|00 @value $1 |0100 #2a .value STZ');
  evaluate(repl, '.value LDZ');
  assert.deepEqual(repl.snapshot().wst, [42]);
  evaluate(repl, '$10 #01');
  assert.throws(() => repl.submit('|010b #02'), /append-only|Overlapping/);
});

test('manual stop and instruction limit preserve partial state and allow recovery', async () => {
  const repl = await create();
  repl.submit('#2a @loop !loop');
  assert.equal(repl.advance(), true);
  assert.throws(() => repl.submit('#03'), /already running/);
  repl.stop();
  evaluate(repl, '#01 ADD');
  assert.deepEqual(repl.snapshot().wst, [43]);
  repl.submit('@forever !forever');
  assert.throws(() => { while (repl.advance()) {} }, /1,000,000 instructions/);
  assert.equal(repl.snapshot().running, false);
  evaluate(repl, '#01 ADD');
  assert.deepEqual(repl.snapshot().wst, [44]);
});

test('console output is bounded and scratch halt requires a new machine', async () => {
  const repl = await create();
  evaluate(repl, '#41 #18 DEO #42 #19 DEO');
  assert.deepEqual(repl.drainOutput(), [{ text: 'A', error: false }, { text: 'B', error: true }]);
  repl.submit('@print #41 #18 DEO !print');
  assert.throws(() => { while (repl.advance()) {} }, /instructions/);
  const output = repl.drainOutput();
  assert.ok(output.reduce((length, entry) => length + entry.text.length, 0) < 64100);
  assert.match(output.at(-1).text, /truncated/);
  evaluate(repl, '#01 #0f DEO');
  assert.equal(repl.snapshot().halted, true);
  assert.throws(() => repl.submit('#01'), /Reset REPL/);
  const fresh = await create();
  assert.deepEqual(fresh.snapshot().wst, []);
  assert.equal(fresh.machine.ram[0x10], 0);
});

test('scratch machines do not share RAM, stacks, devices or virtual files', async () => {
  const a = await create(), b = await create();
  evaluate(a, '#2a #10 STZ #03 #18 DEO #07');
  a.machine.files.set('scratch.txt', new Uint8Array([42]));
  assert.deepEqual(b.snapshot().wst, []);
  assert.equal(b.machine.ram[0x10], 0);
  assert.equal(b.machine.dev[0x18], 0);
  assert.equal(b.machine.files.size, 0);
  assert.deepEqual(b.drainOutput(), []);
});

test('REPL enforces input, source history and code memory limits explicitly', async () => {
  const repl = await create();
  assert.throws(() => repl.submit(' '), /Enter Uxntal/);
  assert.throws(() => repl.submit(' '.repeat(32769)), /Enter Uxntal/);
  assert.throws(() => repl.submit('#01' + ' '.repeat(32768)), /32,768/);
  const comment = '( ' + 'x'.repeat(32760) + ' )';
  for (let i = 0; i < 7; i++) evaluate(repl, comment);
  assert.throws(() => repl.submit(comment), /256 KiB/);
  const unicode = await create();
  const unicodeComment = '( ' + '\u00e9'.repeat(16000) + ' )';
  for (let i = 0; i < 8; i++) evaluate(unicode, unicodeComment);
  assert.equal(unicode.sourceBytes, 8 * (Buffer.byteLength(unicodeComment) + '~repl-1.tal\nBRK\n'.length));
  const remaining = 262144 - unicode.sourceBytes - '~repl-9.tal\nBRK\n'.length;
  evaluate(unicode, '( ' + ' '.repeat(remaining - 4) + ' )');
  assert.equal(unicode.sourceBytes, 262144);
  assert.throws(() => unicode.submit('( )'), /256 KiB/);
  const full = await create();
  evaluate(full, '$feff');
  assert.equal(full.snapshot().next, 0x10000);
  assert.throws(() => full.submit('#01'), /code memory is full/);
});
