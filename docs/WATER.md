# Water

Water is loaded exclusively from `public/data/natural/<city-file>.json`.
Cities without natural water/coastline features continue to load without water.
The legacy water folder is not read. There are no runtime OSM queries,
additional packages, or downloaded textures.

## Supported geometry

- Directed `natural=coastline` LineStrings are joined by matching endpoints,
  clipped to the terrain extent, and closed along the map boundary on the sea
  side. OSM coastline direction is preserved. An export must extend beyond the
  loaded map bounds at both ends of each open shoreline; incomplete interior
  endpoints are reported and omitted rather than inventing a coastline.
- Closed coastlines, including ones exported as Polygons, preserve land islands.
- `natural=water` Polygons and MultiPolygons preserve their inner rings. This
  includes ponds, reservoirs, basins, lakes, and bays in the supplied export.

The current Monaco data produces two coastal sea polygons and 28 additional
water areas intersecting the map. Source features extending beyond the map are
clipped, rather than discarded wholesale.

## Heights and rendering

Coastline-generated sea stays at 0 m above sea level. Explicit numeric OSM `ele`
values on inland/bay polygons are authoritative, including zero and negative values.
Blank or nonnumeric elevations use estimation instead.

For untagged water, estimate the **10th percentile** of terrain heights at the outer
boundary vertices minus **0.5 m**. The repeated closing vertex is excluded. The
percentile linearly interpolates sorted samples at index `(count - 1) * 0.1`,
favouring low banks without always selecting the absolute lowest sample. Very small
rings still have limited resistance to outliers. Group polygons whose actual boundaries touch,
intersect, or whose water interiors overlap. Connections are transitive and include
shared edges and vertex-on-edge contacts with differing vertex spacing. A tiny
0.1 mm numerical tolerance does not bridge real gaps. Dry holes/islands do not
connect an enclosed isolated pond to the surrounding water.

Each connected group uses its **largest polygon by area, subtracting holes**, as
its elevation source. A group touching coastline sea or an untagged bay uses sea
level instead. Explicit `ele` polygons keep their own values even when different
from their group's estimate; if the largest polygon has explicit `ele`, its value
supplies the other untagged polygons. Independent water bodies retain their own
local estimate and are not forced to match the globally largest lake/canal.

[WaterLevels](../src/core/scene/WaterLevels.ts) performs this resolution once at load
time using an indexed boundary search. Rendered water, shoreline banks, ship
placement and vehicle contact subsequently use the same resolved heights. This is
a game heuristic, not a hydraulic model: locks/dams are not automatically detected
as connectivity barriers. Use explicit elevations where touching water bodies
must retain different levels. Terrain is never raised to meet water. The rendered
surface remains 2.5 cm above its resolved source level.

[WaterGenerator](../src/core/scene/WaterGenerator.ts) triangulates these areas
with their holes, preserves source terrain elevations, removes covered terrain using the shared polygon clipping
utility, and seals shoreline gaps with simple bank faces. Water has subtle
animated colour ripples with a shared material. The shoreline stays fixed;
there is no bathymetry or wave displacement. Coarse SRTM and newer coastal
reclamation can still differ from the mapped shoreline.

## Vehicle contact

During driving, recovery occurs only when the vehicle's collision body intersects
the mapped water surface. The footprint is sampled across its length and width,
and its vertical extent must overlap the rendered surface (source level + 2.5 cm,
with a 1 cm contact tolerance). The previous fixed-step height catches a fast
crossing between updates. Merely being over the polygon, or already entirely
below the surface, does not trigger recovery. Bridges, underwater tunnels and
creative flight therefore do not reset merely for sharing water coordinates.
Saved positions are not automatically relocated based on water footprint alone.
Delete, the mobile Reset button and Reset location remain available for manual
recovery. Recovery restores the city spawn and clears motion/input.

## Exporting another city

Use [Overpass Turbo](https://overpass-turbo.eu/) and the query in
[natural/osm_query.txt](../public/data/natural/osm_query.txt). Select an area larger than
the entire terrain extent, including connected coastline beyond its edges.
Export **GeoJSON** into `public/data/natural/` with the same filename as that
city's road data. Native Overpass JSON is not the same format. Keep the OSM
copyright/ODbL attribution from the export.

## Stockholm coastline coverage

The original Stockholm natural export contained 53 coastline features with open
chains ending inside the loaded map. These could not be closed without inventing
shoreline across land, so the generator skipped the incomplete chains.

On 2026-10-26 the coastline subset was refreshed from the OpenStreetMap
[Overpass API](https://overpass-api.de/api/interpreter), requesting coastline ways
in `(59.27,17.98,59.39,18.18)` with full geometry. It now has 136 coastline features;
all non-coastline features and the original OSM attribution are preserved. This
provides complete surrounding context rather than guessing connections between
nearby shoreline endpoints. In the current loaded bounds it produces three
coastal water polygons without incomplete-chain warnings. Directional checks on
1,711 in-bounds shoreline segments found water on the expected sea side.

The [natural export query](../public/data/natural/osm_query.txt) now also requests
coastline ways within 3 km of the selected coastline set. Export a map region that
includes the entire drivable area; a buffer cannot repair disconnected or invalid
source mapping. Inland lake/river polygons and their island holes remain separate
from sea coastlines, including Lake Malaren's mapped elevation.

## Water excavation and vehicle contact

Water polygons now excavate the **vehicle terrain contact** as well as the visible
terrain mesh. Previously the rendered canal could be empty while the car still
rested on the original HGT/TIFF elevation, creating an invisible driving surface.

[SceneManager.getRoadState](../src/core/scene/SceneManager.ts) first resolves actual
road and rail contacts. If there is no structural floor, the water generator
checks the existing polygon index at that horizontal position and lowers the
terrain support to at most three metres below the resolved water height. Slopes
are zeroed when this fallback is lowered; already deeper terrain is retained.
This depth is a gameplay fallback, not surveyed canal bathymetry. The source
elevation raster and generated land heights outside water remain unchanged.

Road decks, bridges, selected rail floors and tunnels keep their own collision
surface through their contact identifier. Polygon holes retain land/island
support. Vehicles therefore fall under normal gravity when leaving a quay into
open water, rather than hovering on the old elevation surface. The existing
water-contact reset still requires touching/crossing the water surface; merely
being above or below water does not trigger a reset.

Temporary validation used the actual Car update loop with a stub visual model:
a car above the canal fell 1.22625 m in 0.5 s and subsequently touched the water.
Checks also preserved dry land, island holes, deeper terrain, surface roads,
bridge decks, rail decks and tunnel floors. A car on a bridge retained support.
