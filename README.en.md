# Floor Plan Interior Designer

[中文](README.md) | English

A pure front-end tool for interior design on a floor plan: place furniture, remove or modify walls, and take measurements on a 2D plan, then switch to a Three.js 3D scene with one click — view it from above or walk through it in first person. The whole app is a single `index.html`: no build step, just open it.

## Current layout: IMG_0914

The default layout is reconstructed from the supplied IMG_0914 photo: four bedrooms, two living areas, three bathrooms, a confirmed 3.3 m ceiling, a diagonal double entrance door, a curved bedroom window and two balconies. The northern suite is a staff room with its own bathroom; the main bedroom has two outward-opening side casements. Labeled dimensions take priority; unspecified wall thickness, openings and curved glazing are estimated. Areas are for layout reference.

Interior walls use `u` (structural properties unverified) and can be highlighted with “Unverified walls”; their removal is disabled. Exterior walls use `e`.

Use the top Layout selector to switch between the corrected four-bedroom layout, Example (the three-bedroom layout), and the 1.8 × 1.7 m bathroom. Furniture, room names, flooring, wall changes and measurements save independently; switching saves the outgoing layout and reopening restores the last selection. Switching works in both 2D and 3D.

“Save layout” writes the current arrangement and a complete layout snapshot to browser storage. “File → Export layout JSON” exports structure and arrangement. “Import layout / plan” adds other complete layouts; matching layouts restore their arrangement and different structures create new entries. Legacy arrangement-only JSON selects its corresponding layout automatically.

`floorplans/img-0914.json` backs up the corrected layout (3.3 m ceiling, staff suite, two outward-opening side casements); `floorplans/original.json` backs up the original. Both files can be imported. The built-in catalog is also embedded in `index.html` as `BUILTIN_PLANS` so opening the HTML directly still works.

Browser keys: `huxing-design-img-0914-v1` for the corrected layout, the existing `huxing-design-v1` for the original, and `huxing-custom-plans-v1` for the custom catalog. Exports use `{format:"floorplan-3d", version:2, plan, state}`, with `state.planId` identifying the arrangement’s layout.

Coordinates are in mm, with the origin at the intersection of the western main-bedroom wall centerline and the northernmost wall centerline. The optional sixth `WALLS` element is a diagonal wall polygon. `WINS` uses `{a, b, t, sill, head}` for centerline endpoints, thickness (mm), and sill/head heights (m). Continuous segments form curved glazing.

Validation: `node --test tests/*.test.cjs`.

## Standalone bathroom

`floorplans/bathroom-1800-1700.json` stores a clear 1700 mm width × 1800 mm depth bathroom. The top shower is 730 mm deep; the 70 mm curb spans y=730–800 mm, keeping the dry area 1000 mm deep. The pipe left edge is 305 mm from the left wall and its center is 380 mm from the dry-side curb edge, giving y=1180 mm.

The user-specified drain diameter is **130 mm**: center x = **305 + 130/2 = 370 mm**, y = **1180 mm**. Both views show only a flush circular floor opening, without center lines, crosshairs or a projecting stub. The illustrative wall thickness is 3 mm. The 305 / 380 dimensions are drawn at the opening, which remains fixed when furniture moves.

An independently editable representative toilet (366 mm wide × 700 mm deep × 698 mm high) supports moving, rotating and resizing. Dimensions reference Kohler NEW PATIO; the generic model is illustrative. Older saved bathrooms without a toilet receive one automatically, while subsequent edits persist.

Tiles follow the supplied `679.JPG`: warm gray **800 × 400 mm**, horizontal stacked wall joints and matching straight floor joints. Assumed width cuts are 100 + 800 + 800 mm, aligned between wet and dry zones. Per the user's instruction, start full tiles at the doorway: 400 + 400 + 200 mm toward the curb. Cut around the curb and continue the same grid into the shower: 130 + 400 + 200 mm to the back wall. Wall rows are 400 mm high with a cut top row at the 3.3 m ceiling; side-wall columns are 200 + 800 + 800 mm. Width cuts, 2 mm grout and color are inferred from the photo. Both views share `floorLayout`; `wallTiles` sets wall joint origins. Existing bathroom saves receive the tiles while retaining furniture positions and dimensions.

Toilet dimensions: [Kohler toilet catalogue](https://files.kohler.com.cn/book_files/contentPic/cid2/32.2024%E5%B9%B4%20%E5%BA%A7%E4%BE%BF%E5%99%A8%E5%8F%8A%E7%9B%96%E6%9D%BF.pdf). The 130 mm drain diameter and 70 mm curb width are user-specified.

The bottom-right door opens inward on its right hinge and is provisionally 800 mm wide. The lower-left washbasin has width 300 mm and depth 500 mm, with its tap against the left wall, centered at (250,1650) mm and rotated 270°. Persistent dimension labels are hidden; select the basin to inspect and edit its dimensions. Previous saves receive the updated dimensions, position and orientation; subsequent edits and deletion persist. The curb is 50 mm high and the ceiling 3.3 m. `annotations` stores position dimensions; an optional seventh wall-array element specifies a low element's height in meters.

## Features

**2D Floor Plan**
- Displays the original floor plan at 1:60 / 1:100 scale, dimensions in mm
- Drag 60+ furniture and appliance items from the library on the left (bedroom, living room, dining & kitchen, bathroom, appliances, study & leisure)
- Move, rotate (hold Shift for free angle), and resize items, with automatic snapping to walls
- Measuring tool (snaps to nearby walls; hold Shift to lock horizontal / vertical)
- Remove or modify non-load-bearing walls; load-bearing walls are marked separately
- Layer toggles: dimensions, room names, furniture, grid, load-bearing walls

**3D Scene**
- Bird's-eye, oblique, and top-down views; click a room in the list to fly to it
- Walkthrough mode: WASD + mouse on desktop, virtual joystick on touch devices; click doors to open / close them
- Toggle between full-height and cut-away walls, time-of-day sunlight slider, night lighting
- Detailed furniture models: cabinet door gaps and handles, upholstered headboards, metal and ceramic materials with environment reflections, and more
- Select and drag furniture in 3D as well, kept in sync with the 2D plan in real time

**Plans & Statistics**
- Automatic calculation of room areas and net usable floor area
- Change the floor material of each room (wood, tiles, marble, terrazzo, carpet, etc.), with cost estimates based on area plus 5% wastage
- Undo / redo; plans are auto-saved in the browser's local storage
- Chinese / English UI toggle (button on the right of the top bar; defaults to Chinese and remembers your choice)
- Export to PNG, export / import plans as JSON

## Mobile Use

- Two navigation rows in portrait and one in phone landscape keep the layout selector, Save and 2D / 3D visible.
- More contains measurement, layers, undo, camera views, language and file actions. Floating canvas buttons provide zoom and fit.
- Library and properties open as bottom sheets; close with their header button or backdrop. Tap furniture to add and close the library, then drag it into place. The selection bar provides rotate, duplicate, delete and properties.
- Inputs use at least 16 px text and controls have touch-sized targets. Safe areas, visible viewport height and orientation changes are handled; touch devices use a lower 3D pixel ratio and shadow resolution.
- Open the deployed URL on a phone. Upload the latest `index.html` again after local changes.

## Quick Start

```bash
git clone <repository-url>
cd <repository-directory>
```

Then simply open `index.html` in your browser. Alternatively, start a local static server:

```bash
python3 -m http.server 8000
# Visit http://localhost:8000
```

> Three.js is loaded from the jsDelivr CDN, so an internet connection is required the first time you open the 3D scene.

## Deploy from GitHub to Netlify

The root `netlify.toml` configures the build command (`mkdir -p dist && cp index.html dist/index.html`) and publish directory (`dist`). Only `index.html` is published, with no dependencies to install.

Import the GitHub repository into Netlify and select its production branch. To retain an existing URL, link the repository from the existing Netlify project. Subsequent pushes to the selected branch deploy automatically. Export personal arrangements from browser storage separately as JSON backups.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `T` | Toggle 2D / 3D |
| `V` / `M` / `X` | Select / Measure / Modify walls |
| `R` / `Shift+R` | Rotate selected furniture 90° clockwise / counterclockwise |
| `Delete` / `Backspace` | Delete selected furniture |
| `Ctrl/⌘ + D` | Duplicate selected furniture |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` | Undo, redo |
| `F` | Fit to window |
| `+` / `-` | Zoom in / out |
| `[` / `]` | Show / hide the furniture library (left) and the side panel (right) |
| `Shift + F` | Fullscreen |
| `Esc` | Cancel current action |
| Walkthrough: `WASD` / arrow keys, `Shift`, `E` | Move, walk faster, open / close doors |

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- 2D floor plan rendered with SVG
- 3D scene built with [Three.js](https://threejs.org/) r160 (OrbitControls, PointerLockControls, RoundedBoxGeometry, RoomEnvironment, CSS2DRenderer)
- Data stored in `localStorage`

## Customizing the Floor Plan

The floor plan data lives in `index.html`:

- `ROOMS`: room polygons, names, and default floor materials
- `WALLS` / `WINS`: walls and window openings
- `MATS`: floor material names and unit prices
- `LIB`: furniture library (type, name, default size, color)
- `buildFurniture()`: 3D models for each furniture type

Edit this data to use your own floor plan.

## Social Media

- X (Twitter): [@akokoi1](https://x.com/akokoi1)

## License

[MIT](LICENSE)
