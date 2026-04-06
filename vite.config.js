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
        const { exposure, sunIntensity, ambientIntensity, shadowBias, shadowNormalBias, toneMappingType } = body;

        // --- Patch lighting.js ---
        const lightingPath = resolve('src/scene/lighting.js');
        let lighting = readFileSync(lightingPath, 'utf8');

        // Patch day preset block only (lazy match stops at first `},`)
        lighting = lighting.replace(/(day:\s*\{[\s\S]*?\},)/, (dayBlock) => {
          dayBlock = dayBlock.replace(/(intensity:\s*)[\d.]+/, `$1${sunIntensity}`);
          dayBlock = dayBlock.replace(/(exposure:\s*)[\d.]+/, `$1${exposure}`);
          dayBlock = dayBlock.replace(/(ambientIntensity:\s*)[\d.]+/, `$1${ambientIntensity}`);
          return dayBlock;
        });

        // Patch shadow values (in initLighting body)
        lighting = lighting.replace(
          /(sunLight\.shadow\.bias\s*=\s*)[-\d.]+;/,
          `$1${shadowBias};`
        );
        lighting = lighting.replace(
          /(sunLight\.shadow\.normalBias\s*=\s*)[\d.]+;/,
          `$1${shadowNormalBias};`
        );

        writeFileSync(lightingPath, lighting);

        // --- Patch engine.js tone mapping ---
        const enginePath = resolve('src/scene/engine.js');
        let engine = readFileSync(enginePath, 'utf8');

        const TM_NAMES = [
          'NoToneMapping',
          'LinearToneMapping',
          'ReinhardToneMapping',
          'CineonToneMapping',
          'ACESFilmicToneMapping',
          'AgXToneMapping',
        ];
        const tmName = TM_NAMES[Math.round(toneMappingType)] ?? 'ACESFilmicToneMapping';
        engine = engine.replace(
          /(renderer\.toneMapping\s*=\s*THREE\.)\w+;/,
          `$1${tmName};`
        );
        writeFileSync(enginePath, engine);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, patched: { exposure, sunIntensity, ambientIntensity, shadowBias, shadowNormalBias, tmName } }));
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
