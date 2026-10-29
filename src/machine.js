const BLEND = [
  [0, 0, 0, 0, 1, 0, 1, 1, 2, 2, 0, 2, 3, 3, 3, 0],
  [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
  [1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1],
  [2, 3, 1, 2, 2, 3, 1, 2, 2, 3, 1, 2, 2, 3, 1, 2],
];
const signed = n => n & 0x8000 ? n - 0x10000 : n;
export class Machine {
  constructor(events = () => {}) {
    this.events = events;
    this.files = new Map();
    this.fileHandles = {};
    this.audio = Array.from({ length: 4 }, () => ({ end: 0, position: 0, level: 0 }));
    this.width = 512; this.height = 320; this.dirty = true;
    this.bg = new Uint8Array(this.width * this.height); this.fg = this.bg.slice();
    this.instructions = 0;
  }
  async init(bytes) {
    this.core = (await WebAssembly.instantiate(bytes, { system: {
      deo: (p, v) => this.deo(p, v), dei: p => this.dei(p),
    } })).instance.exports;
    this.ram = new Uint8Array(this.core.memory.buffer, 0, 0x100000);
    this.dev = new Uint8Array(this.core.memory.buffer, 0x100200, 256);
    return this;
  }
  word(p) { return this.dev[p] << 8 | this.dev[(p + 1) & 255]; }
  setWord(p, v) { this.dev[p] = v >> 8; this.dev[(p + 1) & 255] = v; }
  load(rom) {
    if (!rom.length || rom.length > 0xff00) throw new Error('ROM must contain 1–65,280 bytes');
    this.core.reset(); this.ram.set(rom, 0x100); this.pc = 0x100;
    this.instructions = 0; this.fileHandles = {};
    this.resize(512, 320);
    this.setWord(8, 0x0f6f); this.setWord(10, 0x0d9f); this.setWord(12, 0x0bdf);
    this.audio.forEach(a => { a.end = 0; a.level = 0; });
  }
  resize(w, h) {
    if (w < 1 || h < 1 || w > 2048 || h > 2048) throw new Error(`Unsupported screen size ${w} × ${h}; use 1–2048`);
    this.width = w; this.height = h;
    this.bg = new Uint8Array(w * h); this.fg = this.bg.slice();
    this.setWord(0x22, w); this.setWord(0x24, h); this.dirty = true;
  }
  run(budget = 50000) {
    if (!this.pc || this.dev[15]) return false;
    this.core.eval(this.pc, budget);
    this.pc = this.core.pc.value & 65535;
    this.instructions += budget - this.core.remaining.value;
    if (this.dev[15]) this.pc = 0;
    return !!this.pc;
  }
  vector(port) { if (!this.pc && !this.dev[15]) this.pc = this.word(port); }
  stack(which) {
    const pointer = this.core[which + 'p']();
    const size = (256 - pointer) & 255;
    const bytes = new Uint8Array(this.core.memory.buffer, which === 'wst' ? 0x100000 : 0x100100, 256);
    return Array.from({ length: size }, (_, i) => bytes[255 - i]);
  }
  dei(p) {
    if (p === 4) return (256 - this.core.wstp()) & 255;
    if (p === 5) return (256 - this.core.rstp()) & 255;
    if (p >= 0xc0 && p <= 0xca) {
      const d = new Date(), year = d.getFullYear();
      const start = new Date(year, 0, 1);
      const day = Math.floor((Date.UTC(year, d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1)) / 86400000);
      const dst = d.getTimezoneOffset() < Math.max(start.getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset()) ? 1 : 0;
      return [year >> 8, year & 255, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay(), day >> 8, day & 255, dst][p - 0xc0];
    }
    if (p >= 0x30 && p < 0x70 && (p & 15) >= 2 && (p & 15) <= 4) {
      const a = this.audio[(p >> 4) - 3];
      return (p & 15) === 2 ? a.position >> 8 : (p & 15) === 3 ? a.position & 255 : a.level;
    }
    return this.dev[p];
  }
  deo(p, value) {
    this.dev[p] = value;
    if (p === 4) this.core.wstIndex.value = (256 - value) & 255;
    if (p === 5) this.core.rstIndex.value = (256 - value) & 255;
    if (p >= 8 && p <= 13) this.dirty = true;
    if (p === 3) this.expansion();
    if (p === 0x18 || p === 0x19) this.events({ type: 'console', text: String.fromCharCode(value), error: p === 0x19 });
    if (p === 0x0e) this.events({ type: 'debug', text: 'System debug requested' });
    if (p === 0x23) this.resize(this.word(0x22), this.height);
    if (p === 0x25) this.resize(this.width, this.word(0x24));
    if (p === 0x2e) this.pixel(value);
    if (p === 0x2f) this.sprite(value);
    if (p >= 0x30 && p < 0x70 && (p & 15) === 15) this.play(p & 0xf0);
    if (p >= 0xa0 && p < 0xc0) this.file(p);
  }
  expansion() {
    const address = this.word(2), r = this.ram;
    const word = p => r[p & 65535] << 8 | r[(p + 1) & 65535];
    if (r[address] !== 1) { this.events({ type: 'warning', text: 'Unsupported System expansion command' }); return; }
    const length = word(address + 1), from = word(address + 3) * 65536 + word(address + 5), to = word(address + 7) * 65536 + word(address + 9);
    if (from + length > r.length || to + length > r.length) throw new Error('System expansion copy exceeds the 1 MiB memory');
    r.copyWithin(to, from, from + length);
  }
  put(layer, x, y, color) {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) layer[x + y * this.width] = color;
  }
  pixel(ctrl) {
    const layer = ctrl & 64 ? this.fg : this.bg, color = ctrl & 3;
    const x = signed(this.word(0x28)), y = signed(this.word(0x2a)), auto = this.dev[0x26];
    if (ctrl & 128) {
      const x1 = Math.max(0, ctrl & 16 ? 0 : x), x2 = Math.min(this.width, ctrl & 16 ? x : this.width);
      const y1 = Math.max(0, ctrl & 32 ? 0 : y), y2 = Math.min(this.height, ctrl & 32 ? y : this.height);
      if (x2 > x1) for (let row = y1; row < y2; row++) layer.fill(color, row * this.width + x1, row * this.width + x2);
    } else {
      this.put(layer, x, y, color);
      if (auto & 1) this.setWord(0x28, x + (ctrl & 16 ? -1 : 1));
      if (auto & 2) this.setWord(0x2a, y + (ctrl & 32 ? -1 : 1));
    }
    this.dirty = true;
  }
  sprite(ctrl) {
    const layer = ctrl & 64 ? this.fg : this.bg, blend = ctrl & 15, two = !!(ctrl & 128);
    const auto = this.dev[0x26], dx = ctrl & 16 ? -1 : 1, dy = ctrl & 32 ? -1 : 1;
    const ox = signed(this.word(0x28)), oy = signed(this.word(0x2a));
    let address = this.word(0x2c);
    for (let n = 0; n <= (auto >> 4); n++) {
      const x = ox + n * (auto & 2 ? 8 * dx : 0), y = oy + n * (auto & 1 ? 8 * dy : 0);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const ry = dy < 0 ? 7 - row : row, bit = dx < 0 ? col : 7 - col;
        const color = (this.ram[(address + ry) & 65535] >> bit & 1) | (two ? (this.ram[(address + ry + 8) & 65535] >> bit & 1) << 1 : 0);
        if (color || blend % 5) this.put(layer, x + col, y + row, BLEND[color][blend]);
      }
      if (auto & 4) address = (address + (two ? 16 : 8)) & 65535;
    }
    if (auto & 1) this.setWord(0x28, ox + 8 * dx);
    if (auto & 2) this.setWord(0x2a, oy + 8 * dy);
    this.setWord(0x2c, address); this.dirty = true;
  }
  frame() {
    const palette = Array.from({ length: 4 }, (_, i) => [8, 10, 12].map(p => (this.word(p) >> (12 - i * 4) & 15) * 17));
    const pixels = new Uint8ClampedArray(this.bg.length * 4);
    for (let i = 0; i < this.bg.length; i++) {
      pixels.set(palette[this.fg[i] || this.bg[i]], i * 4); pixels[i * 4 + 3] = 255;
    }
    this.dirty = false;
    return { type: 'frame', width: this.width, height: this.height, pixels };
  }
  play(base) {
    const length = this.word(base + 10), address = this.word(base + 12), pitch = this.dev[base + 15];
    const sample = Uint8Array.from({ length }, (_, i) => this.ram[(address + i) & 65535]);
    this.events({ type: 'audio', channel: (base >> 4) - 3, pitch, detune: this.dev[base + 5], volume: this.dev[base + 14], adsr: this.word(base + 8), sample });
  }
  filename(base) {
    let name = '', p = this.word(base + 8);
    for (let i = 0; i < 4096; i++) {
      const c = this.ram[(p + i) & 65535]; if (!c) return name.replace(/^\.?\//, '');
      name += String.fromCharCode(c);
    }
    throw new Error('File name is not null-terminated');
  }
  file(port) {
    const base = port & 0xf0, op = port & 15;
    if (![5, 6, 9, 13, 15].includes(op)) return;
    const name = this.filename(base);
    if (op === 9) { this.fileHandles[base] = { name, offset: 0 }; return; }
    const handle = this.fileHandles[base] ||= { name, offset: 0 };
    const size = this.word(base + 10);
    let count = 0;
    if (op === 6) {
      count = this.files.delete(name) ? 1 : 0;
      if (count) this.events({ type: 'file', name, deleted: true });
    }
    if (op === 5) {
      const data = this.files.get(name), directory = [...this.files.keys()].some(n => n.startsWith(name + '/'));
      const text = data ? `${data.length <= 0xffff ? data.length.toString(16).padStart(4, '0') : '????'} ${name.split('/').pop()}\n` : directory ? `---- ${name.split('/').pop()}\n` : '';
      const bytes = new TextEncoder().encode(text), address = this.word(base + 4);
      count = Math.min(size, bytes.length);
      for (let i = 0; i < count; i++) this.ram[(address + i) & 65535] = bytes[i];
    }
    if (op === 13) {
      if (handle.mode !== 'read') { handle.offset = 0; handle.mode = 'read'; }
      let data = this.files.get(name);
      if (!data) {
        const prefix = !name || name === '.' ? '' : name.replace(/\/$/, '') + '/';
        const entries = new Map();
        for (const [path, bytes] of [...this.files].sort()) if (path.startsWith(prefix)) {
          const rest = path.slice(prefix.length), first = rest.split('/')[0];
          entries.set(first, rest.includes('/') ? `---- ${first}/\n` : `${bytes.length > 65535 ? '????' : bytes.length.toString(16).padStart(4, '0')} ${first}\n`);
        }
        data = new TextEncoder().encode([...entries.values()].join(''));
      }
      const address = this.word(base + 12);
      count = Math.min(size, Math.max(0, data.length - handle.offset));
      for (let i = 0; i < count; i++) this.ram[(address + i) & 65535] = data[handle.offset + i];
      handle.offset += count;
    }
    if (op === 15) {
      if (!name || name.includes('..') || name.startsWith('/')) throw new Error('Use a relative virtual file path without ..');
      const old = this.files.get(name) || new Uint8Array();
      if (handle.mode !== 'write') { handle.offset = 0; handle.mode = 'write'; }
      const offset = this.dev[base + 7] ? old.length : handle.offset;
      if (offset + size > 16 * 1024 * 1024) throw new Error('Virtual files are limited to 16 MiB each');
      const data = new Uint8Array(Math.max(offset + size, handle.offset ? old.length : 0));
      data.set(old.subarray(0, data.length));
      const address = this.word(base + 14);
      for (let i = 0; i < size; i++) data[offset + i] = this.ram[(address + i) & 65535];
      count = size; handle.offset = offset + size; this.files.set(name, data);
      this.events({ type: 'file', name, data });
    }
    this.setWord(base + 2, count);
  }
}
