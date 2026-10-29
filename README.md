# ux — Uxn workbench

A browser-based Uxn / Uxntal / Varvara programming environment. The VM runs real WebAssembly in an isolated worker; assembly and device emulation are local. There is no backend.

**Site:** https://robertbrook.github.io/ux/

## Workbench

- Uxntal editor with syntax coloring, source line breakpoints, find, text-size controls and multiple source files.
- Assembler with byte/short literals, labels and sublabels, relative and zero-page references, token macros, includes, immediate jumps/calls, anonymous blocks and source maps.
- WebAssembly Uxn core with bounded execution, pause/resume, single-instruction stepping, reset, two stack inspectors, live disassembly, memory pages and device registers.
- Varvara background/foreground screen layers, palette, pixels, fills, one/two-bit sprites, blending, flips, auto-increment and sprite repeat.
- Four sample audio channels with pitch/detune, stereo volume, ADSR, loop control, position/VU ports and completion vectors. Sound is opt-in; completion vectors still work when muted.
- Console input/output, keyboard/controller, mouse/scroll, datetime and System expansion-memory copy.
- Two virtual File devices with independent cursors, read/write/append/delete/stat and directory listing.
- Eight editable example programs and an integrated language/device reference.
- Local project persistence, project JSON import/export, `.tal` import/export, ROM import/export, virtual file upload/download and PNG screenshots.
- Light and dark themes, with system-preference detection and a saved header toggle. Theme changes affect the workbench, not the ROM's palette or exported screenshots.

Select an example to run it; the examples list collapses after selection. Use **Run** after editing. **Run options → Assemble only** loads the ROM paused at `0100`; **Debug → Step** executes one instruction. Debug groups stacks/disassembly, memory and devices in an expanded tray; Console and Virtual disk remain directly accessible. Click a line number to toggle a breakpoint. Click the display to send keyboard/mouse input; its execution control switches between Pause and Resume.

Use a source file's **··· → Set as entry** action to change the entry file; `~library.tal` includes another source. **Project ···** contains New, Rename and Delete. **Export** gathers project, current source, ROM and screen-image downloads. Text size lives in **Editor settings**, with a 14px default; display scale lives in **Display settings**, defaulting to Fit.

Ctrl/⌘ Enter assembles and runs; Ctrl/⌘ S saves locally; F5 resumes, F6 pauses, F10 steps. Export a project to back it up: browser storage is origin-local and can be cleared or exhausted. Storage failures are shown explicitly. Imported projects and ROMs run untrusted code only inside the VM worker; execution budgets keep infinite loops interruptible.

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