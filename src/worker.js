import { Machine } from './machine.js';
import { assemble } from './assembler.js';

let machine, rom, running = false, timer, memoryStart = 0x100, breakpoints = new Set(), skipBreakpoint = false;
let inputQueue = [];
const send = data => self.postMessage(data);
const ready = (async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}uxn.wasm`);
  if (!response.ok) throw new Error(`WASM download failed (${response.status})`);
  machine = await new Machine(send).init(await response.arrayBuffer());
})();
function inspect() {
  send({ type: 'state', running, pc: machine.pc, instructions: machine.instructions, halted: !!machine.dev[15],
    wst: machine.stack('wst'), rst: machine.stack('rst'), dev: machine.dev.slice(),
    memory: machine.ram.slice(memoryStart, memoryStart + 256), memoryStart });
  if (machine.dirty && (!machine.pc || !running)) send(machine.frame());
}
function advance() {
  if (!machine.pc && inputQueue.length) {
    const event = inputQueue.shift();
    for (const [port, value] of event.values) machine.dev[port] = value;
    machine.vector(event.vector);
  }
  if (breakpoints.size) {
    for (let i = 0; i < 10000 && machine.pc; i++) {
      if (breakpoints.has(machine.pc) && !skipBreakpoint) { running = false; send({ type: 'breakpoint', pc: machine.pc }); break; }
      skipBreakpoint = false; machine.run(1);
    }
  } else machine.run(500000);
}
function tick() {
  clearTimeout(timer);
  if (!running) return;
  try {
    if (!machine.pc && !inputQueue.length) machine.vector(0x20);
    advance();
    if (machine.dev[15]) running = false;
    inspect();
    if (running) timer = setTimeout(tick, machine.pc ? 0 : 16);
  } catch (error) { stop(error); }
}
function stop(error) {
  running = false; clearTimeout(timer);
  send({ type: 'error', message: error.message }); if (machine?.core) inspect();
}
self.onmessage = async ({ data }) => {
  try {
    await ready;
    switch (data.type) {
      case 'load': {
        running = false; clearTimeout(timer); inputQueue = [];
        const result = data.rom ? { rom: new Uint8Array(data.rom), labels: {}, sourceMap: {} } : assemble(data.source, data.files, data.name);
        rom = result.rom;
        machine.files = new Map((data.virtualFiles || []).map(([name, bytes]) => [name, new Uint8Array(bytes)]));
        machine.load(rom);
        breakpoints = new Set(data.breakpoints || []);
        for (const location of data.lineBreakpoints || []) {
          const [file, line] = location.split(':');
          const address = Object.keys(result.sourceMap).find(a => result.sourceMap[a].file === file && result.sourceMap[a].line === Number(line));
          if (address) breakpoints.add(Number(address));
        }
        skipBreakpoint = false;
        send({ type: 'assembled', ...result });
        running = data.run; inspect(); if (running) tick(); break;
      }
      case 'run': running = true; skipBreakpoint = true; tick(); break;
      case 'pause': running = false; clearTimeout(timer); inspect(); break;
      case 'step':
        running = false; clearTimeout(timer);
        if (!machine.pc) machine.vector(0x20);
        machine.run(1); inspect(); break;
      case 'reset':
        running = false; clearTimeout(timer); inputQueue = []; machine.load(rom); inspect(); break;
      case 'inspect': memoryStart = data.address & 0xff00; inspect(); break;
      case 'breakpoints': breakpoints = new Set(data.addresses); break;
      case 'input':
        if (inputQueue.length < 1024) inputQueue.push(data);
        if (running && !machine.pc) advance();
        break;
      case 'audio-state': Object.assign(machine.audio[data.channel], data.state); break;
      case 'audio-end': inputQueue.push({ values: [], vector: 0x30 + data.channel * 16 }); break;
      case 'file': machine.files.set(data.name, new Uint8Array(data.data)); break;
      case 'delete-file': machine.files.delete(data.name); break;
    }
  } catch (error) { stop(error); }
};
