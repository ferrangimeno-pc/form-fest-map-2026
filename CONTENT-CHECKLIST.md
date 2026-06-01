# FORM Fest 2026 — Content Delivery Checklist

Tracks every item the **client** needs to deliver before launch. Tick a box when the asset/copy has been received from the client AND committed to the repo.

- **Photo** — landscape JPG, ~1600×900, < 300 KB, filename `<id>.jpg` placed in `public/assets/photos/`. Until provided, the modal shows "Photo coming soon".
- **Copy** — replaces the lorem-ipsum body text in `src/data/locations.json`. Section title is `HISTORY` + `NEW IN 2026` for stages, `ABOUT` for everything else.
- **Programming** — `time` + `artist` list. Stages only.
- **Name** — only flagged where the placeholder is generic (e.g. "Bar"). Confirm or rename.

## Stages (5)

| ID | Name | Photo | Copy | Programming |
|---|---|:-:|:-:|:-:|
| `apse` | Apse | ☐ | ☐ | ☐ (5 slots) |
| `vaults` | Vaults | ☐ | ☐ | ☐ (5 slots) |
| `amphitheater` | Amphitheater | ☐ | ☐ | ☐ (5 slots) |
| `pool` | Pool | ☐ | ☐ | ☐ (3 slots) |
| `envelop` | Envelop | ☐ | ☐ | ☐ (3 slots) |

## Food (4)

| ID | Name | Photo | Copy |
|---|---|:-:|:-:|
| `cafe` | Cafe | ☐ | ☐ |
| `foundry` | Foundry | ☐ | ☐ |
| `bodega` | Bodega | ☐ | ☐ |
| `grab-and-go` | Grab and Go | ☐ | ☐ |

> `grab-and-go` is a **dual-section** entry — it's the *same building* as the `bar-2` "Bar" (Bars section, the bar beside Soteria). The model object shows as "Bar" by default and as "Grab and Go" only while the Food filter is active, with its own photo/copy. Edit `grab-and-go` for the Food-side content; edit `bar-2` for the Bar-side content. Do not change either entry's `id`/`category`/positions.

## Shop (2)

| ID | Name | Photo | Copy |
|---|---|:-:|:-:|
| `shop` | Shop | ☐ | ☐ |
| `bodega-shop` | Bodega | ☐ | ☐ |

> `bodega-shop` is a **dual-section** entry — it's the *same building* as the `bodega` "Bodega" (Food section). The model object shows as "Bodega" in Food (green) by default and highlights with the Shop color while the Shop filter is active (same name, its own photo/copy). Edit `bodega-shop` for the Shop-side content; edit `bodega` for the Food-side content. Do not change either entry's `id`/`category`/positions.

## Camping (3)

| ID | Name | Photo | Copy |
|---|---|:-:|:-:|
| `glamping` | Glamping | ☐ | ☐ |
| `glamping-rvs` | Glamping RVs | ☐ | ☐ |
| `car-camping` | Car Camping | ☐ | ☐ |

## Restrooms (2)

| ID | Name | Photo | Copy |
|---|---|:-:|:-:|
| `restrooms-1` | Restrooms | ☐ | ☐ |
| `restrooms-2` | Restrooms | ☐ | ☐ |

## Guest Services (3)

| ID | Name | Photo | Copy |
|---|---|:-:|:-:|
| `guest-services` | Guest Services | ☐ | ☐ |
| `soteria` | Soteria Safe Space | ☐ | ☐ |
| `medical` | Medical | ☐ | ☐ |

> `soteria` and `medical` are new buildings added in the 01/06/2026 model update — confirm the display names and whether either needs different copy treatment than the generic `ABOUT` section.

## Bars (2) — names need client confirmation

| ID | Name (placeholder) | Confirmed name | Photo | Copy |
|---|---|---|:-:|:-:|
| `bar-1` | Bar | ☐ | ☐ | ☐ |
| `bar-2` | Bar | ☐ | ☐ | ☐ |

> Client to also confirm whether additional bars exist beyond these two.

---

## Site-wide content questions for the client

- [ ] Final festival dates (currently not surfaced anywhere visible)
- [ ] Confirm category labels — happy with `Stages / Food / Shop / Camping Zones / Restrooms / Guest Services / Bars`?
- [ ] Confirm bar count (2 currently mapped)
- [ ] Any sponsor logos / partner logos to surface in the modal or elsewhere?
