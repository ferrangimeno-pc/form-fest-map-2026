import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Dev-only plugin: POST /__dev/apply-settings → patch source files in place.
 * Vite's HMR picks up the file writes and hot-reloads automatically.
 */
function devApplySettings() {
  return {
    name: 'dev-apply-settings',
    configureServer(server) {
      server.middlewares.use('/__dev/apply-settings', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const {
          mode,
          sunColor, sunIntensity, sunElevation, sunAzimuth,
          exposure, ambientColor, ambientIntensity,
          shadowOpacity, fogDensity, fogColor,
          shadowBias, shadowNormalBias, shadowRadius,
          toneMappingType, envIntensity,
        } = body;

        // --- Patch lighting.js ---
        const lightingPath = resolve('src/scene/lighting.js');
        let lighting = readFileSync(lightingPath, 'utf8');

        // Patch the target preset block (day or night) — lazy match stops at first `},`
        const presetKey = mode === 'night' ? 'night' : 'day';
        const presetRe  = new RegExp(`(${presetKey}:\\s*\\{)([\\s\\S]*?)(\\s*},)`);
        lighting = lighting.replace(presetRe, (_, open, block, close) => {
          // Numeric fields (match at line start to avoid partial-name collisions)
          block = block.replace(/(^\s+intensity:\s*)[\d.]+/m,        `$1${sunIntensity}`);
          block = block.replace(/(^\s+elevation:\s*)[\d.]+/m,        `$1${sunElevation}`);
          block = block.replace(/(^\s+azimuth:\s*)[\d.]+/m,          `$1${sunAzimuth}`);
          block = block.replace(/(^\s+exposure:\s*)[\d.]+/m,         `$1${exposure}`);
          block = block.replace(/(^\s+ambientIntensity:\s*)[\d.]+/m, `$1${ambientIntensity}`);
          block = block.replace(/(^\s+shadowOpacity:\s*)[\d.]+/m,    `$1${shadowOpacity}`);
          block = block.replace(/(^\s+fogDensity:\s*)[\d.]+/m,       `$1${fogDensity}`);
          // Color fields — uppercase hex to match source style
          const uc = (hex) => hex.toUpperCase();
          block = block.replace(/(^\s+color:\s*new THREE\.Color\(')(#[^']+)('\))/m,        `$1${uc(sunColor)}$3`);
          block = block.replace(/(^\s+ambientColor:\s*new THREE\.Color\(')(#[^']+)('\))/m, `$1${uc(ambientColor)}$3`);
          block = block.replace(/(^\s+fogColor:\s*new THREE\.Color\(')(#[^']+)('\))/m,     `$1${uc(fogColor)}$3`);
          return open + block + close;
        });

        // Global shadow params (in initLighting body)
        lighting = lighting.replace(/(sunLight\.shadow\.bias\s*=\s*)[-\d.]+;/,      `$1${shadowBias};`);
        lighting = lighting.replace(/(sunLight\.shadow\.normalBias\s*=\s*)[\d.]+;/, `$1${shadowNormalBias};`);
        lighting = lighting.replace(/(sunLight\.shadow\.radius\s*=\s*)[\d.]+;/,     `$1${shadowRadius};`);
        // Global HDRI env intensity (in initLighting body)
        lighting = lighting.replace(/(scene\.environmentIntensity\s*=\s*)[\d.]+;/,  `$1${envIntensity};`);

        writeFileSync(lightingPath, lighting);

        // --- Patch engine.js tone mapping ---
        const enginePath = resolve('src/scene/engine.js');
        let engine = readFileSync(enginePath, 'utf8');

        const TM_NAMES = ['NoToneMapping', 'LinearToneMapping', 'ReinhardToneMapping', 'CineonToneMapping', 'ACESFilmicToneMapping', 'AgXToneMapping'];
        const tmName = TM_NAMES[Math.round(toneMappingType)] ?? 'ACESFilmicToneMapping';
        engine = engine.replace(/(renderer\.toneMapping\s*=\s*THREE\.)\w+;/, `$1${tmName};`);
        writeFileSync(enginePath, engine);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, patched: { preset: presetKey, sunColor, sunIntensity, fogDensity, tmName } }));
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [devApplySettings()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Inline small assets to reduce HTTP requests
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: 'index.html',
      output: {
        // Predictable names for the dev team integrating into the host site
        entryFileNames: 'assets/form-map.[hash].js',
        chunkFileNames: 'assets/form-map-[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        // Split Three.js into its own chunk — stays cached when map code changes
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    open: true,
    // Expose on local network for real-device testing (iPhone, Mac, etc.)
    // Access via http://<your-ip>:5173
    host: true,
  },
});
