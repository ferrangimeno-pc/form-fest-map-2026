# FORM Fest 2026 — Interactive 3D Map

Interactive WebGL site map for [experienceform.com](https://www.experienceform.com/). Built with Three.js — visitors can explore the Arcosanti venue in 3D, filter locations by category, and tap any building to view details, photos, and programming.

**Live preview:** https://form-fest-map-2026.vercel.app/

---

## For the Client — What You Need to Provide

Everything that needs to come from the client lives in **one file** plus **one folder**. A developer will paste your content into the right place — you don't need to touch code.

What we need, per location ([CONTENT-CHECKLIST.md](CONTENT-CHECKLIST.md) tracks each one):

1. **Photo** — one landscape JPG per location, ~1600×900 ideal, < 300 KB. Filename: `<location-id>.jpg` (the IDs are in the checklist).
2. **Description copy** — short paragraphs to replace the placeholder text. Sections are typically `HISTORY` + `NEW IN 2026` for stages, `ABOUT` for everything else.
3. **Programming** (stages only) — list of `time` + `artist` per slot.
4. **Bar names** — confirm whether `Bar 1` / `Bar 2` should be renamed (e.g. "Sunset Bar", "Vault Bar") and whether more bars exist.

### Example of one fully-filled location

```json
{
  "id": "amphitheater",
  "name": "Amphitheater",
  "category": "stages",
  "photo": "assets/photos/amphitheater.jpg",
  "sections": [
    { "title": "HISTORY", "body": "Built in 1972 as part of Paolo Soleri's original Arcosanti vision, the Amphitheater hosts our largest sunset performances under the open sky." },
    { "title": "NEW IN 2026", "body": "A redesigned soundstage and tiered seating expand capacity to 2,400, with new lighting rigs from Berlin-based studio Fluss." }
  ],
  "programming": [
    { "time": "6:00 PM", "artist": "Caterina Barbieri" },
    { "time": "8:30 PM", "artist": "Floating Points (live)" },
    { "time": "11:00 PM", "artist": "Nicolas Jaar" }
  ]
}
```

> The `id`, `category`, `pinPosition`, `cameraTarget`, `cameraPosition` fields are technical and **must not be changed by the client** — they control where the building sits on the map.

Send copy/photos as a Google Doc, Notion page, Figma frame, or zip — whatever's easiest. The dev will commit them.

---

## Tech Stack

- **Three.js r170** — WebGL renderer, GLTF/GLB loading, OrbitControls, raycasting
- **Vite 6** — dev server + production build
- **Vanilla JS (ES modules)** — no framework dependency, maximum portability
- **GLB + Draco compression** — 3D model at 2.5 MB
- **HDRI lighting** — day/live/night presets with smooth transitions
- **EffectComposer** post-processing — bloom (quarter-res), SMAA (desktop), film grain, color grading

---

## Getting Started

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview the production build locally
```

Node 18+ required.

---

## Integrating into experienceform.com

The production build outputs a self-contained `dist/` folder — one `index.html` and an `assets/` directory. There are two integration paths:

### Option A — iframe (recommended for minimal disruption)

Drop the built files onto any static host (or Vercel), then embed with an iframe in the FORM website:

```html
<iframe
  src="https://your-hosted-url/"
  style="width:100%; height:100vh; border:none; display:block;"
  allow="fullscreen"
  title="FORM Fest 2026 Interactive Map"
></iframe>
```

The map is designed to fill whatever container it is given. `touch-action: pan-y` is set on the overlay so the host page can still be scrolled when the map is embedded — users scroll past the map normally, and interact with it when they touch the 3D canvas directly.

### Option B — direct embed

Copy the contents of `dist/` into the FORM website's asset pipeline and include `index.html` inline or load the JS entry point directly. The map targets `#map-container` and is fully self-contained — no global variable pollution, no CSS conflicts (all styles are scoped).

### Responsive behavior

The map fills `100dvh` by default. If the host page wraps it in a fixed-height container, it will adapt to that height automatically via the `ResizeObserver` in `engine.js`. No additional configuration needed.

---

## Updating Content

All location data lives in one file: **`src/data/locations.json`**

Each location entry:

```json
{
  "id": "amphitheater",
  "name": "Amphitheater",
  "category": "stages",
  "pinPosition": { "x": 0.70, "y": 0.051, "z": 0.45 },
  "cameraTarget": { "x": 0.70, "y": 0, "z": 0.45 },
  "cameraPosition": { "x": 2.5, "y": 2.2, "z": 2.2 },
  "photo": "assets/photos/amphitheater.jpg",
  "sections": [
    { "title": "HISTORY", "body": "..." },
    { "title": "NEW IN 2026", "body": "..." }
  ],
  "programming": [
    { "time": "3:00PM", "artist": "Artist Name" }
  ]
}
```

### Pending client-supplied content

The following are currently placeholder and need to be filled before launch:

| Field | Status | Notes |
|---|---|---|
| `photo` | Empty (`""`) | All 17 locations show "Photo coming soon". Add JPGs to `public/assets/photos/` and update the path. |
| `sections[].body` | Lorem ipsum | Needs real copy per location (history, new-in-2026, etc.) |
| `programming` | Placeholder artists | Needs real artist names and set times |
| Bars | 2 locations (bar-1, bar-2) | Client to confirm bar names and whether more exist |

**No code changes required** to update any of the above — only `locations.json` and the photo assets.

---

## Categories

Defined in `src/config/categories.js`. Current categories and their highlight colors:

| ID | Label | Color | Locations |
|---|---|---|---|
| `stages` | Stages | `#FF6B35` orange | 5 |
| `food` | Food | `#8BC34A` green | 3 |
| `shop` | Shop | `#4A90A4` teal | 1 |
| `camping` | Camping Zones | `#F5C842` gold | 3 |
| `restrooms` | Restrooms | `#4A90D9` blue | 2 |
| `guest-services` | Guest Services | `#E53935` red | 1 |
| `bars` | Bars | `#E91E90` pink | 2 |

---

## Swapping the 3D Model

When an updated GLB is delivered:

1. Drop the new `.glb` into `public/assets/model/` (same filename: `formFestMap.glb`)
2. Run the validator:
   ```bash
   npm run validate-model
   ```
   This cross-checks every mesh name in the GLB against the code's dependencies. Exit 0 = ready. Exit 1 = mesh names changed — the report tells you exactly what to update.
3. If mesh names changed, update `src/config/modelMap.js`
4. If the model origin or scale changed, update world-space coordinates in `src/data/locations.json` (`pinPosition`, `cameraTarget`, `cameraPosition`)
5. Rebuild and verify with `npm run dev` — mesh labels are overlaid on the 3D scene automatically in dev mode (auto-stripped from production builds)

The validator understands Three.js's internal name sanitization (dot-stripping, multi-material suffixes) so you're comparing against the same names the runtime uses, not the raw Blender names.

---

## Project Structure

```
src/
  main.js                  — boot, render loop, category interaction
  scene/
    engine.js              — renderer, camera, resize
    model.js               — GLB loader, mesh index, highlight/dim/restore
    lighting.js            — HDRI + sun, day/live/night presets, transitions
    postprocessing.js      — EffectComposer pipeline
    water.js               — animated water shader (pool surface)
    controls.js            — OrbitControls + flyTo animations
  config/
    categories.js          — category definitions and highlight colors
    modelMap.js            — mesh name → location ID mapping
  data/
    locations.json         — all location content (single edit point)
  ui/
    loader.js              — loading screen + progress bar
    categories.js          — bottom category button bar
    pins.js                — floating label pins on the 3D scene
    modal.js               — location detail modal
    raycast.js             — hover + click detection on buildings
    lightingToggle.js      — day/live/night toggle (top-right)
    entryOverlay.js        — entry screen + back button
  styles/
    main.css               — all styles

public/
  assets/
    model/formFestMap.glb  — 3D model (2.5 MB, Draco compressed)
    hdri/desert_2k.hdr     — HDRI environment map (1.4 MB)
    photos/                — location photos (create this folder when adding the first JPG)
    icons/                 — mouse SVG icons for desktop controls legend
  draco/                   — Draco WASM decoder (do not modify)

scripts/
  validate-model.mjs       — GLB mesh validator (npm run validate-model)
  optimize-model.mjs       — GLTF → GLB conversion utility (npm run optimize-model)
  inspect-all.mjs          — dev diagnostic: full mesh/material dump
  inspect-meshes.mjs       — dev diagnostic: mesh name listing
```

---

## Dev Tools (auto-removed in production)

Two tools are available during development, guarded by `import.meta.env.DEV` — they are automatically tree-shaken out of the production build and do not appear on the live site:

- **HDRI Controls panel** — real-time sliders for sun position, color, fog, shadows, tone mapping. "Apply to Source" writes directly to `lighting.js` via the Vite dev server.
- **Mesh Labels overlay** — floating labels over every mesh in the 3D scene, for verifying the `modelMap.js` mappings visually.

To access dev tools, run `npm run dev` and open `http://localhost:5173`.

---

## Build & Deployment

```bash
npm run build
```

Output in `dist/` — static files, ready to deploy to any host. Current bundle sizes (gzipped): Three.js chunk ~195 kB (hashed, long-cache-friendly), app chunk ~14 kB, CSS ~4 kB. Only the app chunk changes between content updates.

This repo is connected to Vercel for preview deployments. Push to `master` → auto-deploys in ~60 seconds.

---

## Notes for Integration

- **No WebGPU dependency** — the renderer uses `WebGLRenderer` (WebGL 2). Supported in all modern browsers including iOS Safari 15+.
- **No external runtime dependencies** — Three.js is bundled. No CDN calls at runtime.
- **Font** — Montserrat is loaded via Google Fonts in `index.html`. If the FORM website already loads Montserrat, this link can be removed to avoid duplicate requests.
- **Shadow bias** — `sunLight.shadow.bias` is set to a negative value intentionally. Do not set to 0 or positive — it causes moiré artifacts on the terrain geometry.
- **Dev tools strip cleanly** — `import.meta.env.DEV` blocks are removed by Vite's tree-shaker at build time. The HDRI panel and mesh labels generate zero bytes in production.
