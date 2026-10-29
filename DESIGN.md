# Design System: ux workbench

## Commitment

Use **Bootstrap 6.0.0-alpha.1 only** for all interface styling, as requested by the user. The exact prerelease is pinned in `package.json`; its CSS is imported from `bootstrap/dist/css/bootstrap.min.css`. Do not add application CSS, inline style declarations, Sass overrides, custom fonts, or a parallel component theme.

The interface is an operational programming workbench, not a marketing surface. Preserve the source/display pairing, quiet project navigation and progressively disclosed inspection tools using the framework's own vocabulary.

## Layout

- Bootstrap's responsive row/column grid puts the workspace rail alongside the desk at `md`, and source alongside the machine at `lg`. Stack everything naturally on small screens.
- Use stock spacing, borders, rounded corners and background utilities. `bg-body`, `bg-1`, `bg-2` and `fg-2` establish the default hierarchy without custom colors.
- Keep Run as a `btn-solid theme-primary` split control. Put Assemble only in Run options, all four downloads in Export, and occasional editor/display settings in menus.
- Console, REPL, Debug and Virtual disk occupy a `nav-underline` inspection tray. Debug contains `nav-pills` for Stacks, Memory and Devices. Execution readouts appear only during debugging.
- The REPL is a separate scratch machine, with current stacks, a bounded readonly transcript, multiline input and Evaluate/Stop/Reset controls. Project source and execution remain untouched.

## Components and states

Use Bootstrap 6's actual APIs and names, not Bootstrap 5 equivalents: `btn-solid`, `btn-outline`, `btn-text`, `theme-primary`, `form-control`, `menu`, `menu-item`, `dialog`, and responsive prefixes such as `lg:col-6`.

Bootstrap's Menu component owns positioning, light dismissal and keyboard interaction. Navigate with Up/Down, activate with Enter and close with Escape. Name/delete dialogs and the reference use native dialog behavior with Bootstrap dialog classes. Explicit `hidden` attributes remove closed dialogs from layout.

Use `theme-danger` alerts for actionable errors and `theme-info` for notices. Theme active controls with the framework's `active` state; disabled controls retain native `disabled` semantics. Keep labels and focus behavior accessible.

## Typography and editing

Use Bootstrap's default system typography. Apply `font-monospace` to source, addresses, memory and stack bytes, not ordinary interface copy. Source defaults to `text-sm` (14px); the settings menu offers stock type-size utilities.

The editor is a native textarea with a matching line-breakpoint gutter. Highlighting lives in a separate Syntax preview disclosure, using stock foreground utilities for comments, labels, literals and strings. This preserves a visible caret and reliable selection without custom overlay CSS.

## Themes and the display

Set `data-bs-theme` on the root for Bootstrap's light/dark schemes. Follow the system until the user explicitly chooses a theme, save that preference independently of project data, apply it before module loading, and synchronize changes across tabs.

Never theme ROM pixels. A hidden logical-resolution canvas preserves the original frame for PNG export. Draw a scaled visible canvas with smoothing disabled and intrinsic dimensions, not application CSS. Display scale defaults to Fit; pointer coordinates map back to the logical frame.

## Constraints

- Only Bootstrap's stylesheet supplies CSS. Framework-generated menu positioning is allowed; application-generated inline styling is not.
- Use the framework's native responsive, focus, reduced-motion and color-scheme behavior.
- Keep the simplified controls and explicit Set as entry action. Do not reintroduce double-click gestures or redundant chrome.
- Validate desktop/mobile operation in both themes, real export contents, keyboard navigation and readable contrast after framework upgrades.
