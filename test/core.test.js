import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assemble, instruction } from '../src/assembler.js';
import { Machine } from '../src/machine.js';
import { examples } from '../src/examples.js';
import { voiceParameters, AudioEngine } from '../src/audio.js';

const wasm = await readFile(new URL('../public/uxn.wasm', import.meta.url));
async function machine(source, events) {
  const m = await new Machine(events).init(wasm);
  m.load(assemble(source).rom);
  return m;
}
function finish(m, limit = 100) {
  for (let i = 0; i < limit; i++) if (!m.run()) return;
  assert.fail('Program did not finish within the instruction budget');
}
test('all bundled examples assemble and execute reset without errors', async () => {
  for (const example of examples) {
    const m = await machine(example.source);
    finish(m);
    assert.equal(m.pc, 0, example.name);
  }
});
test('console produces the real hello-world result', async () => {
  let text = '';
  const m = await machine(examples[1].source, e => { if (e.type === 'console') text += e.text; });
  finish(m); assert.equal(text, 'Hello, Uxn world!\n');
});
test('gas yields and stepping preserves PC and both stacks', async () => {
  const m = await machine('|0100 #03 #04 ADD STH #09 BRK');
  m.run(1); assert.equal(m.pc, 0x102); assert.deepEqual(m.stack('wst'), [3]);
  m.run(1); assert.deepEqual(m.stack('wst'), [3, 4]);
  m.run(1); assert.deepEqual(m.stack('wst'), [7]);
  m.run(1); assert.deepEqual(m.stack('wst'), []); assert.deepEqual(m.stack('rst'), [7]);
  finish(m); assert.equal(m.pc, 0); assert.equal(m.instructions, 6);
});
test('infinite programs yield and remain resettable', async () => {
  const m = await machine('|0100 @loop !loop');
  assert.equal(m.run(100000), true); assert.equal(m.pc, 0x100);
  m.load(assemble('|0100 #2a BRK').rom); finish(m); assert.deepEqual(m.stack('wst'), [42]);
});
test('short, keep, return and immediate call modes execute', async () => {
  const m = await machine('|0100 #1234 #0002 ADD2k STH2 ;sub JSR2 BRK @sub #07 INC JMP2r');
  finish(m);
  assert.deepEqual(m.stack('wst'), [0x12, 0x34, 0, 2, 8]);
  assert.deepEqual(m.stack('rst'), [0x12, 0x36]);
});
test('all opcode bytes have a disassembly name', () => {
  for (let i = 0; i < 256; i++) assert.match(instruction(i), /^[A-Z]{3}[2rk]*$/);
});
test('macros, nested comments, includes, lambdas and source map', async () => {
  const result = assemble('( a ( nested ) comment )\n~library.tal\n|0100 TWO #03 ADD { #04 } POP2r BRK', { 'library.tal': '%TWO { #02 }' });
  assert.equal(result.sourceMap[0x100].file, 'library.tal');
  const m = await new Machine().init(wasm); m.load(result.rom); finish(m);
  // JSI skips the anonymous block and leaves its address on the return stack.
  assert.deepEqual(m.stack('wst'), [5]);
});
test('labels, raw and zero-page references resolve', () => {
  const result = assemble('|00 @variable $2 |0100 .variable ;done ,done _done -variable =done @done BRK');
  assert.equal(result.labels.variable, 0);
  assert.equal(result.labels.done, 0x10b);
  assert.deepEqual([...result.rom.slice(0, 5)], [0x80, 0, 0xa0, 1, 0x0b]);
});
test('invalid assembly fails with file and line diagnostics', () => {
  for (const [source, regex] of [
    ['|0100 #gg', /Invalid hexadecimal/], ['|0100 #1', /two or four/],
    ['|0100 missing', /Unknown label/], ['|0100 @a #01 @a', /duplicate label/],
    ['|0100 ,far $100 @far BRK', /out of range/], ['|0100 .far @far BRK', /Zero-page/],
    ['|0100 ( unclosed', /Unclosed comment/], ['|0100 { BRK', /Unclosed lambda/],
    ['|0100 %LOOP { LOOP } LOOP', /recursion/], ['|ffff #1234', /between/],
    ['|0100 #01 |0100 #02', /Overlapping/], ['~missing.tal', /Include not found/],
  ]) assert.throws(() => assemble(source, {}, 'bad.tal'), regex, source);
});
test('pixel drawing, fill directions, foreground transparency and palette', async () => {
  const m = await machine('|0100 BRK'); finish(m); m.resize(8, 8);
  m.setWord(0x28, 2); m.setWord(0x2a, 3); m.pixel(2);
  assert.equal(m.bg[26], 2);
  m.pixel(0x43); assert.equal(m.fg[26], 3);
  m.pixel(0x40); assert.equal(m.fg[26], 0);
  m.pixel(0x91); assert.equal(m.bg[3 * 8], 1); assert.equal(m.bg[3 * 8 + 2], 2);
  const frame = m.frame(); assert.equal(frame.pixels.length, 8 * 8 * 4); assert.equal(frame.pixels[3], 255);
});
test('sprite bitplanes, clipping, flips and auto-address', async () => {
  const m = await machine('|0100 BRK'); m.resize(8, 8);
  m.ram[0x200] = 0x80; m.ram[0x208] = 0x80;
  m.setWord(0x2c, 0x200); m.sprite(0x81);
  assert.equal(m.bg[0], 3);
  m.bg.fill(0); m.setWord(0x2c, 0x200); m.sprite(0x91); assert.equal(m.bg[7], 3);
  m.dev[0x26] = 4; m.setWord(0x2c, 0x200); m.sprite(0x81); assert.equal(m.word(0x2c), 0x210);
  m.setWord(0x28, 0xffff); m.sprite(0x81);
});
test('screen reset, finite dimensions and screenshot data', async () => {
  const m = await machine('|0100 BRK');
  assert.throws(() => m.resize(0, 100), /Unsupported/);
  assert.throws(() => m.resize(2049, 100), /Unsupported/);
  m.resize(1, 1); assert.equal(m.frame().pixels.length, 4);
});
test('virtual file writes, independent reads, stat and delete', async () => {
  const m = await machine(examples.find(e => e.category === 'Files').source);
  finish(m); assert.equal(new TextDecoder().decode(m.files.get('greeting.txt')), 'Made with Uxn.\n');
  m.setWord(0xaa, 4); m.setWord(0xac, 0x400); m.file(0xad);
  assert.equal(new TextDecoder().decode(m.ram.slice(0x400, 0x404)), 'Made');
  m.file(0xad); assert.equal(new TextDecoder().decode(m.ram.slice(0x400, 0x404)), ' wit');
  m.setWord(0xb8, m.word(0xa8)); m.file(0xb9); m.setWord(0xba, 4); m.setWord(0xbc, 0x410); m.file(0xbd);
  assert.equal(new TextDecoder().decode(m.ram.slice(0x410, 0x414)), 'Made');
  m.setWord(0xaa, 32); m.setWord(0xa4, 0x420); m.file(0xa5);
  assert.match(new TextDecoder().decode(m.ram.slice(0x420, 0x440)), /^000f greeting.txt/);
  m.file(0xa6); assert.equal(m.files.size, 0); assert.equal(m.word(0xa2), 1);
});
test('System expansion copies between RAM banks', async () => {
  const m = await machine('|0100 BRK'); const address = 0x300;
  m.ram.set([1, 0, 3, 0, 0, 4, 0, 0, 1, 0, 0], address);
  m.ram.set([11, 22, 33], 0x400); m.setWord(2, address); m.expansion();
  assert.deepEqual([...m.ram.slice(0x10000, 0x10003)], [11, 22, 33]);
});
test('audio writes expose sample, pitch, ADSR and stereo volume', async () => {
  let sound;
  const m = await machine(examples.find(e => e.category === 'Audio').source, e => { if (e.type === 'audio') sound = e; });
  finish(m);
  assert.equal(sound.sample.length, 32); assert.equal(sound.pitch, 60); assert.equal(sound.volume, 0xaa); assert.equal(sound.adsr, 0x2484);
});
test('keyboard vector reads controller input', async () => {
  let text = ''; const m = await machine(examples.find(e => e.category === 'Controller').source, e => { if (e.type === 'console') text += e.text; });
  finish(m); m.dev[0x83] = 65; m.vector(0x80); finish(m); assert.equal(text, 'A');
});
test('datetime year is a big-endian short and month is zero based', async () => {
  const m = await machine('|0100 BRK'), date = new Date();
  assert.equal(m.dei(0xc0) << 8 | m.dei(0xc1), date.getFullYear()); assert.equal(m.dei(0xc2), date.getMonth());
});
test('System stack-pointer ports reflect live depth and can clear stacks', async () => {
  const m = await machine('|0100 #aa #bb #04 DEI BRK'); finish(m);
  assert.deepEqual(m.stack('wst'), [0xaa, 0xbb, 2]);
  const reset = await machine('|0100 #aa #bb #00 #04 DEO #cc BRK'); finish(reset);
  assert.deepEqual(reset.stack('wst'), [0xcc]);
  const r = await machine('|0100 #aabb STH2 #05 DEI #00 #05 DEO BRK'); finish(r);
  assert.deepEqual(r.stack('wst'), [2]); assert.deepEqual(r.stack('rst'), []);
});
test('audio pitch and ADSR use Varvara sample clock', () => {
  const a = voiceParameters({ sample: new Uint8Array(512), pitch: 60, adsr: 0xf000 });
  assert.equal(a.rate, 1); assert.equal(a.duration, 1);
  const b = voiceParameters({ sample: new Uint8Array(32), pitch: 72, adsr: 0 });
  assert.ok(Math.abs(b.rate - 64 / 168.5) < .001);
});
test('muted audio still updates ports and fires completion vectors', async () => {
  const events = [], engine = new AudioEngine(e => events.push(e));
  engine.play({ channel: 0, sample: new Uint8Array(512), pitch: 188, adsr: 0, volume: 0xff });
  await new Promise(resolve => setTimeout(resolve, 50)); engine.stop();
  assert.ok(events.some(e => e.type === 'audio-end' && e.channel === 0));
});
