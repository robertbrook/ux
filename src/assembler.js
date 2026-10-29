export const OPCODES = 'LIT INC POP NIP SWP ROT DUP OVR EQU NEQ GTH LTH JMP JCN JSR STH LDZ STZ LDR STR LDA STA DEI DEO ADD SUB MUL DIV AND ORA EOR SFT'.split(' ');
export function instruction(byte) {
  if (!(byte & 31)) return ['BRK', 'JCI', 'JMI', 'JSI', 'LIT', 'LIT2', 'LITr', 'LIT2r'][byte >> 5];
  return OPCODES[byte & 31] + (byte & 32 ? '2' : '') + (byte & 64 ? 'r' : '') + (byte & 128 ? 'k' : '');
}

export function assemble(source, files = {}, filename = 'main.tal') {
  const memory = new Uint8Array(0x10000), written = new Set(), labels = new Map(), macros = new Map();
  const refs = [], sourceMap = {}, lambdas = [];
  let pc = 0x100, end = 0x100, scope = '', operations = 0;
  const fail = (t, message) => { throw new Error(`${t.file}:${t.line}: ${message}`); };
  function tokenize(text, file) {
    const result = [];
    let line = 1, depth = 0;
    for (const token of text.matchAll(/\n|[^\s]+/g)) {
      if (token[0] === '\n') { line++; continue; }
      if (token[0] === '(') { depth++; continue; }
      if (depth) { if (token[0] === ')') depth--; continue; }
      if (token[0] === ')') fail({ file, line }, 'Unexpected closing comment');
      result.push({ value: token[0], file, line });
    }
    if (depth) fail({ file, line }, 'Unclosed comment; comments use separate ( and ) tokens');
    return result;
  }
  const hex = (s, t) => {
    if (!/^[\da-f]{1,4}$/i.test(s)) fail(t, `Invalid hexadecimal value: ${s}`);
    return parseInt(s, 16);
  };
  const name = s => s.startsWith('&') ? scope + '/' + s.slice(1) : s;
  function emit(bytes, t) {
    for (const b of bytes) {
      if (pc < 0x100 || pc > 0xffff) fail(t, 'ROM writes must be between 0100 and ffff');
      if (written.has(pc)) fail(t, `Overlapping write at ${pc.toString(16)}`);
      written.add(pc); memory[pc] = b; sourceMap[pc++] = { file: t.file, line: t.line };
    }
    end = Math.max(end, pc);
  }
  function define(label, t) {
    if (!label || /^[\da-f]{2}$|^[\da-f]{4}$/i.test(label) || labels.has(label)) fail(t, `Invalid or duplicate label: ${label}`);
    labels.set(label, pc);
  }
  function reference(type, label, t) {
    const prefix = { ',': [0x80], '.': [0x80], ';': [0xa0], '!': [0x40], '?': [0x20], '': [0x60] }[type] || [];
    emit(prefix, t);
    refs.push({ type, label: name(label), address: pc, token: t });
    emit([';', '=', '!', '?', ''].includes(type) ? [0, 0] : [0], t);
  }
  function process(tokens, depth = 0, includes = []) {
    if (depth > 64) fail(tokens[0] || { file: filename, line: 1 }, 'Macro/include recursion is too deep');
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i], v = t.value, rune = v[0], tail = v.slice(1);
      if (++operations > 200000) fail(t, 'Assembly expansion exceeds 200,000 tokens');
      if (v === '[' || v === ']') continue;
      if (rune === '%') {
        if (macros.has(tail)) fail(t, `Duplicate macro: ${tail}`);
        if (tokens[++i]?.value !== '{') fail(t, 'A macro must start with {');
        const body = [];
        let nesting = 1;
        while (++i < tokens.length) {
          if (['{', '?{'].includes(tokens[i].value)) nesting++;
          if (tokens[i].value === '}') nesting--;
          if (!nesting) break;
          body.push(tokens[i]);
        }
        if (nesting) fail(t, 'Unclosed macro');
        macros.set(tail, body); continue;
      }
      if (rune === '~') {
        if (!Object.hasOwn(files, tail)) fail(t, `Include not found: ${tail}`);
        if (includes.includes(tail)) fail(t, `Circular include: ${tail}`);
        process(tokenize(files[tail], tail), depth + 1, [...includes, tail]); continue;
      }
      if (macros.has(v)) { process(macros.get(v), depth + 1, includes); continue; }
      if (v === '{' || v === '?{') {
        emit([v === '{' ? 0x60 : 0x20], t);
        lambdas.push({ address: pc, token: t }); emit([0, 0], t); continue;
      }
      if (v === '}') {
        const lambda = lambdas.pop();
        if (!lambda) fail(t, 'Unexpected lambda end');
        const offset = pc - lambda.address - 2;
        memory[lambda.address] = offset >> 8; memory[lambda.address + 1] = offset; continue;
      }
      if (rune === '|') { pc = hex(tail, t); continue; }
      if (rune === '$') { pc += hex(tail, t); if (pc > 0x10000) fail(t, 'Padding exceeds memory'); end = Math.max(end, pc); continue; }
      if (rune === '@') { scope = tail; define(tail, t); continue; }
      if (rune === '&') { define(name(v), t); continue; }
      if (rune === '#') {
        if (![2, 4].includes(tail.length)) fail(t, 'Literal must have two or four hex digits');
        const n = hex(tail, t); emit(tail.length === 2 ? [0x80, n] : [0xa0, n >> 8, n], t); continue;
      }
      if (rune === '"') { emit(new TextEncoder().encode(tail), t); continue; }
      if (',.;_-=!?'.includes(rune)) { reference(rune, tail, t); continue; }
      if (v === 'BRK') { emit([0], t); continue; }
      const base = OPCODES.indexOf(v.slice(0, 3));
      if (base >= 0 && /^[2rk]*$/.test(v.slice(3))) {
        emit([base | (base === 0 ? 128 : 0) | (v.includes('2') ? 32 : 0) | (v.includes('r') ? 64 : 0) | (v.includes('k') ? 128 : 0)], t); continue;
      }
      if (/^(?:[\da-f]{2}|[\da-f]{4})$/i.test(v)) {
        const n = hex(v, t); emit(v.length === 2 ? [n] : [n >> 8, n], t); continue;
      }
      reference('', v, t);
    }
  }
  process(tokenize(source, filename));
  if (lambdas.length) fail(lambdas[0].token, 'Unclosed lambda');
  for (const r of refs) {
    const target = labels.get(r.label);
    if (target === undefined) fail(r.token, `Unknown label: ${r.label}`);
    let value = target;
    if ([',', '_'].includes(r.type)) {
      value = target - r.address - 2;
      if (value < -128 || value > 127) fail(r.token, `Relative reference out of range: ${r.label}`);
    }
    if (['.', '-'].includes(r.type) && target > 255) fail(r.token, `Zero-page reference out of range: ${r.label}`);
    if (['', '!', '?'].includes(r.type)) value = target - r.address - 2;
    if ([';', '=', '', '!', '?'].includes(r.type)) { memory[r.address] = value >> 8; memory[r.address + 1] = value; }
    else memory[r.address] = value;
  }
  return { rom: memory.slice(0x100, end), labels: Object.fromEntries(labels), sourceMap };
}
