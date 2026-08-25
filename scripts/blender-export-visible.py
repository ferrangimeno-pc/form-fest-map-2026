"""Headless glTF export limited to VISIBLE objects.

Exports the opened .blend to GLTF_SEPARATE (.gltf + .bin + textures) with
`use_visible=True`, so Blender-hidden working objects (backups, profile
curves, reference empties, duplicate terrain stacks) never leak into the
export — the leakage that scripts/cleanup-model.mjs had to strip from the
18/08/2026 artist export.

Note: render-hidden but eye-VISIBLE objects (e.g. the Durango tents) ARE
exported — matching what ships (same pattern as the old CampingTent).

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b <file.blend> \
    --python scripts/blender-export-visible.py -- <output.gltf>

Then the usual pipeline:
  node scripts/cleanup-model.mjs <output.gltf> <tmp-dir>
  node scripts/optimize-model.mjs "<tmp-dir>/<name>.gltf"
  npm run validate-model
"""
import bpy, sys, os

argv = sys.argv
out = argv[argv.index('--') + 1] if '--' in argv else None
if not out:
    print('ERROR: pass output path after "--"')
    sys.exit(1)

out = os.path.abspath(out)
os.makedirs(os.path.dirname(out), exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLTF_SEPARATE',   # .gltf + .bin + external textures
    use_visible=True,                # visible objects only — the whole point
    export_apply=True,               # apply modifiers (geometry-node scatters)
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',      # keep source formats (jpg stays jpg)
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_extras=False,
    export_cameras=False,
    export_lights=False,
)
print('EXPORTED:', out)
