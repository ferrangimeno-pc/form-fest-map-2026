# FORM Fest 2026 — Interactive 3D Map Roadmap

## Project Overview
Interactive 3D site map for [experienceform.com](https://www.experienceform.com/) — a music/arts festival at Arcosanti. The map allows users to explore the venue, filter by category, and view details about each location.

---

## Tech Stack (Confirmed)

| Layer | Technology | Why |
|-------|-----------|-----|
| 3D Engine | **Three.js** (r170+) | GLTF loading, orbit controls, raycasting, HDRI, shadow maps — all built-in |
| GPU Renderer | **WebGPURenderer** with automatic **WebGLRenderer** fallback | WebGPU for quality + performance where supported; WebGL for broad compatibility |
| Lighting | **HDRI environment map** + **dynamic directional light** (sun) | HDRI for ambient fill/reflections; directional light for time-of-day shadows |
| 3D Format | **GLB with Draco compression** (converted from current GLTF+BIN) | ~24MB → ~5-8MB estimated |
| UI | **Vanilla HTML/CSS/JS** | No framework dependency — maximum portability for client integration |
| Data | **JSON file** | Easy to update locations, content, photos, schedules |
| Build | **Vite** (dev) → static **HTML + /assets/** folder (production) | Fast dev experience, clean production output |

---

## Architecture

```
02_Dev/
├── index.html                  # Entry point
├── vite.config.js              # Build config
├── package.json
├── src/
│   ├── main.js                 # App bootstrap
│   ├── scene/
│   │   ├── engine.js           # Three.js scene, renderer (WebGPU/WebGL), camera
│   │   ├── lighting.js         # HDRI + directional sun + 3 time states
│   │   ├── model.js            # GLB loader + Draco decoder
│   │   ├── controls.js         # OrbitControls with limits + fly-to animations
│   │   └── raycaster.js        # Pin click detection
│   ├── ui/
│   │   ├── categories.js       # Bottom category buttons
│   │   ├── pins.js             # CSS2D label pins on map
│   │   ├── modal.js            # Full-screen detail modal
│   │   ├── loader.js           # Loading screen + progress bar
│   │   ├── lightingToggle.js   # Time-of-day toggle (A/B/C)
│   │   └── hdriPanel.js        # DEV ONLY: temporary HDRI controls
│   ├── data/
│   │   └── locations.json      # All location content
│   ├── config/
│   │   ├── modelMap.js         # GLTF object name → location ID mapping
│   │   └── categories.js       # Category definitions, colors, icons
│   └── styles/
│       └── main.css            # All styles (FORM design system)
├── public/
│   └── assets/
│       ├── model/
│       │   └── formFestMap.glb # Compressed 3D model
│       ├── hdri/
│       │   └── desert.hdr      # HDRI environment (user to provide)
│       ├── photos/
│       │   └── (placeholder images per location)
│       └── fonts/
│           └── (if needed)
└── dist/                       # Production build output
    ├── index.html
    └── assets/
```

---

## Feature Breakdown

### Phase 1: Foundation
1. **Project scaffolding** — Vite, Three.js, folder structure
2. **3D model optimization** — Convert GLTF+BIN → compressed GLB with Draco
3. **Scene setup** — WebGPU renderer with WebGL fallback, camera, basic lighting
4. **Model loading** — GLB loader with Draco decoder, loading progress tracking
5. **Loading screen** — Progress bar matching FORM visual style

### Phase 2: Lighting & Environment
6. **HDRI environment** — Load desert HDRI, apply as scene environment + background
7. **Dynamic sun system** — Directional light with 3 states:
   - **State A (Live):** Sun position based on user's local time (calculated sun angle)
   - **State B (Day):** Fixed at 12:00 PM (sun overhead, bright)
   - **State C (Night):** Fixed at 12:00 AM (moonlight, cool tones)
8. **Real-time shadows** — Optimized shadow maps on directional light (not baked, since time changes)
9. **DEV: HDRI controls panel** — Temporary popup with sliders for: HDRI rotation, HDRI intensity, exposure, tone mapping, shadow bias/intensity. Will be removed once look is locked in.

### Phase 3: Camera & Navigation
10. **OrbitControls** — Zoom in/out, rotate (orbit), pan
11. **Camera limits** — Min/max zoom distance, polar angle clamped (cannot see below horizon), optional pan boundaries to keep map in view
12. **Fly-to animations** — Smooth camera transition when a category is selected (GSAP or Three.js Tween)

### Phase 4: UI — Categories & Pins
13. **Category buttons** — Bottom bar with: STAGES, FOOD, SHOP, CAMPING ZONES, RESTROOMS, GUEST SERVICES, BARS, MISC
    - Each has a unique active color (from UI designs)
    - Only one active at a time (toggle behavior)
    - Deselecting resets map to default view
14. **Pin labels** — CSS2DRenderer overlay pins with location names
    - Appear when a category is selected
    - Connected to 3D position via a line/stem
    - Clickable → opens modal
15. **Highlight system** — When category is active, corresponding 3D objects change material color/emissive to match category color. Non-highlighted areas can dim slightly.

### Phase 5: Modal & Content
16. **Detail modal** — Full-screen on mobile, large overlay on desktop
    - Scroll-locked background (map doesn't scroll behind)
    - Close button (X)
    - Content: FORM logo, location title, photo, sections (HISTORY, NEW IN 2026, PROGRAMMING/schedule)
    - Styled to match FORM design system (serif titles, clean typography)
17. **JSON data structure** — Each location contains:
    ```json
    {
      "id": "amphitheater",
      "name": "Amphitheater",
      "category": "stages",
      "modelObjects": ["map.osm_buildings.005"],
      "pinPosition": { "x": 0, "y": 1.5, "z": 0 },
      "cameraTarget": { "x": 0, "y": 0, "z": 0 },
      "cameraPosition": { "x": 5, "y": 5, "z": 5 },
      "photo": "assets/photos/amphitheater.jpg",
      "sections": [
        { "title": "HISTORY", "body": "Lorem ipsum..." },
        { "title": "NEW IN 2026", "body": "Lorem ipsum..." }
      ],
      "programming": [
        { "time": "3:00PM", "artist": "ARTIST NAME" }
      ]
    }
    ```

### Phase 6: Lighting Toggle UI
18. **Time-of-day toggle** — Top-right corner, small UI control (3 icons/buttons):
    - Clock icon showing live `HH:MM` (actual user time)
    - Sun icon (DAY — 12:00 PM)
    - Moon icon (NIGHT — 12:00 AM)
    - Smooth ~1s transition between states
    - Responsive: scales and repositions on all breakpoints

### Phase 6.5: Responsive Design (all phases)
Responsiveness is built into every phase, not bolted on at the end. Key breakpoints:

| Breakpoint | Target | Layout Notes |
|------------|--------|-------------|
| `< 480px` | Small phones | Category buttons: 3 columns, smaller text. Modal: full-screen. Lighting toggle: compact. Pin labels: smaller font |
| `480–768px` | Large phones / small tablets | Category buttons: 3 columns. Modal: full-screen. |
| `768–1024px` | Tablets | Category buttons: single row scrollable. Modal: centered overlay (~500px wide). |
| `> 1024px` | Desktop | Category buttons: single row. Modal: centered overlay (~550px wide). Full orbit controls. |

All UI elements use:
- `rem`/`em` units (not `px`) for font sizes
- `%` or `vw/vh` for layout dimensions
- CSS container queries or media queries at each breakpoint
- Touch-friendly tap targets (min 44px) on mobile
- The 3D canvas is always `100%` of its container — the map adapts to whatever space the client gives it

### Phase 7: Polish & Optimization
19. **Performance optimization**
    - Texture compression (KTX2/Basis Universal)
    - LOD or mesh simplification for distant objects
    - Efficient shadow map resolution (1024 or 2048 max)
    - Throttle raycasting on mobile
    - requestAnimationFrame optimization (pause when tab hidden)
20. **Responsive design** — Test and tune for mobile (touch controls), tablet, desktop
21. **Loading target** — Under 3 seconds on 4G (aggressive asset compression + lazy HDRI)
22. **Cross-browser testing** — Chrome, Safari, Firefox, Edge; iOS Safari, Android Chrome

### Phase 8: Production Build
23. **Remove HDRI dev panel** — Hardcode final HDRI settings
24. **Production build** — Vite build → `dist/` folder with `index.html` + `assets/`
25. **Integration documentation** — Brief instructions for client on how to embed

---

## Design System (from FORM website + UI mockups)

### Colors
| Role | Color | Usage |
|------|-------|-------|
| FORM Logo / Primary Accent | `#FF4500` (orange-red) | Logo, primary highlights |
| Background (map area) | Rendered 3D scene | Desert terrain tones |
| Background (modal) | `#F5F0E8` (warm cream) | Modal overlay background |
| Text Primary | `#1A1A1A` (near black) | Headings, body text |
| Text Secondary | `#666666` | Subheadings, metadata |
| Button Default | `#C8C0B4` (warm gray) | Inactive category pills |
| Button — Stages | `#FF6B35` (orange) | Active state |
| Button — Food | `#8BC34A` (green) | Active state |
| Button — Shop | `#4A90A4` (teal) | Active state |
| Button — Camping Zones | `#F5C842` (gold) | Active state |
| Button — Restrooms | `#4A90D9` (blue) | Active state |
| Button — Guest Services | `#E53935` (red) | Active state |
| Button — Bars | `#E91E90` (hot pink) | Active state |
| Button — Misc | `#9E9E9E` (gray) | Active state |

### Typography
| Element | Font | Weight | Notes |
|---------|------|--------|-------|
| FORM Logo | Custom / Montserrat | Bold | Outlined style |
| Location titles (modal) | Serif (PT Serif or similar) | Regular | Large, editorial feel |
| Section headings | Sans-serif (Montserrat) | Bold | Uppercase |
| Body text | Sans-serif (Open Sans / Lato) | Regular | 14-16px |
| Category buttons | Sans-serif (Montserrat) | Semi-bold | Uppercase, small |
| Pin labels | Sans-serif (Montserrat) | Bold | White bg, dark text, small |

### UI Components
- **Category pills**: Rounded rectangle (`border-radius: 20px`), ~40px height
- **Pin labels**: White card with subtle shadow, connected by thin vertical line to map point
- **Modal**: Full-screen mobile, max-width ~500px desktop, rounded top corners on mobile
- **Loading bar**: Thin horizontal bar, FORM orange accent color

---

## Locations (from UI designs)

| Category | Locations |
|----------|-----------|
| Stages | Apse, Vaults, Amphitheater, Pool, Envelop |
| Food | Cafe, Foundry, Bodega |
| Shop | Shop (1 location) |
| Camping Zones | Camping, Glamping RVs, Glamping |
| Restrooms | Restrooms x2 (two locations) |
| Guest Services | Guest Services (1 location) |
| Bars | Bar x2 (two locations) |
| Misc | TBD |

---

## Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Renderer | Three.js WebGPURenderer + WebGL fallback | Best balance of features, quality, and compatibility |
| Shadows | Real-time (not baked) | Required for 3 lighting time states |
| Object naming | Config mapping file | Avoids requiring Blender re-export; easy to update when model changes |
| Data format | External JSON | Client can update content without touching code |
| Deliverable | HTML + assets folder | Universal, works with any hosting/CMS |
| HDRI tuning | Dev panel → hardcoded | Iterative design process, clean production output |

---

## Dependencies & Blockers

| Item | Status | Owner | Notes |
|------|--------|-------|-------|
| Desert HDRI image | **DONE** | User | `3d map/hdri_2k.hdr` (5.5MB, 2K) |
| Location photos | Pending | Client | Using placeholders for now. Add to `public/assets/photos/` |
| Location text content | Pending | Client | Using lorem ipsum. Update in `locations.json` |
| Client website tech stack | Unknown | User to confirm | Affects final integration approach |
| GLTF object-to-location mapping | To be done | Dev | Need to identify which mesh names correspond to which venue areas |

---

## Swap-Friendly Model Architecture

When the 3D model is updated:
1. Replace `formFestMap.glb` in `public/assets/model/`
2. Update `config/modelMap.js` if object names changed
3. Update `pinPosition` and `cameraTarget` values in `locations.json` if layout changed
4. Rebuild (`npm run build`)

No code changes needed unless the model structure fundamentally changes.
