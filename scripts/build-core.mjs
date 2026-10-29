import { readFile, mkdir, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Instrument the MIT-licensed upstream core at build time, preserving its opcodes.
// Each evaluation can yield between instructions without losing either stack.
let source = await readFile(new URL('../vendor/uxn.wat', import.meta.url), 'utf8');
source = source
  .replace('(param $pc i32)', '(param $pc i32) (param $budget i32)')
  .replace('(loop $loop', `(loop $loop
        (if (i32.eqz (local.get $budget)) (then (br $endLoop)))
        (local.set $budget (i32.sub (local.get $budget) (i32.const 1)))`)
  .replace('(br $endLoop)\n\n        );;', '(local.set $pc (i32.const 0))\n        (br $endLoop)\n\n        );;')
  .replace('(global.set $wstp (local.get $wstp))', '(global.set $remaining (local.get $budget))\n    (global.set $pc (local.get $pc))\n    (global.set $wstp (local.get $wstp))')
  .replace('(func $reset (export "reset")', '(global $pc (export "pc") (mut i32) (i32.const 0))\n  (global $remaining (export "remaining") (mut i32) (i32.const 0))\n  (func $reset (export "reset")\n    (global.set $pc (i32.const 0))');
source = source
  .replace('(global $wstp (mut', '(global $wstp (export "wstIndex") (mut')
  .replace('(global $rstp (mut', '(global $rstp (export "rstIndex") (mut');
let opcode = '';
source = source.split('\n').map(line => {
  const heading = line.match(/;;; ([A-Z]{3}[2rk]*) /);
  if (heading) opcode = heading[1];
  if (!line.includes('(call $dei') && !line.includes('(call $deo')) return line;
  const reading = line.includes('(call $dei');
  const active = opcode.includes('r') ? 'rstp' : 'wstp', outputSize = opcode.includes('2') ? 2 : 1;
  // DEI reads after popping the port and before pushing its result. DEO may
  // change System's stack-pointer ports, so copy those changes back to locals.
  const sync = ['wstp', 'rstp'].map(name =>
    `(global.set $${name} ${reading && name === active ? `(i32.and (i32.add (local.get $${name}) (i32.const ${outputSize})) (i32.const 255))` : `(local.get $${name})`})`,
  ).join('\n');
  const restore = reading ? '' : '\n(local.set $wstp (global.get $wstp))\n(local.set $rstp (global.get $rstp))';
  return sync + '\n' + line + restore;
}).join('\n');
const dir = await mkdtemp(join(tmpdir(), 'ux-core-'));
const input = join(dir, 'uxn.wat');
await writeFile(input, source);
try {
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  execFileSync('wat2wasm', [input, '-o', new URL('../public/uxn.wasm', import.meta.url).pathname]);
} finally {
  await unlink(input);
  await rmdir(dir);
}
