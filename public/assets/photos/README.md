# Location Photos

Place one landscape JPG per festival location in this folder.

## Naming

`<location-id>.jpg` — e.g. `amphitheater.jpg`, `vaults.jpg`, `cafe.jpg`.

The full list of IDs (one per location) is in the repo-root [CONTENT-CHECKLIST.md](../../../CONTENT-CHECKLIST.md).

## Specs

- **Aspect:** landscape, ideally ~1600×900 (16:9)
- **Format:** JPG
- **Size:** under 300 KB per file (compress before committing — this is the festival map's largest payload growth vector)

## Wiring a photo to a location

After dropping the JPG, open `src/data/locations.json` and update the matching entry's `photo` field from `""` to `"assets/photos/<location-id>.jpg"`.

Until then, the modal shows a "Photo coming soon" placeholder automatically — no breakage if a photo is missing.
