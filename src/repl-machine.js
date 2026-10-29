import { assemble } from './assembler.js';
import { Machine } from './machine.js';

const INSTRUCTION_LIMIT = 1000000;
const OUTPUT_LIMIT = 64000;
const SOURCE_LIMIT = 262144;

export class ReplMachine {
  constructor() {
    this.machine = new Machine(event => this.capture(event));
  }
  async init(bytes) {
    await this.machine.init(bytes);
    this.machine.load(new Uint8Array([0]));
    this.machine.pc = 0;
    this.sources = {};
    this.program = '';
    this.sourceBytes = 0;
    this.written = new Set();
    this.next = 0x100;
    this.running = false;
    this.output = [];
    this.outputLength = 0;
    return this;
  }
  capture(event) {
    if (!['console', 'warning', 'debug'].includes(event.type)) return;
    const text = event.type === 'console' ? event.text : event.text + '\n';
    const remaining = OUTPUT_LIMIT - this.outputLength;
    if (remaining > 0) {
      const error = !!event.error || event.type === 'warning';
      const previous = this.output.at(-1);
      if (previous?.error === error) previous.text += text.slice(0, remaining);
      else this.output.push({ text: text.slice(0, remaining), error });
    }
    if (this.outputLength <= OUTPUT_LIMIT && text.length > remaining) {
      this.output.push({ text: '\nOutput truncated at 64,000 characters for this submission.\n', error: true });
    }
    this.outputLength += text.length;
  }
  drainOutput() {
    const output = this.output;
    this.output = [];
    return output;
  }
  submit(source) {
    if (this.running) throw new Error('A snippet is already running. Stop it before evaluating another.');
    if (this.machine.dev[15]) throw new Error('Scratch machine halted. Reset REPL before evaluating another snippet.');
    if (!source.trim()) throw new Error('Enter Uxntal to evaluate, for example #03 #04 ADD.');
    if (source.length > 32768) throw new Error('A snippet is limited to 32,768 characters.');
    if (this.next >= 0x10000) throw new Error('Scratch code memory is full. Reset REPL to start a new session.');
    const filename = `repl-${Object.keys(this.sources).length + 1}.tal`;
    const sources = { ...this.sources, [filename]: source };
    const program = this.program + `~${filename}\nBRK\n`;
    const sourceBytes = this.sourceBytes + new TextEncoder().encode(source).length + program.length - this.program.length;
    if (sourceBytes > SOURCE_LIMIT) throw new Error('REPL source history reached 256 KiB. Reset REPL to start a new session.');
    const result = assemble(program, sources, 'repl.tal');
    const last = 0xff + result.rom.length;
    if (result.rom.at(-1) !== 0 || result.sourceMap[last]?.file !== 'repl.tal') {
      throw new Error('BRK is reserved for REPL entry termination. Do not define a BRK macro or pad beyond the entry terminator.');
    }
    const addresses = Object.keys(result.sourceMap).map(Number);
    if (addresses.some(address => address < this.next && !this.written.has(address))) {
      throw new Error('REPL code is append-only. Do not write below the next code address; use STZ or STA to change memory.');
    }
    // Install only new code, preserving RAM writes and both stacks from earlier submissions.
    this.machine.ram.set(result.rom.subarray(this.next - 0x100), this.next);
    this.machine.pc = this.next;
    this.next = 0x100 + result.rom.length;
    this.sources = sources;
    this.program = program;
    this.sourceBytes = sourceBytes;
    this.written = new Set(addresses);
    this.outputLength = 0;
    this.startedAt = this.machine.instructions;
    this.running = true;
  }
  advance() {
    this.machine.run(Math.min(10000, INSTRUCTION_LIMIT - (this.machine.instructions - this.startedAt)));
    this.running = !!this.machine.pc;
    if (this.running && this.machine.instructions - this.startedAt >= INSTRUCTION_LIMIT) {
      this.stop();
      throw new Error('Stopped after 1,000,000 instructions. Partial stack and memory changes remain; edit the snippet or Reset REPL.');
    }
    return this.running;
  }
  stop() {
    this.running = false;
    this.machine.pc = 0;
  }
  snapshot() {
    return { running: this.running, halted: !!this.machine.dev[15], next: this.next,
      wst: this.machine.stack('wst'), rst: this.machine.stack('rst') };
  }
}
