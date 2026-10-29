import './style.css';
import { examples } from './examples.js';
import { instruction } from './assembler.js';
import { referenceHTML, deviceNames } from './reference.js';
import { AudioEngine } from './audio.js';

const $ = id => document.getElementById(id);
const hex = (n, size = 2) => (n || 0).toString(16).padStart(size, '0');
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const key = 'ux-workbench-v1';
const source = $('source'), screen = $('screen'), context = screen.getContext('2d');
let store, current, worker, compiled, state, sourceMap = {}, labels = {}, breakpoints = new Set(), lineBreakpoints = new Set();
let activeTab = 'console', consoleText = '', buildTime = 0, loaded = false, saveTimer, memoryPage = 0x100;
let buttons = 0, mouseButtons = 0, loadingTimer, lastFrame, saveBlocked = false, startupError = '', recoveryData = '';
const audio = new AudioEngine(message => worker?.postMessage(message));
function report(message, error = false) {
  $('notice').textContent = message; $('notice').hidden = !message;
  $('notice').style.background = error ? '#fae7e2' : '#e5ecfa';
  $('notice').style.color = error ? '#8d2921' : '#24447b';
}
function log(text, kind = '') {
  const atBottom = $('console').scrollHeight - $('console').scrollTop - $('console').clientHeight < 30;
  const span = document.createElement('span'); span.className = kind; span.textContent = text;
  $('console').append(span); consoleText += text;
  while ($('console').childNodes.length > 2000) $('console').firstChild.remove();
  if (consoleText.length > 64000) consoleText = consoleText.slice(-64000);
  if (atBottom) $('console').scrollTop = $('console').scrollHeight;
  $('console-count').textContent = String(consoleText.split('\n').length - 1);
}
function freshProject(name, file = 'main.tal', text = '|0100\n  #41 #18 DEO\nBRK\n') {
  return { id: crypto.randomUUID(), name, entry: file, active: file, sources: { [file]: text }, files: {}, rom: null };
}
function persist() {
  clearTimeout(saveTimer);
  if (!current) return;
  if (!current.rom) current.sources[current.active] = source.value;
  store.current = current.id;
  if (saveBlocked) { $('save-status').textContent = 'Saving blocked — export a backup'; return; }
  try {
    localStorage.setItem(key, JSON.stringify(store));
    $('save-status').textContent = 'Saved locally'; $('save-status').style.color = '#34674f';
  } catch (error) {
    $('save-status').textContent = 'Not saved — export a backup'; $('save-status').style.color = '#a52e26';
    report(`Browser storage failed: ${error.message}. Export your project now to preserve changes.`, true);
  }
}
function scheduleSave() { $('save-status').textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); }
function validProject(p) {
  if (!p || typeof p.name !== 'string' || !p.sources || typeof p.sources !== 'object' || Array.isArray(p.sources)) throw new Error('Project needs a name and a sources object');
  const entries = Object.entries(p.sources);
  if (!entries.length || entries.some(([name, text]) => !validName(name) || typeof text !== 'string')) throw new Error('Source files need valid relative names and text');
  if (!Object.hasOwn(p.sources, p.entry)) throw new Error('Project entry file does not exist');
  if (!p.files || typeof p.files !== 'object' || Array.isArray(p.files)) throw new Error('Project files must be an object');
  for (const [name, data] of Object.entries(p.files)) {
    if (!validName(name) || typeof data !== 'string') throw new Error('Invalid virtual file');
    decode(data);
  }
  if (p.rom) { const bytes = decode(p.rom); if (!bytes.length || bytes.length > 0xff00) throw new Error('Invalid ROM size'); }
  return { id: p.id || crypto.randomUUID(), name: p.name.slice(0, 100), sources: { ...p.sources }, entry: p.entry,
    active: Object.hasOwn(p.sources, p.active) ? p.active : p.entry, files: { ...p.files }, rom: p.rom || null };
}
function validName(name) { return /^[\w./ -]+$/.test(name) && !name.startsWith('/') && !name.split('/').includes('..') && !['__proto__', 'constructor', 'prototype'].includes(name); }
function renderProjects() {
  $('projects').replaceChildren(...store.projects.map(p => new Option(p.name, p.id, false, p.id === current.id)));
  $('project-title').textContent = current.name;
}
function renderFiles() {
  $('source-files').replaceChildren();
  for (const name of Object.keys(current.sources)) {
    const row = document.createElement('div'); row.className = 'file-row' + (name === current.active ? ' active' : '');
    const button = document.createElement('button'); button.textContent = name; button.title = `${name}${name === current.entry ? ' (entry file)' : ' — double-click to set as entry'}`;
    button.onclick = () => { persist(); current.active = name; source.value = current.sources[name]; renderEditor(); renderFiles(); persist(); };
    button.ondblclick = () => { current.entry = name; renderFiles(); renderEditor(); persist(); report(`Entry file set to ${name}`); };
    row.append(button);
    if (name !== current.entry && !current.rom) {
      const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${name}`);
      remove.onclick = async () => {
        if (!await confirmAction(`Delete ${name}?`, 'The source file will be removed from this project.')) return;
        delete current.sources[name]; if (current.active === name) { current.active = current.entry; source.value = current.sources[current.entry]; }
        renderFiles(); renderEditor(); persist();
      }; row.append(remove);
    } else { const marker = document.createElement('span'); marker.textContent = '•'; marker.title = 'Entry file'; marker.style.paddingRight = '8px'; row.append(marker); }
    $('source-files').append(row);
  }
}
function renderEditor() {
  $('filename').textContent = current.active; source.readOnly = !!current.rom;
  $('entry-label').textContent = current.rom ? 'Imported ROM · source unavailable' : `Entry · ${current.entry} · 0100`;
  $('download-source').disabled = !!current.rom;
  highlight(); cursor();
}
function highlight() {
  const tokens = source.value.match(/\s+|[^\s]+/g) || [];
  let depth = 0;
  $('highlight').firstElementChild.innerHTML = tokens.map(token => {
    let kind = '';
    if (token === '(') depth++;
    if (depth) kind = 'comment';
    else if (/^[@&%;.,]/.test(token)) kind = 'label';
    else if (/^#|^(?:[\da-f]{2}|[\da-f]{4})$/i.test(token)) kind = 'literal';
    else if (token.startsWith('"')) kind = 'string';
    else if (/^[A-Z]{3}[2rk]*$/.test(token)) kind = 'opcode';
    if (token === ')' && depth) depth--;
    return kind ? `<span class="${kind}">${escape(token)}</span>` : escape(token);
  }).join('') + '\n';
  const count = source.value.split('\n').length;
  $('gutter').innerHTML = Array.from({ length: count }, (_, i) => `<button type="button" data-line="${i + 1}" title="Toggle breakpoint on line ${i + 1}" aria-label="Toggle breakpoint on line ${i + 1}" class="${lineBreakpoints.has(`${current.active}:${i + 1}`) ? 'breakpoint' : ''}">${i + 1}</button>`).join('');
  syncScroll(); highlightPC();
}
function highlightPC() {
  $('gutter').querySelector('.current')?.classList.remove('current');
  const location = sourceMap[state?.pc];
  if (location?.file === current.active && !state?.running) $('gutter').querySelector(`[data-line="${location.line}"]`)?.classList.add('current');
}
function syncScroll() {
  $('highlight').scrollTop = source.scrollTop; $('highlight').scrollLeft = source.scrollLeft;
  $('gutter').scrollTop = source.scrollTop;
}
function cursor() {
  const before = source.value.slice(0, source.selectionStart), lines = before.split('\n');
  $('cursor-position').textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
}
function activateProject(project, autoRun = false) {
  audio.stop(); worker?.terminate(); clearTimeout(loadingTimer); worker = null;
  current = project; loaded = false; compiled = null; state = null; breakpoints.clear(); lineBreakpoints.clear(); sourceMap = {}; labels = {};
  source.value = current.sources[current.active]; source.scrollTop = 0;
  $('download-rom').disabled = true; $('notice').hidden = true; $('dirty-indicator').textContent = '';
  $('console').replaceChildren(); consoleText = ''; $('console-count').textContent = '0';
  renderProjects(); renderFiles(); renderEditor(); renderDisk(); renderBreakpoints();
  persist(); compile(autoRun);
}
function createWorker() {
  worker?.terminate(); audio.stop(); loaded = false;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onerror = event => handleError(event.message || 'The runtime worker failed to start');
  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'assembled':
        clearTimeout(loadingTimer); compiled = data.rom; labels = data.labels; sourceMap = data.sourceMap; loaded = true;
        $('runtime-status').textContent = 'Uxn WASM · ready'; $('rom-size').textContent = `${compiled.length.toLocaleString()} bytes`;
        $('download-rom').disabled = false; $('build-status').textContent = `Assembled ${compiled.length.toLocaleString()} bytes in ${Math.round(performance.now() - buildTime)} ms`;
        $('dirty-indicator').textContent = ''; log(`✓ ${current.entry} → ${compiled.length.toLocaleString()} bytes\n`, 'info');
        syncBreakpoints(); worker.postMessage({ type: 'inspect', address: memoryPage }); setControls(); break;
      case 'frame': draw(data); break;
      case 'state': state = data; updateState(); break;
      case 'console': log(data.text, data.error ? 'error' : ''); break;
      case 'error': handleError(data.message); break;
      case 'warning': log(`Warning: ${data.text}\n`, 'error'); break;
      case 'debug': send({ type: 'pause' }); tab('debugger'); log(data.text + '\n', 'info'); break;
      case 'breakpoint': tab('debugger'); log(`Breakpoint at ${hex(data.pc, 4)}\n`, 'info'); break;
      case 'audio': audio.play(data); break;
      case 'file':
        if (data.deleted) delete current.files[data.name]; else current.files[data.name] = encode(data.data);
        renderDisk(); scheduleSave(); break;
    }
  };
}
function handleError(message) {
  clearTimeout(loadingTimer); $('runtime-status').textContent = 'Needs attention'; $('build-status').textContent = 'Assembly / runtime error';
  $('machine-status').textContent = 'Error'; log(message + '\n', 'error'); report(message, true);
  const match = message.match(/^([^:]+):(\d+):/);
  if (match && Object.hasOwn(current.sources, match[1])) {
    current.active = match[1]; source.value = current.sources[current.active]; renderFiles(); renderEditor();
    const start = source.value.split('\n').slice(0, Number(match[2]) - 1).join('\n').length;
    source.focus(); source.setSelectionRange(start ? start + 1 : 0, source.value.indexOf('\n', start + 1) < 0 ? source.value.length : source.value.indexOf('\n', start + 1));
  }
  setControls();
}
function compile(run) {
  persist(); report(''); createWorker(); buildTime = performance.now();
  $('runtime-status').textContent = 'Assembling…'; $('build-status').textContent = 'Building ROM…'; $('download-rom').disabled = true;
  const message = { type: 'load', source: current.sources[current.entry], files: current.sources, name: current.entry, run,
    breakpoints: [...breakpoints], lineBreakpoints: [...lineBreakpoints],
    virtualFiles: Object.entries(current.files).map(([name, data]) => [name, decode(data)]) };
  if (current.rom) message.rom = decode(current.rom);
  worker.postMessage(message);
  loadingTimer = setTimeout(() => { worker.terminate(); handleError('Assembly exceeded 10 seconds. Check macros and includes, then try again.'); }, 10000);
  setControls();
}
function send(message) {
  if (!loaded || !worker) return;
  worker.postMessage(message);
}
function setControls() {
  for (const id of ['resume', 'pause', 'step', 'reset']) $(id).disabled = !loaded;
}
function draw(data) {
  lastFrame = data;
  if (screen.width !== data.width || screen.height !== data.height) { screen.width = data.width; screen.height = data.height; }
  context.putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
  $('dimensions').textContent = `${data.width} × ${data.height}`; screen.style.setProperty('--screen-ratio', `${data.width}/${data.height}`); scale();
}
function scale() {
  const value = $('scale').value;
  screen.classList.toggle('fit', value === 'fit');
  screen.style.width = value === 'fit' ? '' : `${screen.width * Number(value)}px`;
  screen.style.height = value === 'fit' ? '' : `${screen.height * Number(value)}px`;
}
function updateState() {
  const status = state.halted ? 'Halted' : state.running ? 'Running' : 'Paused';
  $('machine-status').innerHTML = `<i></i>${status}`;
  $('machine-status').className = 'machine-status' + (state.running ? ' running' : '');
  $('pc-readout').textContent = `PC ${hex(state.pc, 4)}`;
  $('instruction-count').textContent = `${state.instructions.toLocaleString()} instructions`;
  $('pause').disabled = !state.running; $('resume').disabled = state.running || state.halted; $('step').disabled = state.running || state.halted;
  highlightPC(); renderInspector();
}
function renderInspector() {
  if (!state) return;
  if (activeTab === 'debugger') {
    for (const name of ['wst', 'rst']) {
      $(name + '-size').textContent = `${state[name].length} / 255`;
      $(name).innerHTML = state[name].length ? state[name].map(b => `<span class="byte">${hex(b)}</span>`).join('') : '<span class="empty">Empty stack<br>Step to watch values appear.</span>';
    }
    // The memory inspector follows PC while debugging, so disassembly is real ROM memory.
    if (state.pc && (state.pc & 0xff00) !== state.memoryStart) send({ type: 'inspect', address: state.pc });
    const rows = []; let pc = state.pc;
    for (let i = 0; i < 6 && pc && pc >= state.memoryStart && pc < state.memoryStart + state.memory.length; i++) {
      const op = state.memory[pc - state.memoryStart], name = instruction(op);
      const immediate = (op & 31) === 0 && op !== 0;
      const length = immediate ? ([0x80, 0xc0].includes(op) ? 2 : 3) : 1;
      let operand = '';
      for (let n = 1; n < length; n++) operand += hex(state.memory[pc + n - state.memoryStart]);
      rows.push(`${i === 0 ? '→' : ' '} ${hex(pc, 4)}  ${name}${operand ? ' ' + operand : ''}`);
      pc = (pc + length) & 65535;
    }
    $('disassembly').textContent = rows.join('\n') || 'Vector complete (BRK).\nStep to enter the screen vector.';
  }
  if (activeTab === 'memory') {
    $('memory-address').value = hex(state.memoryStart, 4);
    $('memory').textContent = Array.from({ length: 16 }, (_, row) => {
      const bytes = state.memory.slice(row * 16, row * 16 + 16);
      return hex(state.memoryStart + row * 16, 4) + '  ' + [...bytes].map(b => hex(b)).join(' ') + '  ' + [...bytes].map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '·').join('');
    }).join('\n');
  }
  if (activeTab === 'devices') {
    $('devices').innerHTML = deviceNames.map((name, i) => `<div class="device-row"><strong>${hex(i * 16)} · ${name}</strong><code>${[...state.dev.slice(i * 16, i * 16 + 16)].map(b => hex(b)).join(' ')}</code></div>`).join('');
  }
}
function tab(name) {
  activeTab = name;
  for (const button of $('inspector-tabs').querySelectorAll('button')) {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $('view-' + button.dataset.tab).hidden = !selected;
  }
  if (name === 'memory') send({ type: 'inspect', address: memoryPage });
  if (name === 'debugger' && state?.pc) send({ type: 'inspect', address: state.pc });
  renderInspector();
}
function syncBreakpoints() {
  const addresses = new Set(breakpoints);
  for (const location of lineBreakpoints) {
    const [file, line] = location.split(':');
    const address = Object.keys(sourceMap).find(a => sourceMap[a].file === file && sourceMap[a].line === Number(line));
    if (address) addresses.add(Number(address));
  }
  send({ type: 'breakpoints', addresses: [...addresses] }); renderBreakpoints();
}
function renderBreakpoints() {
  $('breakpoints').replaceChildren();
  for (const value of [...breakpoints, ...lineBreakpoints]) {
    const button = document.createElement('button');
    button.textContent = (typeof value === 'number' ? hex(value, 4) : value) + ' ×';
    button.onclick = () => { breakpoints.delete(value); lineBreakpoints.delete(value); syncBreakpoints(); highlight(); };
    $('breakpoints').append(button);
  }
}
function renderDisk() {
  $('disk-files').replaceChildren();
  const entries = Object.entries(current.files);
  if (!entries.length) { $('disk-files').innerHTML = '<p class="empty-state">The virtual disk is empty. Add a file or run the Virtual files example.<br>ROMs read and write here through the File devices.</p>'; return; }
  for (const [name, data] of entries) {
    const row = document.createElement('div'); row.className = 'disk-row';
    const code = document.createElement('code'); code.textContent = name;
    const size = document.createElement('span'); size.textContent = `${decode(data).length.toLocaleString()} B`;
    const downloadButton = document.createElement('button'); downloadButton.textContent = 'Download'; downloadButton.onclick = () => download(decode(data), name);
    const remove = document.createElement('button'); remove.textContent = 'Delete';
    remove.onclick = async () => { if (!await confirmAction(`Delete ${name}?`, 'This removes the virtual file from the project.')) return; delete current.files[name]; send({ type: 'delete-file', name }); renderDisk(); persist(); };
    row.append(code, size, downloadButton, remove); $('disk-files').append(row);
  }
}
function download(data, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function nameDialog(title, label, value = '', description = '') {
  return new Promise(resolve => {
    const dialog = $('name-dialog'); $('dialog-title').textContent = title; $('dialog-label').textContent = label;
    $('dialog-input').value = value; $('dialog-input').hidden = false; $('dialog-label').hidden = false;
    $('dialog-input').required = true; $('dialog-description').textContent = description;
    dialog.querySelector('.primary').textContent = 'Save';
    dialog.onclose = () => resolve(dialog.returnValue === 'confirm' ? $('dialog-input').value.trim() : null);
    dialog.showModal(); $('dialog-input').focus(); $('dialog-input').select();
  });
}
function confirmAction(title, description) {
  return new Promise(resolve => {
    const dialog = $('name-dialog'); $('dialog-title').textContent = title; $('dialog-description').textContent = description;
    $('dialog-input').hidden = true; $('dialog-input').required = false; $('dialog-label').hidden = true;
    dialog.querySelector('.primary').textContent = 'Delete';
    dialog.onclose = () => resolve(dialog.returnValue === 'confirm');
    dialog.showModal(); dialog.querySelector('[value="cancel"]').focus();
  });
}
function addProject(project, autoRun = false) { persist(); store.projects.push(project); activateProject(project, autoRun); }
async function importFiles(files) {
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { report(`${file.name} exceeds the 20 MiB import limit.`, true); continue; }
    try {
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(await file.text());
        const project = validProject(data.project || data); project.id = crypto.randomUUID(); addProject(project); report(`Imported ${project.name}`);
      } else if (file.name.endsWith('.rom')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!bytes.length || bytes.length > 0xff00) throw new Error('ROM must contain 1–65,280 bytes');
        const project = freshProject(file.name.replace(/\.rom$/, ''), 'main.tal', '( Imported ROM: source is not available. )\n');
        project.rom = encode(bytes); addProject(project, true);
      } else if (file.name.endsWith('.tal')) {
        if (!validName(file.name)) throw new Error('Invalid source filename');
        if (current.rom) addProject(freshProject(file.name.replace(/\.tal$/, ''), file.name, await file.text()));
        else {
          if (Object.hasOwn(current.sources, file.name)) throw new Error(`${file.name} already exists. Rename the file before importing.`);
          persist(); current.sources[file.name] = await file.text(); current.active = file.name; source.value = current.sources[file.name]; renderFiles(); renderEditor(); persist(); report(`Imported ${file.name}. Double-click its file name to use it as the entry point.`);
        }
      } else await addDiskFile(file);
    } catch (error) { report(`Could not import ${file.name}: ${error.message}`, true); log(error.message + '\n', 'error'); }
  }
}
async function addDiskFile(file) {
  if (!validName(file.name)) throw new Error('Invalid virtual filename');
  if (file.size > 16 * 1024 * 1024) throw new Error('Virtual files are limited to 16 MiB');
  if (Object.hasOwn(current.files, file.name)) throw new Error(`${file.name} already exists; delete it before replacing it`);
  const data = new Uint8Array(await file.arrayBuffer());
  current.files[file.name] = encode(data); send({ type: 'file', name: file.name, data }); renderDisk(); persist();
}
function input(vector, values) { send({ type: 'input', vector, values }); }
function pointer(event) {
  const bounds = screen.getBoundingClientRect();
  const ratio = Math.min(bounds.width / screen.width, bounds.height / screen.height);
  const w = screen.width * ratio, h = screen.height * ratio;
  const x = Math.max(0, Math.min(screen.width - 1, Math.floor((event.clientX - bounds.left - (bounds.width - w) / 2) / ratio)));
  const y = Math.max(0, Math.min(screen.height - 1, Math.floor((event.clientY - bounds.top - (bounds.height - h) / 2) / ratio)));
  input(0x90, [[0x92, x >> 8], [0x93, x & 255], [0x94, y >> 8], [0x95, y & 255], [0x96, mouseButtons]]);
}

$('reference-content').innerHTML = referenceHTML;
$('examples').replaceChildren(...examples.map(example => {
  const button = document.createElement('button'); button.innerHTML = `<span>${escape(example.name)}</span><span>${escape(example.category)}</span>`; button.title = example.description;
  button.onclick = () => { addProject(freshProject(example.name, example.file, example.source), example.category !== 'Debugger'); if (example.category === 'Debugger') tab('debugger'); };
  return button;
}));
$('examples-toggle').onclick = () => { const open = document.querySelector('.rail').classList.toggle('mobile-examples'); $('examples-toggle').setAttribute('aria-expanded', String(open)); };
$('projects').onchange = () => { persist(); activateProject(store.projects.find(p => p.id === $('projects').value)); };
$('new-project').onclick = async () => { const name = await nameDialog('New project', 'Project name', 'Untitled'); if (name) addProject(freshProject(name)); };
$('rename-project').onclick = async () => { const name = await nameDialog('Rename project', 'Project name', current.name); if (name) { current.name = name.slice(0, 100); renderProjects(); persist(); } };
$('delete-project').onclick = async () => {
  if (!await confirmAction(`Delete ${current.name}?`, 'Export a backup first. This cannot be undone.')) return;
  store.projects = store.projects.filter(p => p.id !== current.id);
  if (!store.projects.length) store.projects.push(freshProject('Untitled'));
  activateProject(store.projects[0]);
};
$('export-project').onclick = () => { persist(); download(JSON.stringify({ version: 1, project: current }, null, 2), current.name.replace(/[^\w-]/g, '-') + '.ux.json', 'application/json'); };
$('new-file').onclick = async () => {
  if (current.rom) { report('Create a new project to write source; this project contains an imported ROM.', true); return; }
  const name = await nameDialog('New source file', 'Relative file name', 'library.tal', 'Double-click a source file to set it as the entry point. Include another file with ~library.tal.');
  if (!name) return;
  if (!validName(name) || !name.endsWith('.tal') || Object.hasOwn(current.sources, name)) { report('Use a unique relative file name ending in .tal.', true); return; }
  persist(); current.sources[name] = '( New source file )\n'; current.active = name; source.value = current.sources[name]; renderFiles(); renderEditor(); persist();
};
$('import-button').onclick = () => $('import').click();
$('import').onchange = async () => { await importFiles($('import').files); $('import').value = ''; };
$('upload-disk').onclick = () => $('disk-input').click();
$('disk-input').onchange = async () => {
  for (const file of $('disk-input').files) { try { await addDiskFile(file); } catch (error) { report(error.message, true); } }
  $('disk-input').value = '';
};
$('assemble').onclick = () => compile(false);
$('run').onclick = () => compile(true);
$('resume').onclick = () => send({ type: 'run' });
$('pause').onclick = () => { send({ type: 'pause' }); audio.stop(); };
$('step').onclick = () => { tab('debugger'); send({ type: 'step' }); };
$('reset').onclick = () => { audio.stop(); send({ type: 'reset' }); };
$('download-rom').onclick = () => { if (compiled) download(compiled, current.name.replace(/[^\w-]/g, '-') + '.rom'); };
$('download-source').onclick = () => download(source.value, current.active, 'text/plain');
$('clear-console').onclick = () => { $('console').replaceChildren(); consoleText = ''; $('console-count').textContent = '0'; };
$('console-form').onsubmit = event => {
  event.preventDefault();
  for (const byte of new TextEncoder().encode($('console-input').value + '\n')) input(0x10, [[0x12, byte], [0x17, 1]]);
  $('console-input').value = '';
};
$('inspector-tabs').onclick = event => { const button = event.target.closest('button'); if (button) tab(button.dataset.tab); };
$('inspector-tabs').onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...$('inspector-tabs').querySelectorAll('button')], index = tabs.findIndex(b => b.dataset.tab === activeTab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  event.preventDefault(); tab(tabs[next].dataset.tab); tabs[next].focus();
};
$('gutter').onclick = event => {
  const button = event.target.closest('button'); if (!button) return;
  const value = `${current.active}:${button.dataset.line}`;
  if (lineBreakpoints.has(value)) lineBreakpoints.delete(value); else lineBreakpoints.add(value);
  syncBreakpoints(); highlight();
};
$('add-breakpoint').onclick = () => {
  const value = $('break-address').value;
  if (!/^[\da-f]{1,4}$/i.test(value)) { report('Breakpoint address must be 1–4 hexadecimal digits.', true); return; }
  breakpoints.add(parseInt(value, 16)); syncBreakpoints(); $('break-address').value = '';
};
function memoryGo(address) { memoryPage = address & 0xff00; send({ type: 'inspect', address: memoryPage }); }
$('memory-go').onclick = () => {
  if (!/^[\da-f]{1,4}$/i.test($('memory-address').value)) { report('Memory address must be 1–4 hexadecimal digits.', true); return; }
  memoryGo(parseInt($('memory-address').value, 16));
};
$('memory-address').onkeydown = event => { if (event.key === 'Enter') $('memory-go').click(); };
$('memory-prev').onclick = () => memoryGo((memoryPage - 256) & 65535);
$('memory-next').onclick = () => memoryGo((memoryPage + 256) & 65535);
source.addEventListener('input', () => { highlight(); cursor(); current.sources[current.active] = source.value; $('dirty-indicator').textContent = 'Edited'; scheduleSave(); });
source.addEventListener('scroll', syncScroll);
source.addEventListener('click', cursor); source.addEventListener('keyup', cursor); source.addEventListener('select', cursor);
source.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !source.readOnly) { event.preventDefault(); document.execCommand('insertText', false, '  '); }
});
$('font-size').onchange = () => document.documentElement.style.setProperty('--code-size', $('font-size').value + 'px');
$('find-toggle').onclick = () => { $('find-bar').hidden = false; $('find-input').focus(); };
$('find-close').onclick = () => { $('find-bar').hidden = true; source.focus(); };
$('find-next').onclick = () => {
  const query = $('find-input').value; if (!query) return;
  let index = source.value.toLowerCase().indexOf(query.toLowerCase(), source.selectionEnd);
  if (index < 0) index = source.value.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) { report(`No matches for “${query}”.`); return; }
  source.focus(); source.setSelectionRange(index, index + query.length);
  source.scrollTop = Math.max(0, (source.value.slice(0, index).split('\n').length - 4) * parseInt(getComputedStyle(source).lineHeight)); cursor();
};
$('find-input').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('find-next').click(); } };
$('reference-toggle').onclick = () => { $('reference').hidden = !$('reference').hidden; $('reference-toggle').setAttribute('aria-expanded', String(!$('reference').hidden)); };
$('reference-close').onclick = () => { $('reference').hidden = true; $('reference-toggle').setAttribute('aria-expanded', 'false'); $('reference-toggle').focus(); };
$('scale').onchange = scale;
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('display-stage').requestFullscreen(); } catch (error) { report(`Fullscreen unavailable: ${error.message}`, true); } };
$('screenshot').onclick = () => { if (!lastFrame) return; screen.toBlob(blob => { if (blob) download(blob, `${current.name}.png`, 'image/png'); else report('The display image could not be saved.', true); }); };
$('sound').onclick = async () => {
  try {
    if (audio.enabled) audio.disable(); else await audio.enable();
    $('sound').setAttribute('aria-pressed', String(audio.enabled)); $('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  } catch (error) { report(`Audio unavailable: ${error.message}`, true); }
};
screen.oncontextmenu = event => event.preventDefault();
screen.onpointerdown = event => {
  event.preventDefault(); screen.focus(); screen.setPointerCapture(event.pointerId);
  mouseButtons = (event.buttons & 1) | (event.buttons & 2 ? 4 : 0) | (event.buttons & 4 ? 2 : 0); pointer(event);
};
screen.onpointermove = pointer;
screen.onpointerup = event => { mouseButtons = (event.buttons & 1) | (event.buttons & 2 ? 4 : 0) | (event.buttons & 4 ? 2 : 0); pointer(event); };
screen.onpointercancel = event => { mouseButtons = 0; pointer(event); };
screen.onwheel = event => {
  event.preventDefault();
  const x = Math.sign(event.deltaX), y = Math.sign(event.deltaY);
  input(0x90, [[0x9a, x < 0 ? 255 : 0], [0x9b, x & 255], [0x9c, y < 0 ? 255 : 0], [0x9d, y & 255]]);
  input(0x90, [[0x9a, 0], [0x9b, 0], [0x9c, 0], [0x9d, 0]]);
};
const keyBits = { Control: 1, Alt: 2, Shift: 4, Home: 8, ArrowUp: 16, ArrowDown: 32, ArrowLeft: 64, ArrowRight: 128 };
screen.onkeydown = event => {
  if (event.metaKey || event.ctrlKey && !keyBits[event.key]) return;
  if (keyBits[event.key]) { event.preventDefault(); buttons |= keyBits[event.key]; input(0x80, [[0x82, buttons], [0x83, 0]]); }
  else {
    const text = event.key.length === 1 ? event.key : { Enter: '\r', Backspace: '\b', Tab: '\t', Escape: '\x1b', Delete: '\x7f' }[event.key];
    if (text) { event.preventDefault(); for (const byte of new TextEncoder().encode(text)) { input(0x80, [[0x82, buttons], [0x83, byte]]); input(0x80, [[0x83, 0]]); } }
  }
};
screen.onkeyup = event => { if (keyBits[event.key]) { event.preventDefault(); buttons &= ~keyBits[event.key]; input(0x80, [[0x82, buttons], [0x83, 0]]); } };
screen.onblur = () => { buttons = 0; mouseButtons = 0; input(0x80, [[0x82, 0], [0x83, 0]]); input(0x90, [[0x96, 0]]); };
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); compile(true); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); persist(); }
  if (event.key === 'F5') { event.preventDefault(); send({ type: 'run' }); }
  if (event.key === 'F6') { event.preventDefault(); $('pause').click(); }
  if (event.key === 'F10') { event.preventDefault(); $('step').click(); }
  if (event.key === 'Escape') { $('reference').hidden = true; $('find-bar').hidden = true; }
});
window.addEventListener('beforeunload', persist);
window.addEventListener('error', event => report(event.message, true));
window.addEventListener('unhandledrejection', event => report(event.reason?.message || String(event.reason), true));
try {
  const saved = localStorage.getItem(key);
  recoveryData = saved || '';
  if (saved) {
    const data = JSON.parse(saved);
    if (!Array.isArray(data.projects) || !data.projects.length) throw new Error('Saved workspace has no projects');
    store = { projects: data.projects.map(validProject), current: data.current };
  }
} catch (error) {
  saveBlocked = true;
  startupError = `Saved workspace could not be read: ${error.message}. Automatic saving is disabled to preserve your data. Export this project's changes before leaving.`;
}
if (!store) {
  const project = freshProject(examples[0].name, examples[0].file, examples[0].source);
  store = { projects: [project], current: project.id };
}
activateProject(store.projects.find(p => p.id === store.current) || store.projects[0], true);
if (startupError) {
  report(startupError, true);
  if (recoveryData) {
    const button = document.createElement('button'); button.textContent = 'Download stored data';
    button.onclick = () => download(recoveryData, 'ux-workspace-recovery.json', 'application/json');
    $('notice').append(document.createTextNode(' '), button);
  }
}
