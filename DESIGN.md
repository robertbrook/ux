---
name: ux workbench
description: A precise browser workbench for editing, running, and inspecting Uxn programs.
colors:
  primary: "#2448da"
  primary-hover: "#1737b7"
  graphite: "#29333d"
  neutral-bg: "#e9edf0"
  paper: "#fcfcfa"
  panel: "#f3f5f6"
  line: "#cbd2d8"
  muted: "#596672"
  dark-bg: "#14191f"
  dark-paper: "#1b2129"
  dark-panel: "#222a34"
  dark-text: "#dce4ec"
  dark-muted: "#a4b2c0"
  dark-line: "#3a4653"
  dark-link: "#a3beff"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
  code:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  sm: "3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "5px 11px"
    height: "36px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "5px 11px"
    height: "32px"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
    height: "32px"
  inspector-tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
    height: "39px"
---

# Design System: ux workbench

## Overview

**Creative North Star: "The Technical Drafting Desk"**

The workbench is a calm, precise instrument for learning and building with Uxn. Light graphite framing and paper-like work surfaces keep attention on source and machine output; cobalt is reserved for the main action, links, focus, and clear active states. The visual language is compact and information-dense without making the tools compete with the program being edited.

The desk connects the real source editor to a live Varvara machine: source on the left, machine display on the right, and an inspection tray below. Project navigation stays at the edge, while assemble-and-run is the most prominent control. The interface favors clear borders, restrained states, and direct labels over ornamental chrome.

**Key Characteristics:**
- Light graphite framing around warm-white work surfaces
- Cobalt accents for action and interaction state
- Source and live machine shown as paired instruments
- Inspection views grouped in a persistent lower tray
- Compact system typography with monospaced code and readouts

## Colors

The palette pairs cool, light neutrals with one decisive cobalt accent; neutral surfaces carry most of the interface.

### Dark Mode

The header's Dark mode toggle switches the same drafting-desk hierarchy to charcoal surfaces: page `#14191f`, work surfaces `#1b2129`, panel bars `#222a34`, dividers `#3a4653`, and text `#dce4ec`. Supporting text uses `#a4b2c0`; links and active details use a lighter blue `#a3beff`. The primary action retains cobalt with white text.

Use the shared semantic CSS properties for all themed surfaces, syntax highlighting, focus, notices, saved states, tabs, dialogs, reference and inspection views. Set native controls' `color-scheme` with the active theme. The ROM controls its own palette; never invert or recolor the canvas or exported images.

Until explicitly overridden, follow system color-scheme changes. Apply the saved preference before first paint and preserve it separately from project data. The toggle remains keyboard-operable and exposes its state through `aria-pressed`.

### Primary
- **Instrument Cobalt**: The primary action, keyboard focus, active navigation, and links use the system's precise blue accent.
- **Cobalt Pressed**: A deeper blue marks the primary button's hover state.

### Neutral
- **Graphite Ink**: Default text and control labels.
- **Cool Workbench**: The page background surrounding the desk.
- **Paper Surface**: Editor, inspector, and input backgrounds.
- **Raised Panel Tint**: Panel bars and quiet control surfaces, distinct from the paper canvas.
- **Graphite Divider**: Fine borders and separators that organize dense work areas.
- **Muted Slate**: Supporting labels, metadata, and secondary information.

**The One-Accent Rule.** Keep cobalt focused on actions, links, focus, and selected states; let neutral surfaces do the structural work.

## Typography

**Display Font:** System sans-serif (`-apple-system`, BlinkMacSystemFont, Segoe UI)
**Body Font:** System sans-serif (same stack)
**Label/Mono Font:** SFMono-Regular, Consolas, Liberation Mono

**Character:** Native system sans-serif makes controls familiar and compact; monospaced type distinguishes source, filenames, addresses, and machine data.

### Hierarchy
- **Title** (600, 12–15px): Compact panel headings and the current project name; use weight and placement rather than oversized display type.
- **Body** (400, 13px): Default interface text and explanatory copy.
- **Label** (400, commonly 10–11px): Secondary metadata, status, and control labels.
- **Code** (400, 13px, 1.75 line-height in the editor): Source and machine readouts; preserve monospaced alignment.

## Layout

Treat the application as a technical desk, not a marketing canvas. On wide screens, keep project navigation in a left rail and place source and machine in adjacent, similarly weighted panels. Keep Run prominent in the desk toolbar. Put console, debugger, memory, devices, and virtual files in a tabbed inspection tray beneath the paired panels.

Use compact, consistent panel bars and thin dividers to separate tools without adding visual weight. At narrower widths, stack source above the machine and let the toolbar wrap while retaining the primary action's prominence. On small phones, turn project navigation into a compact, horizontally usable workspace area; keep inspector tabs scrollable rather than squeezing their labels.

Observed responsive transitions occur at 1200px, 850px, and 560px. Let the desk use available width; preserve usable minimum widths for the editor and display instead of scaling the entire interface down.

## Elevation & Depth

Depth is primarily tonal: the cool page background frames paper work surfaces, softly tinted bars identify panel headers, and fine strokes define boundaries. Shadows are restrained and reserved for a slight lift on the machine canvas and overlays such as the dialog or responsive reference panel; they do not replace structural borders.

**The Border-First Rule.** Use tonal changes and quiet dividers to organize the desk; reserve shadows for elements that actually float above it.

## Shapes

Use small, lightly rounded corners (3px) for controls and active rows. Keep panel geometry square and instrument-like, with borders doing more work than shape. Inputs and selects use a clear stroke against paper; avoid pill silhouettes and oversized rounding.

## Components

### Buttons
- **Character:** Quiet, precise controls with a single confident primary action.
- **Shape:** Lightly rounded corners (3px); standard controls are at least 32px high, with the primary run action at 36px.
- **Primary:** Cobalt fill, white text, medium emphasis; use for the main assemble-and-run action.
- **Secondary:** Neutral text and a fine border on transparent or paper surfaces.
- **Hover / Focus:** Darken the primary fill on hover. Give keyboard focus a visible 2px cobalt outline with offset; do not rely on hover alone.
- **Disabled / Pressed:** Reduce disabled control emphasis and show a non-interactive cursor; use a quiet blue-tinted surface for pressed toggle states.

### Inputs / Fields
- **Style:** Paper background, graphite text, fine neutral border, compact inset padding, and the same small corner radius as buttons.
- **Focus:** Visible cobalt outline with offset, consistent with other keyboard-operable controls.

### Navigation
- **Style:** Keep project and file navigation compact and task-oriented. Use an understated surface for inactive items and a pale blue background with stronger blue text for the active file.
- **Inspector tabs:** A horizontal tab row uses a bottom rule to mark the selected view; preserve horizontal scrolling on narrow screens.

### Work Panels
- **Style:** Paper canvas with a thin graphite divider and a lightly tinted header bar. Use the same panel grammar for source, machine, and inspection content.
- **Source editor:** Monospaced text, a distinct line-number gutter, and restrained syntax colors. Keep editor chrome subordinate to the source.
- **Machine display:** Center the pixelated live canvas in a quiet, cool stage. Keep machine controls and status in compact bands around the display.
- **Inspector tray:** Present machine details as tabbed views under the source-and-display pair; use monospaced formatting for addresses, memory, and execution data.

## Do's and Don'ts

### Do:
- **Do** keep source and the live machine visible as the central paired work surfaces on wide screens.
- **Do** make assemble-and-run the clearest action in the toolbar.
- **Do** use cobalt for meaningful interaction states and keep supporting information muted.
- **Do** distinguish code and machine values with the established monospaced stack.
- **Do** retain visible keyboard focus and clear labels for controls.
- **Do** use borders and tonal surfaces to make dense work areas easy to scan.

### Don't:
- **Don't** change the drafting-desk structure between themes or introduce a highly saturated overall palette.
- **Don't** introduce competing accent colors for ordinary controls or selected states.
- **Don't** use decorative imagery, gradients, or motion that competes with source or machine output.
- **Don't** turn the workbench panels into floating cards with heavy shadows or pill-shaped controls.
