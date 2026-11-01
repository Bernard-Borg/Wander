# Traffic sign values in bundled data

Scanned all GeoJSON FeatureCollections under public/data on 2026-11-01. Counts are feature occurrences across files, not deduplicated OSM objects. Raw compound values are preserved verbatim. These values are present in the data; the inventory preserves raw tags rather than interpreting them. The renderer now decodes the initial subset documented below.

105 distinct raw values.

| traffic_sign value | Occurrences | Cities |
| --- | ---: | --- |
| `AT:1 "Ausgenommen landwirtschaftliche Fahrzeuge"` | 1 | vaduz |
| `AT:1 "Ausgenommen Radfahrer, sowie jagt-, forst- und landwirtschaftlicher Verkehr"` | 1 | vaduz |
| `AT:1 "Privatstraße""Kein öffentlicher Durchgang"` | 4 | vaduz |
| `AT:1 "Privatweg"` | 2 | vaduz |
| `AT:1: Fahrverbot (in beiden Richtungen)` | 2 | vaduz |
| `AT:1: Fahrverbot (in beiden Richtungen) "Ausgenommen Motorrad- und Radfahrer"` | 4 | vaduz |
| `AT:52.1` | 8 | vaduz |
| `AT:52.1 [an Schultagen von Mo-Fr 07:00-17:00; Ausgenommen Radfahrer, Pädagogen und Anrainerverkehr Schulgasse 2-7]` | 2 | vaduz |
| `AT:52.1 [Ausgenommen Forst]` | 1 | vaduz |
| `AT:52.1 [Privatstraße]` | 2 | vaduz |
| `AT:52.1,54` | 2 | vaduz |
| `AT:52.1,54[Ausgenommen Anrainer und Besucher]` | 2 | vaduz |
| `AT:52.1,54[Ausgenommen Anrainer und Radfahrer]` | 4 | vaduz |
| `AT:52.1,54[Ausgenommen Anrainer]` | 2 | vaduz |
| `AT:52.1,54[Ausgenommen Anrainer];AT:52.8c` | 5 | vaduz |
| `AT:52.1,54[Ausgenommen Berechtigte laut Verordnung AZ 04 05066 der Start Feldkirch]` | 4 | vaduz |
| `AT:52.1,54[ausgenommen Fahrradfahrer, jagd-, forst- und landwirtschaftlicher Verkehr]` | 1 | vaduz |
| `AT:52.1,54[Ausgenommen landwirtschaftliche Fahrzeuge],54[ausgenommen Radfahrer]` | 1 | vaduz |
| `AT:52.1,54[Ausgenommen Zustelldienste]` | 4 | vaduz |
| `AT:52.1,54[Forststraße]` | 3 | vaduz |
| `AT:52.1,54[Privatstraße]` | 3 | vaduz |
| `AT:52.1;AT:52.8c` | 1 | vaduz |
| `AT:52.1[Ausgenommen Anrainer Wiesenfeldweg 5c]` | 2 | vaduz |
| `AT:52.1[Ausgenommen landwirtschaftliche Fahrzeuge]` | 1 | vaduz |
| `AT:52.17a` | 5 | vaduz |
| `AT:52.17a-a` | 19 | vaduz |
| `AT:52.17a,54[Ausgenommen landwirtschaftliche Fahrzeuge]` | 3 | vaduz |
| `AT:52.17a,54[Ausgenommen Zubringer]` | 2 | vaduz |
| `AT:52.17a,54[Reiten verboten]` | 1 | vaduz |
| `AT:52.2` | 3 | vaduz |
| `AT:52.6c` | 6 | vaduz |
| `AT:52.6c,54[Ausgenommen Anrainerverkehr]` | 6 | vaduz |
| `AT:52.6c,54[Ausgenommen landwirtschaftliche Fahrzeuge]` | 2 | vaduz |
| `AT:52.7a-2[3.5],54[Ausgenommen Anrainerverkehr]` | 2 | vaduz |
| `AT:52.7a,54[Zustellung gestattet]` | 28 | vaduz |
| `AT:53.17a` | 1 | vaduz |
| `AT:53.26,54[Durchfahrt erlaubt]` | 20 | vaduz |
| `AT:53.28a` | 1 | vaduz |
| `AT:53.9e[20]` | 10 | vaduz |
| `AT:6c "Ausgenommen Anrainerverkehr täglich 17:00-07:00 sowie an schulfreien Tagen"` | 2 | vaduz |
| `AT:6c "Ausgenommen Berechtigte"` | 4 | vaduz |
| `AT:7a` | 4 | vaduz |
| `CH: 2.07; 2.08` | 2 | vaduz |
| `CH: 2.14 "Land- und Forstwirtschaft gestattet"` | 10 | vaduz |
| `CH: 2.14 "Zubringerdienst gestattet"` | 3 | vaduz |
| `CH:2.13` | 2 | vaduz |
| `CH:2.14 "Ausgenommen Forstwirtschaft"` | 4 | vaduz |
| `CH:2.30[40]` | 1 | vaduz |
| `CH:2.30[60]` | 2 | vaduz |
| `CH:2.59.1` | 3 | vaduz |
| `CH:3.02` | 2 | vaduz |
| `CH:4.60` | 5 | vaduz |
| `CH:4.61` | 4 | vaduz |
| `CH:4.62` | 5 | vaduz |
| `CH:4.65` | 1 | vaduz |
| `CH:4.72` | 27 | vaduz |
| `city_limit` | 48 | amsterdam, monaco, vaduz |
| `city_limit[-CAP D'AIL-]` | 1 | monaco |
| `city_limit[CAP D'AIL]` | 2 | monaco |
| `FR:A21` | 1 | monaco |
| `FR:B14[50],M10z[Tunnel I.M.2S];C111;B9a` | 2 | monaco |
| `give_way` | 1 | monaco |
| `LI: 2.13 "Zubringerdienst gestattet"` | 6 | vaduz |
| `LI: 2.1X "Ausgenommen Landwirtschaftlichen Verkehr"` | 2 | vaduz |
| `maxspeed` | 106 | monaco, rabat, vaduz, valletta |
| `NL:A01-30-ZB` | 149 | amsterdam |
| `NL:A01-30-ZB;NL:C03` | 1 | amsterdam |
| `NL:A02-30-ZE` | 3 | amsterdam |
| `NL:A1-30-ZB` | 34 | amsterdam |
| `NL:B07` | 1 | amsterdam |
| `NL:B6` | 50 | amsterdam |
| `NL:B6; NL:D104` | 1 | amsterdam |
| `NL:C01,OB54` | 3 | amsterdam |
| `NL:C02` | 1 | amsterdam |
| `NL:C02,OB52` | 2 | amsterdam |
| `NL:C02,OB54` | 12 | amsterdam |
| `NL:C06` | 1 | amsterdam |
| `NL:C06,"uitgezonderd ontheffingshouders"` | 2 | amsterdam |
| `NL:C09` | 1 | amsterdam |
| `NL:C14` | 2 | amsterdam |
| `NL:C3,OB2` | 1 | amsterdam |
| `NL:C6` | 12 | amsterdam |
| `NL:C9;NL:C16` | 8 | amsterdam |
| `NL:D05L,NL:OB52` | 1 | amsterdam |
| `NL:D06-R` | 1 | amsterdam |
| `NL:D5L` | 1 | amsterdam |
| `NL:F17` | 2 | amsterdam |
| `NL:F17,"uitgezonderd taxi's"` | 1 | amsterdam |
| `NL:G07` | 2 | amsterdam |
| `NL:G11` | 23 | amsterdam |
| `NL:G11,"snorfietsen niet toegestaand"` | 1 | amsterdam |
| `NL:G12a` | 3 | amsterdam |
| `NL:G12a; NL:D104` | 1 | amsterdam |
| `NL:G3;NL:A1-80` | 1 | amsterdam |
| `NL:G4` | 1 | amsterdam |
| `NL:G7` | 2 | amsterdam |
| `NL:J20` | 1 | amsterdam |
| `NL:J23` | 1 | amsterdam |
| `NL:J24` | 1 | amsterdam |
| `NL:K6` | 3 | amsterdam |
| `NL:K7` | 4 | amsterdam |
| `NL:L1002` | 3 | amsterdam |
| `NL:L2` | 21 | amsterdam |
| `yes` | 4 | amsterdam, stockholm, vaduz |
| `zone30` | 11 | amsterdam |

## Related tags on sign features

| Tag | Occurrences |
| --- | ---: |
| `direction` | 111 |
| `traffic_sign` | 794 |
| `traffic_sign:direction` | 31 |
| `traffic_signals` | 1 |
| `traffic_signals:direction` | 1 |

## Configurable basic sign rendering

Only Point features tagged `traffic_sign` in the decor export generate traffic
sign panels. Highway ways, road limits and line/polygon sign features do not invent
sign locations. Unknown codes are omitted instead of receiving generic red boards.
Clock decor remains independent.

[TrafficSignConfig.ts](../src/core/scene/TrafficSignConfig.ts) exports the editable
`TRAFFIC_SIGN_CODES` map. Keys select a renderer family; country keys map to one
code or an alias list. Codes do not include the country prefix:

```ts
no_entry: { AT: "52.2", CH: "2.02", NL: ["C2", "C02"] }
```

| Family | Austria AT | Switzerland CH | Netherlands NL |
| --- | --- | --- | --- |
| No entry (red disc, white horizontal bar) | 52.2 | 2.02 | C2 / C02 |
| No vehicles/access (red ring, white centre) | 52.1 | 2.01 | C1 / C01 |
| Stop | 52.24 | 3.01 | B7 / B07 |
| Give way | 52.23 | 3.02 | B6 / B06 |
| Speed limit | 52.10a[number] | 2.30[number] | A1-number / A01-number |
| One-way permitted direction (blue arrow) | Not mapped | Not mapped | C3 / C03 |

No-entry and one-way arrows are distinct signs: the red/white sign does not render
as a blue direction arrow. These are generic visual approximations of the listed
families, not a complete reproduction of each country's sign dimensions/fonts.
Adding another code for an existing family only requires editing the map. Adding
a new visual family also needs artwork/shape support in
[TrafficSigns.ts](../src/core/scene/TrafficSigns.ts).

### Country selection

[CityConfig.country_code](../src/stores/cities.ts) accepts a string or array:
Amsterdam uses `"NL"`; Vaduz uses `["LI", "AT", "CH"]`; Monaco uses
`["MC", "FR"]`; Rabat/Valletta use `"MT"`; Stockholm uses `"SE"`.
The readable `country` label is unchanged. Accepting a country prefix does not
automatically provide its sign catalogue: only configured aliases render.

Explicit prefixes must be in that city's list. Whitespace and case are normalized:
`AT:52.2`, `AT: 52.2` and `at : 52.2` match the same entry. Matching is
exact, so `52.24a` cannot accidentally become a stop sign. An unprefixed numeric
code is interpreted only for single-country configurations; mixed-country maps
need a prefix. Generic `stop`, `give_way` and `no_entry` are also supported.

Compound lists split on commas/semicolons outside quoted text and brackets. A
prefix carries over to later elements (`NL:C2,OB54`). Explicit country switches
are respected. Unknown supplementary codes/text are ignored, not turned into
invented symbols. Recognised signs can still render from a partly unsupported
combination. Duplicate panels are removed; at most four decoded panels stack on
one pole. This is visual scenery only, not access-rule enforcement.

### Speed limits and orientation

Generic `traffic_sign=maxspeed` requires a numeric `maxspeed` on that same
decor feature. Country-coded speed signs use the bracket or hyphen parameter first,
then a numeric maxspeed on that same feature. Explicit mph units are retained;
conditional/non-numeric limits are not guessed. Dutch A1/A01 `-ZB` zone-start
variants include a ZONE heading. End-of-limit/zone signs remain unsupported.

Numeric/eight-point compass `traffic_sign:direction` takes precedence over
`direction` for the front-facing panel. Relative forward/backward tags cannot be
resolved without parent-way geometry and retain the existing default yaw, as do
missing directions. Sources stay at the exact decor X/Z point, seated on the same
terrain/road level sampler as other furniture. No positioning is inferred from
RoadGenerator.

### Rendering and validation

Panels have reusable solid outlines, grey backs and cached original canvas artwork.
The pole is instanced with other decor. Each sign has distance LOD at 140 m; the
root participates in scenery culling. Artwork/materials are released on map changes,
shared shapes on generator disposal. No remote images are fetched at runtime.

The current decor data yields 75 recognised point locations in Amsterdam, 77 in
Vaduz, 6 in Rabat, 25 in Valletta and 3 in Monaco; unknown codes are deliberately
omitted. These counts describe this initial mapping/export snapshot. Targeted
checks covered code whitespace/aliases, compound lists, country filtering, all six
shapes, cached artwork reuse, exact point placement, unknown/line omission and
cleanup. In-game visual review is still needed for sign orientation and scale.

### Catalogue sources

- [Dutch OSM sign catalogue](https://wiki.openstreetmap.org/wiki/NL:Overzicht_Nederlandse_Verkeersborden)
- [Austrian OSM sign catalogue](https://wiki.openstreetmap.org/wiki/DE:Verkehrszeichen_in_%C3%96sterreich)
- [Swiss official sign references, including no entry 2.02](https://www.fedlex.admin.ch/eli/cc/2019/93/de?version=20241231)
- [Swiss give-way signal 3.02, sourced to ASTRA](https://wiki.openstreetmap.org/wiki/File:CH-Vortrittssignal-Kein_Vortritt.svg)

The catalogue codes inform the lookup table; sign art is drawn procedurally rather
than copied from the linked images. Country-specific exceptions and traffic rules
are outside this visual feature.
