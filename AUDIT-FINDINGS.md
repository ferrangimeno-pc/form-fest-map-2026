# Audit Findings — FORM Fest 2026 Interactive Map

**Audit date:** 2026-07-11 (read-only — nothing was changed)
**Scope:** architecture, security, performance/WebGL, 3D assets, deployment
**Status:** BACKLOG — nothing here has been implemented

> ⚠️ **RULE FOR THIS FILE (including AI assistants working in this repo):**
> Do **NOT** implement any item below on your own initiative, in passing, or bundled
> with other work. Every item requires explicit, per-item approval from Digo first.
> When work on this backlog resumes, **ask which item to start with** — never pick one
> unprompted. Check off items only after they are implemented AND verified.

How to reference items: each finding has an ID (`P1`, `S3`, …). Say "implement P1" to pick one up.

Priorities: 🔴 high impact · 🟡 worthwhile · ⚪ polish/nit.

---

## Summary

The project is well-built: clean module separation, DEV tooling correctly tree-shaken,
DPR cap, static shadow maps, quarter-res bloom, merged post FX passes, a mesh-name
validator that mirrors GLTFLoader behavior. The findings below are refinements, not
rescue. The two heavy hitters are **P1** (one roads mesh = 82% of all triangles) and
**D1** (Vercel ignores `_headers` → no caching/security headers in production).

Estimated combined effect of P1 + P2 + A1 + A2: first-visit payload drops from
~5.2 MB to ~2 MB, hover jank eliminated, large GPU headroom gain on mobile.

---

## P — Performance / WebGL / smoothness

### 🔴 P1. Roads mesh is 82% of the entire scene's geometry
- **Where:** `map.osm_roads_unclassified.001` inside `public/assets/model/formFestMap.glb`
- **Measured:** 1,216,512 of 1,473,726 total triangles (608,808 verts). Next-largest mesh is 84k tris.
- **Why it matters:** dominant per-frame GPU vertex cost (esp. mobile); it is NOT in
  `NO_SHADOW_CAST` (src/scene/model.js) so it also renders into the 2048² shadow map on
  every sun change; it bloats the GLB download.
- **Suggested fix:** `gltf-transform simplify` on that mesh (5–10% ratio is typically
  invisible for roads draped on terrain) — `@gltf-transform/core` is already a devDependency.
  Better long-term: decimated re-export from Blender. Also consider adding it to `NO_SHADOW_CAST`.
- **Effort:** small (script) / medium (Blender re-export). **Risk:** low — verify road
  visuals + validate-model after.

### 🔴 P2. Raycasting tests the 1.2M-triangle roads mesh on every hover frame
- **Where:** src/ui/raycast.js — `raycaster.intersectObjects(root.children, true)`
- **Why it matters:** Three.js has no BVH; the roads mesh's bounding sphere spans the map
  so nearly every mouse-move raycast walks its triangles linearly. Likely the single
  biggest desktop hover-frame cost.
- **Suggested fix:** build the array of interactive meshes once (keys of `MODEL_MAP` +
  dual-section meshes) and raycast only those. Alternative: `three-mesh-bvh`.
- **Effort:** small. **Risk:** low — keep the proximity-snap fallback behavior identical.

### 🟡 P3. Hover re-clones materials for every clickable mesh on each hover enter/leave
- **Where:** src/ui/raycast.js `_applyHover`/`_clearHover` → src/scene/model.js
  `tintMeshes`/`highlightMeshes` (clone + dispose per call)
- **Why it matters:** dozens of material allocations, uniform re-uploads, and GC pressure
  per hover transition.
- **Suggested fix:** meshes already own private material clones — mutate
  `material.color`/`emissive` in place, recomputing from `userData.originalMaterial`,
  instead of clone+dispose. Keep the water mesh `protectedMaterial` guard.
- **Effort:** medium. **Risk:** medium — must preserve side/shadowSide handling and the
  dual-section tint logic; test all hover/category/night-mode combinations.

### 🟡 P4. `backdrop-filter: blur()` sits over the live WebGL canvas
- **Where:** src/styles/main.css (~lines 222, 289, 336 — category bar, buttons)
- **Why it matters:** blurring a 60fps-repainting canvas forces an extra blur composite
  every frame — classic mobile jank source.
- **Suggested fix:** semi-opaque solid background on mobile (`@media` override), keep blur
  on desktop if the look matters.
- **Effort:** small. **Risk:** visual — needs design sign-off.

### 🟡 P5. No `powerPreference: 'high-performance'` on the renderer
- **Where:** src/scene/engine.js — `new THREE.WebGLRenderer({...})`
- **Why it matters:** dual-GPU laptops may run the map on the integrated GPU.
- **Suggested fix:** add `powerPreference: 'high-performance'` to the options.
- **Effort:** one line. **Risk:** negligible.

### 🟡 P6. SMAA could be replaced by WebGL2 hardware MSAA
- **Where:** src/scene/postprocessing.js (SMAAPass, desktop only)
- **Why it matters:** SMAA runs 3 full-screen passes; WebGL2 MSAA render target
  (`new WebGLRenderTarget(w, h, { samples: 4 })` passed to EffectComposer) gives better
  geometric AA at lower cost.
- **Effort:** small. **Risk:** low — verify grain/grade pass output and resize handling.

### ⚪ P7. `renderer.compile()` on category change is synchronous
- **Where:** src/main.js `handleCategoryChange`
- **Suggested fix:** `compileAsync()` to avoid any first-frame hitch after selection.

### ⚪ P8. Static-scene micro-optimizations
- `matrixAutoUpdate = false` on the model subtree after load (scene never moves).
- `updateWaterLighting` copies sun color/direction every frame though the sun changes at
  most every ~2s — gate it on actual change.

### ⚪ P9. Live-mode noon sun doesn't match the DAY preset
- **Where:** src/scene/lighting.js `getPresetForHour` — azimuth formula
  `90 + (hour/24)*360` puts 12 PM at 270° (west); DAY preset uses 160°.
- **Why it matters:** "Live" at midday looks different from the "Day (12 PM)" button.
- **Suggested fix:** align the live azimuth curve so noon ≈ the day preset azimuth.

---

## A — 3D assets

### 🔴 A1. Draco decoder forced to JS (504 KB) instead of WASM (188 KB)
- **Where:** src/scene/model.js — `dracoLoader.setDecoderConfig({ type: 'js' })`
- **Why it matters:** every visitor downloads the 504 KB JS decoder; WASM is ~2.7× smaller
  and decodes ~2–3× faster. (If the `js` forcing was a workaround for a specific device
  bug, document it; otherwise remove the line and let Three auto-pick WASM.)
- **Bigger step:** switch pipeline to **meshopt** (`EXT_meshopt_compression`, supported by
  gltf-transform): ~30 KB decoder, near-instant decode, removes `public/draco/` entirely.
- **Effort:** small (WASM) / medium (meshopt). **Risk:** low — test on iOS Safari.

### 🟡 A2. HDRI is 2k / 1.4 MB but only used as low-intensity IBL
- **Where:** public/assets/hdri/desert_2k.hdr — used at `environmentIntensity 0.3`;
  the visible background is a flat fog color, never the HDRI.
- **Suggested fix:** 1k HDR (~350–400 KB) — visually indistinguishable for pure
  environment lighting. Saves ~1 MB on first load.
- **Effort:** small. **Risk:** verify reflections on the pool/metallic surfaces.

### 🟡 A3. No preload hints for the big assets
- **Where:** index.html
- **Why it matters:** GLB/HDRI fetches start only after the JS boots.
- **Suggested fix:** `<link rel="preload">` for the GLB (as `fetch`, crossorigin) and HDR
  so they download in parallel with script parse.

### ⚪ A4. Other simplification candidates (minor next to P1)
- `Plane.005` 84k tris, `Cube.011` (parking lot) 39k, `Vert.001` (glamping) 28k.
- Three rock meshes (`rock`, `rock.002`, `rock.003`) duplicate geometry — could share
  a buffer / be instanced. Draw calls (109) are healthy, so this is optional.

### ⚪ A5. 3D source files exist only on local disk
- **Where:** `3d map/` and `Design UI/` are gitignored ("keep in local storage / shared drive").
- **Why it matters:** the GLTF source of truth has no version control; disk failure loses it.
- **Suggested fix:** confirm the shared-drive copy is current, or adopt Git LFS.

---

## S — Security

### 🔴 S1. Vite 6.4.1 has known dev-server vulnerabilities while the server is LAN-exposed
- **Where:** package.json (vite ^6.0.0 → resolves 6.4.1) + `server.host: true` in vite.config.js
- **Why it matters:** published advisories include arbitrary file read via the dev
  WebSocket and `.map` path traversal (fixed in 6.4.3). With `host: true`, any device on
  the same Wi-Fi can hit the dev server.
- **Suggested fix:** `npm audit fix` (also clears the protobufjs critical in the dev-only
  gltf-pipeline chain — 5 vulns total, all devDependencies).
- **Effort:** small. **Risk:** low — verify dev server + build still run.

### 🔴 S2. `/__dev/apply-settings` middleware = unauthenticated writes into source files
- **Where:** vite.config.js `devApplySettings()`
- **Why it matters:** accepts any POST (no Origin/Content-Type check) and regex-splices
  body values into `lighting.js`/`engine.js`, which HMR executes in the browser. With
  `host: true` anyone on the LAN — or any website open in your browser (a `text/plain`
  POST avoids CORS preflight → CSRF-able) — can inject code into the source tree while
  the dev server runs. Dev-only, but real.
- **Suggested fix:** check `Origin`/`Host` is localhost, or require a shared-secret header
  that the HDRI panel sends; optionally validate values are numeric/hex before splicing.
- **Effort:** small. **Risk:** none in production (middleware is dev-only).

### 🟡 S3. `esc()` doesn't escape quotes but is used in an attribute context
- **Where:** src/ui/modal.js — `esc()` (textContent→innerHTML only escapes `& < >`);
  used in `src="${esc(location.photo)}"`.
- **Why it matters:** a photo path containing `" onerror="…"` would execute. Content is
  first-party today, but client-supplied copy is due in the coming weeks.
- **Suggested fix:** escape `"` and `'` too, or build the `<img>` via `document.createElement`
  + `.src` assignment.

### 🟡 S4. Pin labels interpolate `loc.name` into `innerHTML` unescaped
- **Where:** src/ui/pins.js `showPins` (inconsistent with `showHoverPin`, which safely
  uses `textContent`, and with modal.js which escapes).
- **Suggested fix:** build with `textContent` like `showHoverPin` does.

### 🟡 S5. Source maps are publicly served in production
- **Where:** vite.config.js `sourcemap: true` — comment claims "not served publicly", but
  the full `dist/` deploys; confirmed live: `/assets/form-map.*.js.map` returns 200.
- **Suggested fix:** decide intentionally — either accept (fine for this project) and fix
  the comment, or use `sourcemap: 'hidden'` / exclude `.map` from deploy.

### ⚪ S6. Frame-embedding is open to all origins (documented, deliberate)
- No `X-Frame-Options` / `frame-ancestors` so the Webflow embed works from any domain.
  Once the final Webflow domains are known, consider locking `frame-ancestors` down
  (would live in vercel.json headers — see D1).

---

## D — Deployment

### 🔴 D1. Vercel ignores `public/_headers` — production has no caching or security headers
- **Where:** public/_headers (Cloudflare Pages/Netlify syntax); deploy target is Vercel.
- **Verified live (2026-07-11):** every asset — including hashed "immutable" JS chunks and
  the 2.5 MB GLB — serves `Cache-Control: public, max-age=0, must-revalidate`;
  `X-Content-Type-Options` and `Referrer-Policy` absent. The long-cache chunk strategy in
  vite.config.js is not in effect in production.
- **Suggested fix:** replicate the rules under a `"headers"` key in vercel.json:
  `/assets/*` and `/draco/*` → `max-age=31536000, immutable` (hashed/versioned files),
  GLB/HDR → long cache (they're content-addressed by deploy) or a modest max-age,
  plus `X-Content-Type-Options: nosniff` and `Referrer-Policy`.
  Keep `_headers` only if a Cloudflare Pages deploy also exists.
- **Effort:** small. **Risk:** low — verify with curl after deploy.

### 🟡 D2. No pre-push safety checks in the deploy flow
- **Where:** .claude/skills/deploy-to-vercel/SKILL.md — commits and pushes straight to
  master; Vercel deploys whatever lands.
- **Why it matters:** a broken build or GLB mesh rename ships and is discovered on the
  live site.
- **Suggested fix:** add `npm run build && npm run validate-model` as a required step
  before `git push` in the skill. Optionally use a Vercel preview branch for risky changes.

---

## X — Polish / accessibility nits

### ⚪ X1. Pins are focusable but not keyboard-activatable
- `role="button"` + `tabindex="0"` but no Enter/Space keydown handler (src/ui/pins.js).

### ⚪ X2. Modal lacks a focus trap
- Escape works and close gets focus, but Tab can escape into the page behind.

### ⚪ X3. `user-scalable=no` in the viewport meta
- WCAG flag; iOS ignores it anyway (index.html).

### ⚪ X4. Empty `#hdri-panel` div ships in production HTML
- Harmless (JS is tree-shaken) but could be removed at build time (index.html).

### ⚪ X5. three pinned at r170 (latest r185)
- No urgency. Note: `public/draco/` decoder files are version-coupled to the three release
  they were copied from — update them together if/when upgrading.

---

*Full audit context (measurements, curl outputs, GLB profile) from the 2026-07-11 session.
Payload today: ~664 KB three chunk + 44 KB app + 504 KB Draco JS + 2.5 MB GLB + 1.4 MB HDR ≈ 5.2 MB.*
