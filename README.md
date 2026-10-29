# ux — Uxn workbench

A browser-based Uxn / Uxntal / Varvara programming environment. The VM runs real WebAssembly in an isolated worker; assembly and device emulation are local. There is no backend.

**Site:** https://robertbrook.github.io/ux/

## Workbench

- Uxntal editor with a highlighted syntax preview, source line breakpoints, find, text-size controls and multiple source files.
- Assembler with byte/short literals, labels and sublabels, relative and zero-page references, token macros, includes, immediate jumps/calls, anonymous blocks and source maps.
- WebAssembly Uxn core with bounded execution, pause/resume, single-instruction stepping, reset, two stack inspectors, live disassembly, memory pages and device registers.
- Varvara background/foreground screen layers, palette, pixels, fills, one/two-bit sprites, blending, flips, auto-increment and sprite repeat.
- Four sample audio channels with pitch/detune, stereo volume, ADSR, loop control, position/VU ports and completion vectors. Sound is opt-in; completion vectors still work when muted.
- Console input/output, keyboard/controller, mouse/scroll, datetime and System expansion-memory copy.
- Two virtual File devices with independent cursors, read/write/append/delete/stat and directory listing.
- Eight editable example programs and an integrated language/device reference.
- Local project persistence, project JSON import/export, `.tal` import/export, ROM import/export, virtual file upload/download and PNG screenshots.
- Light and dark themes, with system-preference detection and a saved header toggle. Theme changes affect the workbench, not the ROM's palette or exported screenshots.
- An isolated Uxntal scratch REPL with persistent stacks, memory, labels/macros, console output, command history and interruptible execution.

Select an example to run it; the examples list collapses after selection. Use **Run** after editing. **Run options → Assemble only** loads the ROM paused at `0100`; **Debug → Step** executes one instruction. Debug groups stacks/disassembly, memory and devices in an expanded tray; Console and Virtual disk remain directly accessible. Click a line number to toggle a breakpoint. Click the display to send keyboard/mouse input; its execution control switches between Pause and Resume.

Use a source file's **··· → Set as entry** action to change the entry file; `~library.tal` includes another source. **Project actions (···)** contains New, Rename and Delete. **Export** gathers project, current source, ROM and screen-image downloads. Text size lives in **Editor settings**, with a 14px default; display scale lives in **Display settings**, defaulting to Fit. Expand **Syntax preview** below the editor for live highlighted source.

Ctrl/⌘ Enter assembles and runs; Ctrl/⌘ S saves locally; F5 resumes, F6 pauses, F10 steps. Export a project to back it up: browser storage is origin-local and can be cleared or exhausted. Storage failures are shown explicitly. Imported projects and ROMs run untrusted code only inside the VM worker; execution budgets keep infinite loops interruptible.

## Scratch REPL

Open **REPL** in the inspection tray. Enter `#03 #04 ADD`, then `#02 MUL`: the working stack changes from `07` to `0e`. Stacks, RAM, labels and macros persist between submissions in a separate WASM worker, without touching your project or running ROM. Each result shows both stacks, bottom to top, in hexadecimal. Console writes (`#41 #18 DEO`) appear in the transcript.

Enter or Ctrl/⌘ Enter evaluates; Shift+Enter adds a line. Up at the start / Down at the end of the input recalls the last 100 submissions. **Stop** interrupts execution and keeps partial changes; **Reset REPL** clears the scratch machine and definitions, retaining input history. **Clear output** only clears the transcript. Switching projects does not reset the REPL; reloading the page does. Scratch state is not saved or included in project exports.

Snippets use normal Uxntal syntax without a required `|0100`. Each submission appends code at **Next code**, with an automatic `BRK` (reserved, not redefinable as a macro), and executes only the new entry. Earlier labels/macros remain available. Code is append-only; use `STZ`/`STA` for memory writes (zero page is convenient scratch space). Includes resolve only within REPL source history, not project files. There is no scratch display, audible audio or automatic input/screen-vector execution; use the project VM for interactive Varvara programs.

Execution stops after 1,000,000 instructions per submission, preserving partial state. Console output is capped at 64,000 characters per submission with a visible truncation notice; the visible transcript retains up to 200 entries / 128,000 characters. Snippets are limited to 32,768 characters and accumulated source to 256 KiB. Reset when code space or source history is full, or when System/state halts the scratch machine.

## Interface

The entire interface uses **Bootstrap 6.0.0-alpha.1**, pinned exactly in `package.json`. This is a prerelease, not Bootstrap 5 or a stable Bootstrap 6 release. All styling comes from the bundled Bootstrap stylesheet: its grid, utilities, menus, forms, dialogs, tabs and default light/dark color schemes. There is no custom stylesheet, Sass theme or application-authored inline CSS. Bootstrap's menu component handles positioning and keyboard interaction.

The editor uses a native textarea and separate syntax preview so text selection and the caret work without custom overlay CSS. The display scales its canvas bitmap with smoothing disabled, rather than custom CSS; PNG export uses the untouched logical-resolution frame. In menus, use Up/Down to navigate, Enter to activate and Escape to dismiss.

## Development

Requires Node.js 22+ and the native WABT `wat2wasm` executable:

```sh
sudo apt-get install wabt # macOS: brew install wabt
npm ci
npm run build
npm run dev
```

Open http://localhost:5173/ux/. The build instruments the vendored WAT core with cooperative instruction budgets, saved PC and live System stack-pointer synchronization, then compiles `public/uxn.wasm`. The generated binary is committed so the development server can also start without compiling first. `npm run build` always rebuilds it.

```sh
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

The regression suite covers assembly diagnostics, examples, stepping and stack modes, interruptible loops, pixels/sprites, files, expansion memory, audio metadata/timing, controller vectors and datetime. Browser tests cover the edit/assemble/debug workflow, breakpoints, error recovery, ROM/project operations, persistence and responsive layouts.

## Deployment

The Pages workflow builds the static `dist/` directory using GitHub Actions, with the `/ux/` base path. It runs checks on `main` and the initial implementation branch; only `main` publishes to Pages. It can also be dispatched manually. In repository **Settings → Pages**, choose **GitHub Actions** as the source. Enabling Pages requires repository administration / Pages-write permission; a code-write token alone is insufficient.

## Compatibility and limits

The core supports all 256 opcode variants and circular stacks. Addressable program RAM is 64 KiB with 1 MiB available to System expansion copies. ROMs are limited to 65,280 bytes. Screens support 1–2048 pixels per dimension; virtual files are limited to 16 MiB each, subject to browser storage quotas. Audio uses browser clocks rather than cycle-exact timing.

The disk is virtual and project-local; ROMs cannot read your host filesystem or execute host processes. Console host-process extensions and nonstandard device/assembler extensions are not implemented. Assembly requires whitespace-delimited comments and numeric hexadecimal padding. Source includes resolve only to files in the project. Memory inspection shows the main 64 KiB bank.

## Acknowledgments

Uxn and Varvara were created by Hundred Rabbits. The WebAssembly core is Remko Tronçon’s [uxn.wasm](https://github.com/remko/uxn.wasm), vendored from commit `960cb873263b1aa10f61f4a379ea181eaf6a1171` under its MIT license (`vendor/LICENSE.txt`). Opcode implementations remain upstream; `scripts/build-core.mjs` applies the workbench instrumentation reproducibly. The workbench assembler, device host and UI are implemented in this repository.