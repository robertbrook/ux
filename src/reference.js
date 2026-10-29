import { OPCODES } from './assembler.js';
const effects = ['-- a','a -- a+1','a --','a b -- b','a b -- b a','a b c -- b c a','a -- a a','a b -- a b a','a b -- a=b','a b -- a≠b','a b -- a>b','a b -- a<b','addr --','flag addr --','addr -- | return','a -- | a','addr -- value','value addr --','offset -- value','value offset --','addr* -- value','value addr* --','port -- value','value port --','a b -- a+b','a b -- a−b','a b -- a×b','a b -- a÷b','a b -- a&b','a b -- a|b','a b -- a^b','a shift -- shifted'];
export const deviceNames = ['System', 'Console', 'Screen', 'Audio 0', 'Audio 1', 'Audio 2', 'Audio 3', 'Reserved', 'Controller', 'Mouse', 'File 0', 'File 1', 'Datetime', 'Reserved', 'Reserved', 'Reserved'];
export const referenceHTML = `
<h2>A small machine,<br>a complete vocabulary.</h2>
<p>Uxn is a stack machine with 64 KiB of addressable memory and 256-byte working and return stacks. Uxntal is its assembly language. Varvara supplies the devices.</p>
<nav class="reference-jump" aria-label="Reference sections"><a href="#ref-start">Start</a><a href="#ref-syntax">Syntax</a><a href="#ref-ops">Opcodes</a><a href="#ref-devices">Devices</a><a href="#ref-keys">Shortcuts</a></nav>
<h3 id="ref-start">Your first program</h3>
<p>Open <strong>Hello, world</strong> in the example programs; it runs automatically. Use <strong>Run</strong> after editing. Console output appears below. Choose <strong>Assemble only</strong> from Run options to load a fresh machine at <code>0100</code>; <strong>Step</strong> under <strong>Debug</strong> executes one instruction.</p>
<p>Debug groups Stacks, Memory and Devices. Values are hexadecimal; the last byte is the top of each stack. Source line numbers toggle breakpoints. A breakpoint stops <em>before</em> its instruction; Resume continues past it. The display's execution control switches between Pause and Resume.</p>
<p>Use a source file's actions to <strong>Set as entry</strong>. Project actions contain New, Rename and Delete. <strong>Export</strong> downloads a project backup, current source, ROM or screen image. Editor and display settings hold text size and display scale.</p>
<h3 id="ref-syntax">Uxntal syntax</h3>
<table><tr><th>Token</th><th>Meaning</th></tr>
<tr><td><code>( comment )</code></td><td>Comment; nestable, separated by whitespace</td></tr>
<tr><td><code>|0100</code></td><td>Set assembly address</td></tr>
<tr><td><code>$10</code></td><td>Reserve 16 bytes (hexadecimal)</td></tr>
<tr><td><code>#2a #1234</code></td><td>Literal byte / big-endian short</td></tr>
<tr><td><code>2a 1234</code></td><td>Raw bytes / short</td></tr>
<tr><td><code>@name &amp;sub</code></td><td>Global label / scoped sublabel</td></tr>
<tr><td><code>;name</code></td><td>Literal absolute address (short)</td></tr>
<tr><td><code>.name</code></td><td>Literal zero-page address (byte)</td></tr>
<tr><td><code>,name</code></td><td>Literal signed relative address</td></tr>
<tr><td><code>=name -name _name</code></td><td>Raw absolute / zero-page / relative reference</td></tr>
<tr><td><code>name</code></td><td>Immediate subroutine call (JSI)</td></tr>
<tr><td><code>!name ?name</code></td><td>Immediate jump / conditional jump</td></tr>
<tr><td><code>%NAME { ... }</code></td><td>Token macro</td></tr>
<tr><td><code>{ ... } ?{ ... }</code></td><td>Anonymous call / conditional call block</td></tr>
<tr><td><code>~file.tal</code></td><td>Include another project source file</td></tr>
<tr><td><code>"Hello 20 "world</code></td><td>UTF-8 string tokens; <code>20</code> is a space</td></tr></table>
<p>All numbers are hexadecimal. Two hex digits make a byte; four make a short. Labels cannot be numbers. Programs start at <code>0100</code>; use zero page for variables and device labels.</p>
<h3 id="ref-ops">32 instructions, three modes</h3>
<p>Append <code>2</code> for 16-bit operands, <code>r</code> to use the return stack, and <code>k</code> to keep the inputs. Modes combine: <code>ADD2k</code>. <code>BRK</code> ends the current vector, not the machine.</p>
<table><tr><th>Opcode</th><th>Stack effect</th></tr>${OPCODES.map((op, i) => `<tr><td><code>${op}</code></td><td><code>${effects[i].replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code></td></tr>`).join('')}</table>
<p>Special opcodes: <code>BRK</code>, <code>JCI</code>, <code>JMI</code>, <code>JSI</code>. <code>JMP2r</code> returns from a subroutine. <code>SFT</code> uses low nibble = right shift, high nibble = left shift.</p>
<h3 id="ref-devices">Varvara ports</h3>
<p><code>DEI</code> reads a device byte; <code>DEO</code> writes one. The <code>2</code> mode accesses adjacent ports as a big-endian short. Write a vector address to receive callbacks.</p>
<table><tr><th>Device</th><th>Ports (hex)</th></tr>
<tr><td>System 00</td><td>02 expansion*, 04 wst, 05 rst, 08 red*, 0a green*, 0c blue*, 0e debug, 0f state</td></tr>
<tr><td>Console 10</td><td>10 vector*, 12 read, 17 type, 18 stdout, 19 stderr</td></tr>
<tr><td>Screen 20</td><td>20 vector*, 22 width*, 24 height*, 26 auto, 28 x*, 2a y*, 2c addr*, 2e pixel, 2f sprite</td></tr>
<tr><td>Audio 30–60</td><td>+0 vector*, +2 position*, +4 output, +8 ADSR*, +a length*, +c addr*, +e volume, +f pitch</td></tr>
<tr><td>Controller 80</td><td>80 vector*, 82 buttons, 83 key</td></tr>
<tr><td>Mouse 90</td><td>90 vector*, 92 x*, 94 y*, 96 buttons, 9a scroll-x*, 9c scroll-y*</td></tr>
<tr><td>File a0/b0</td><td>+2 success*, +4 stat*, +6 delete, +7 append, +8 name*, +a length*, +c read*, +e write*</td></tr>
<tr><td>Datetime c0</td><td>c0 year*, c2 month (0–11), c3 day, c4 hour, c5 minute, c6 second, c7 weekday, c8 year-day*, ca DST</td></tr></table>
<p><code>*</code> marks a short. Palette shorts contain four 4-bit color components, most-significant first.</p>
<h3>Drawing</h3>
<p>Pixel: bits 0–1 color, bit 6 foreground, bit 7 fill, bits 4–5 fill direction. Sprite: low nibble blend, bit 4 flip X, bit 5 flip Y, bit 6 foreground, bit 7 two-bit sprite. Sprite data is 8 bytes per bitplane.</p>
<p>Screen auto: bits 0–2 increment X/Y/address; high nibble repeats sprites. Foreground color 0 is transparent. Maximum display size is 2048 × 2048.</p>
<h3>Input and sound</h3>
<p>Focus the display to send keys. Ctrl, Alt, Shift, Home, and arrows map to controller button bits 0–7. Text is sent to Controller/key. Mouse buttons use left = 1, middle = 2, right = 4.</p>
<p>Enable sound before running an audio program. Four sample channels support pitch, stereo volume, ADSR, loop control and completion vectors. Browsers suspend audio in background tabs. Audio timing follows the browser clock, not a cycle-exact hardware clock.</p>
<h3>Files and compatibility</h3>
<p>The virtual disk is project-local, not your computer's disk. Add files, let ROMs read/write them, or download them individually. Both File devices have independent cursors. Directory listings and file stat are supported. Individual files are limited to 16 MiB; browser storage quotas also apply.</p>
<p>This workbench implements the standard Uxn opcodes, circular stacks, 1 MiB expansion memory, and the Varvara devices listed above. Host process execution and host filesystem access are not supported. Programs requiring those extensions will need a native emulator. Assembly supports token macros, labels, includes and lambdas, but not every experimental assembler extension.</p>
<h3 id="ref-keys">Keyboard shortcuts</h3>
<table><tr><td>Ctrl / ⌘ Enter</td><td>Run (assemble and execute)</td></tr><tr><td>Ctrl / ⌘ S</td><td>Save workspace locally</td></tr><tr><td>Tab (editor)</td><td>Insert two spaces</td></tr><tr><td>F5 / F6 / F10</td><td>Resume / Pause / Step</td></tr><tr><td>Escape</td><td>Close menu / reference / find</td></tr></table>
<h3>Further reading</h3>
<p><a href="https://100r.co/site/uxn.html" target="_blank" rel="noreferrer">Hundred Rabbits — Uxn ↗</a><br><a href="https://wiki.xxiivv.com/site/uxntal.html" target="_blank" rel="noreferrer">Uxntal language reference ↗</a><br><a href="https://wiki.xxiivv.com/site/varvara.html" target="_blank" rel="noreferrer">Varvara specification ↗</a><br><a href="https://github.com/remko/uxn.wasm" target="_blank" rel="noreferrer">WebAssembly core by Remko Tronçon ↗</a></p>`;
