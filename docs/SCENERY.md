# Natural scenery and street furniture

The scene loader reads optional GeoJSON FeatureCollections with the same city
filename as the roads:

- [natural/](../public/data/natural/) contains trees, tree rows, beaches, parks,
  gardens, shrubbery, bare rock, scree, and water/coastlines.
- [decor/](../public/data/decor/) contains street furniture and barriers.

Export queries: [natural](../public/data/natural/osm_query.txt) and
[decor](../public/data/decor/osm_query.txt). Keep OSM attribution in exports.
Missing files are harmless. Tree loading now uses natural rather than trees;
only natural=tree points produce individual trees. Tree rows add trees roughly
every 8 metres, suppressing duplicates in the same 4 metre placement cell.

## Ground cover

[NaturalGenerator](../src/core/scene/NaturalGenerator.ts) triangulates Polygon
footprints and holes, then clips them to the same terrain grid triangles used by
vehicle contact. Beaches are sand-coloured, parks/gardens green, and bare rock
and scree grey/brown. World-space procedural grain varies their surfaces without
texture downloads. The default ground is muted earth, distinguishing vegetation
from undeveloped areas. Layers sit below road ribbons and retain water and tunnel
portal cutouts. Garden/park layering uses separate small height offsets.

Only polygons intersecting the loaded terrain render. Features outside elevation
coverage are clipped; missing beaches beyond the map boundary are intentional.
No satellite imagery, inferred vegetation coverage, or detailed cliff meshes are
introduced. SRTM remains the ground elevation source, so narrow beaches can still
follow an imperfect coastal height estimate. Ground-cover colour does not change
vehicle grip or replace the existing road contact model.

## Decor

[DecorGenerator](../src/core/scene/DecorGenerator.ts) generates:

- Benches, waste/recycling/grit bins, post boxes, drinking-water taps, hydrants,
  telephone/parking-meter blocks, and bicycle stands.
- Bus-stop, traffic and clock sign panels; shelters.
- Street lamps, directional surveillance cameras, utility poles and flagpoles.
- Fountain basins and simple jets, memorial plinths and tagged statues/sculptures.
- Walls, retaining walls, hedges, fences, chains, guardrails, kerbs, platform
  paving, embankment/cutting edges, bollards, blocks, gates, and barriers.
- Individual shrubs from natural data.

These are generic geometric representations, not replicas of individual landmarks.
Bus-stop signs show a bus pictogram, mapped name (or English/local reference fallback),
and stop reference when supplied. Names wrap to two lines. Both sides have readable
lettering. Sign artwork is cached per name/reference, hidden beyond 110 metres, and
released on city changes. Bus platforms tagged bus=yes also receive signs. Other
sign text and clock faces are not reproduced. Gate booms are upright with posts
beside the mapped opening; no unknown access state is interpreted as a closed road.
Kerbs/platforms are visual paving; substantial obstacles participate in scenery
collisions. Fences/chains use simplified solid collision strips. Long barriers
are split into terrain-following segments. OSM height/width and numeric or eight-point compass direction
are respected within reasonable bounds. Furniture uses terrain height or the road
surface under its mapped position; layer tags guide road-level selection. Terrain
and estimated road levels cannot determine every retaining wall's actual height.

Primitives share geometry/materials and are instanced in 200 metre spatial cells
for frustum culling. At night, features tagged `highway=street_lamp` have glowing warm-yellow fixtures.
A fixed pool of eight shadowless point lights illuminates the nearest lamps within
90 m of the driving car or creative camera. Assignment updates at most four times
per second; each active light has intensity 180 and range 22 m. All mapped lamp
heads can glow, but only the nearest eight cast light onto surfaces. Morning/noon
disable both effects. Utility poles and surveillance fixtures do not become street
lights. The fixed pool avoids creating thousands of lights or repeatedly changing
the scene's light count. See [time of day and vehicle lighting](DRIVING.md#sky).
City changes and disposal release generated meshes and instance resources.

## Verification

Use the production build for TypeScript/bundling checks. One-off in-memory scene
inspection can check all city loads, finite geometry/instance matrices, and cleanup
without adding test files or test infrastructure to the game. Visual review in a
browser is still useful for placement and local OSM/SRTM inaccuracies.


## Stadium buildings

Polygons tagged `building=stadium` or `leisure=stadium` in the buildings dataset
use an open bowl with eight stepped spectator tiers, concrete bands, a green
playing field and basic white pitch markings. The mapped outline determines the
stand shape and orientation, while `height` controls the stand height (12 m by
default). Collisions follow the stand rings, leaving the playing field open.
These are generic stadiums, not reproductions of individual venues.

## Tree model and height

Trees now use [Low Poly Broadleaf Tree](../public/models/trees/broadleaved.gltf) by
EliXO, instanced by source mesh/material in 200 m cells. Full node transforms are
preserved before normalizing the model: its lowest vertex is placed on the terrain
and its full vertical extent is scaled to the selected height. Width scales
proportionally; rotation and fallback heights are deterministic for each tree ID.
The model's buffer reference points to the supplied broadleaved.bin. Credits appear
on the public attribution page under CC BY 4.0.

Height selection, in priority order:

1. Positive metric `height` (number or a value such as `13 m`).
2. `height:range`: e.g. `9-12 m`, `4 to 4.99m`, or semicolon-separated endpoints.
   A stable value is selected inside that range. `<6 m` uses 3?6 m;
   `>24 m` uses 24?30 m (50?100% or 100?125% of the bound respectively).
3. A stable value from 5?12 m when tags are absent or invalid.

Tree rows use the same generator and retain their inherited tags. Source geometry
and materials are shared across cells and released when the generator is disposed.

## Directions and removed decor

`direction` accepts numeric degrees and only N, NE, E, SE, S, SW, W, NW
(case insensitive). North is negative local Z, east is positive X. Full words,
compound expressions and other non-numeric strings are ignored.

`man_made=surveillance` generates a small camera and supporting post only when
`camera:direction`, or failing that `camera:angle`, supplies a supported bearing.
The latter is treated as the bearing fallback requested by the game, not a
field-of-view setting. Missing/invalid bearings generate nothing.

The generator no longer interprets `information`, `advertising`,
`man_made=street_cabinet/mast/tower`, `power=pole/tower` or `tourism` as decor.
Other independently supported tags on the same feature can still generate furniture.
Statues explicitly identified by artwork_type, memorial or historic remain supported.
Named museum/hotel/hostel building signs are handled by the building generator.

Hydrants tagged `emergency=fire_hydrant` with `fire_hydrant:type=underground`
are omitted from both decor geometry and collisions. Other/missing types retain
the current above-ground representation. The tag spelling is `fire_hydrant:type`.

Traffic-sign decor now uses the configurable basic families in
[TRAFFIC_SIGNS.md](TRAFFIC_SIGNS.md#configurable-basic-sign-rendering). Only mapped
Point features produce panels; unknown codes and sign lines/polygons are omitted.
