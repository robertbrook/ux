import { ReplMachine } from './repl-machine.js';

let timer;
const send = data => self.postMessage(data);
const ready = (async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}uxn.wasm`);
  if (!response.ok) throw new Error(`REPL WASM download failed (${response.status})`);
  const repl = await new ReplMachine().init(await response.arrayBuffer());
  send({ type: 'state', status: 'Ready', ...repl.snapshot() });
  return repl;
})().catch(error => {
  send({ type: 'error', message: error.message, fatal: true });
  return null;
});
function flush(repl) {
  const output = repl.drainOutput();
  if (output.length) send({ type: 'output', output });
}
function fail(repl, error) {
  clearTimeout(timer);
  repl.stop();
  flush(repl);
  send({ type: 'error', message: error.message, ...repl.snapshot() });
}
function tick(repl) {
  try {
    const running = repl.advance();
    flush(repl);
    if (running) timer = setTimeout(() => tick(repl), 0);
    else send({ type: 'state', status: repl.machine.dev[15] ? 'Halted - reset to continue' : 'Ready', ...repl.snapshot() });
  } catch (error) { fail(repl, error); }
}
self.onmessage = async ({ data }) => {
  const repl = await ready;
  if (!repl) return;
  try {
    if (data.type === 'eval') {
      repl.submit(data.source);
      send({ type: 'state', status: 'Running', ...repl.snapshot() });
      timer = setTimeout(() => tick(repl), 0);
    } else if (data.type === 'stop') {
      clearTimeout(timer);
      repl.stop();
      flush(repl);
      send({ type: 'state', status: 'Stopped - partial changes kept', ...repl.snapshot() });
    }
  } catch (error) { fail(repl, error); }
};
