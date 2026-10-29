const hex = value => value.toString(16).padStart(2, '0');

export function initRepl() {
  const $ = id => document.getElementById(id);
  const input = $('repl-input'), output = $('repl-output');
  let worker, available = false, running = false, evaluating = false, history = [], position = 0, draft = '', transcript = [], transcriptSize = 0;
  function append(text, kind = '') {
    if (kind === 'error') text = 'Error: ' + text;
    transcript.push(text);
    transcriptSize += text.length + 1;
    while (transcript.length > 200 || transcriptSize > 128000) {
      transcriptSize -= transcript.shift().length + 1;
    }
    output.value = transcript.join('\n');
    output.scrollTop = output.scrollHeight;
  }
  function controls() {
    $('repl-eval').disabled = !available || running;
    $('repl-stop').disabled = !running;
    input.readOnly = running;
    $('repl-form').setAttribute('aria-busy', String(running));
  }
  function failure(message) {
    running = false;
    $('repl-status').textContent = 'Needs attention';
    $('repl-status').className = 'text-xs fg-danger me-auto';
    append(message, 'error');
    controls();
  }
  function start() {
    worker?.terminate();
    available = false; running = false; evaluating = false;
    $('repl-status').textContent = 'Loading scratch machine...';
    $('repl-status').className = 'text-xs fg-2 me-auto';
    $('repl-wst').textContent = 'Empty'; $('repl-rst').textContent = 'Empty';
    $('repl-next').textContent = '0100';
    controls();
    worker = new Worker(new URL('./repl-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = event => {
      available = false;
      failure(`REPL worker failed: ${event.message || 'unknown error'}. Reset REPL to retry.`);
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'output') {
        for (const entry of data.output) append(entry.text, entry.error ? 'error' : 'device-output');
        return;
      }
      if (data.fatal) {
        available = false;
        failure(`${data.message}. Reset REPL to retry.`);
        return;
      }
      available = !data.halted; running = data.running;
      for (const name of ['wst', 'rst']) $('repl-' + name).textContent = data[name].length ? data[name].map(hex).join(' ') : 'Empty';
      $('repl-next').textContent = data.next.toString(16).padStart(4, '0');
      if (data.type === 'error') failure(data.message);
      else {
        $('repl-status').textContent = data.status;
        $('repl-status').className = 'text-xs fg-2 me-auto';
        if (!running && data.status !== 'Ready') append(data.status, 'repl-note');
        controls();
      }
      if (!running && evaluating) {
        append(`wst [${data.wst.map(hex).join(' ')}]   rst [${data.rst.map(hex).join(' ')}]`, 'repl-result');
        evaluating = false;
      }
    };
  }
  $('repl-form').onsubmit = event => {
    event.preventDefault();
    if (!available || running || !input.value.trim()) return;
    const source = input.value;
    history.push(source);
    if (history.length > 100) history.shift();
    position = history.length; draft = '';
    append('> ' + source, 'repl-command');
    input.value = '';
    running = true; evaluating = true; $('repl-status').textContent = 'Assembling...'; controls();
    worker.postMessage({ type: 'eval', source });
    input.focus();
  };
  input.onkeydown = event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); event.stopPropagation();
      $('repl-form').requestSubmit();
    }
    const previous = event.key === 'ArrowUp' && input.selectionStart === 0;
    const next = event.key === 'ArrowDown' && input.selectionEnd === input.value.length;
    if ((previous || next) && !running && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (position === history.length) draft = input.value;
      position = Math.max(0, Math.min(history.length, position + (previous ? -1 : 1)));
      input.value = position === history.length ? draft : history[position];
      input.setSelectionRange(previous ? 0 : input.value.length, previous ? 0 : input.value.length);
    }
  };
  $('repl-stop').onclick = () => worker?.postMessage({ type: 'stop' });
  $('repl-reset').onclick = () => { append('Scratch machine reset. Stacks, memory and definitions cleared.', 'repl-note'); start(); };
  $('repl-clear').onclick = () => { output.value = ''; transcript = []; transcriptSize = 0; };
  return () => { if (!worker) start(); };
}
