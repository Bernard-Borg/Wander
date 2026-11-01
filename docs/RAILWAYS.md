# Railways and trains

Railway exports live in `public/data/rail/<city>.json`. The loader only requests
one when the city has a `railways` configuration. Current exports cover Monaco,
Stockholm and Amsterdam. The driving road graph remains separate.

## City configuration

In [cities.ts](../src/stores/cities.ts):

```ts
railways: {
    style: "modern",                  // "modern" angled cab or "old" upright cab
    primary: "#f5c52b",
    accent: "#164a91",
    logo: "/images/logos/amsterdam_rail.svg",
    trains: 3,                        // city-wide maximum (bounded to 0–6)
    carriages: 4,                     // 2–5 per consist
    maxSpeedKmh: 80,                   // city-wide maximum; brakes before route ends
    turnaroundSeconds: 150,           // default 2.5 minutes at each endpoint
}
```

Amsterdam uses an NS-inspired yellow/blue livery, Stockholm silver/blue and Monaco
white/blue. These are procedural interpretations, not replicas of particular
rolling stock. Optional logos appear on the end carriages, including the cab
front. Bodies have real side window openings with transparent glass, glazed cab
ends, floors, simple seats, wheelsets, doors and couplers. All carriages share
geometry/materials. Both end cars carry a cab; reversing does not spin the train.

## Track elevation and tunnels

[RailNetwork.ts](../src/core/scene/RailNetwork.ts) reads active `railway=rail` and
`railway=subway` LineStrings. `gauge` supplies the distance between rail centres
(default 1,435 mm; supported range 600–2,000 mm). Each OSM way is one track: the
`tracks` tag does not create duplicate parallel tracks. Service/siding tracks
are rendered but are excluded from moving train routes.

Surface rail is the default. Subway defaults underground unless an explicit
layer or bridge says otherwise. Numeric `layer` values, including Unicode minus
signs, are used; negative layers and `tunnel=yes` generate underground bores.
Positive layers/`bridge=yes` generate raised decks and supports. Initial offsets
are six metres per positive layer and at least nine metres underground (seven
metres per negative layer). These are **height heuristics**, not surveyed heights:
OSM layers only describe ordering. They cannot guarantee exact agreement with
an adjacent road bridge or a real station platform.

Shared way endpoints are reconciled, then a connected height-envelope pass caps
track grades at 6%. Underground samples retain at least eight metres of cover
relative to the terrain sampler. Tracks are subdivided at most every six metres.
Surface track cuttings remove terrain above the bed and add retaining walls; engineered bridges/tunnels
use interpolated heights instead of copying every terrain bump. As with roads,
these inferred profiles can differ from actual railway elevations, particularly
where layer changes meet or the terrain raster is coarse.

Tunnels reuse [tunnelSection](../src/core/scene/TunnelSection.ts), with a six-metre
internal width, 6.4-metre crown and 45-cm solid lining. This clears the procedural
train envelope, including its roof at the sides. The same profile feeds terrain
and building subtraction, intersecting bore openings, side collisions and the
vehicle's floor/ceiling contact metadata. Only terrain inside the bore is removed;
a buried roof does not cut an opening all the way up to the surface. Rail tunnel
entrances are the ends of these bores; there are no separate long road-style
approach ramps. Height inference may still produce cuttings at transitions.

Tracks have 3D steel rails, sleepers and ballast. Their low surfaces participate
in vehicle floor contact, allowing cars to roll across them. Road crossings keep
the road's driving contact and omit protruding sleepers. Supports and tunnel
sides have static collisions. Train bodies deliberately have no moving colliders.
The current vehicle collision engine supplies horizontal obstacles and floor
contacts; it does not simulate individual wheel impacts on each sleeper.

## Movement, sound and performance

[RailwayGenerator.ts](../src/core/scene/RailwayGenerator.ts) joins matching way
endpoints into deterministic routes, preferring straight continuations at switches
and avoiding sharp turnbacks. It requires sufficient route length for the whole
train. A few routes are selected across the city, preferring visible sections and
including mainline and subway services when both exist. Trains accelerate and
brake, stop with the entire consist inside the route, wait, then reverse forever.
Each carriage follows its own sampled position and grade. There are no timetable,
signalling, station-stop or train-to-train collision simulations.

Static geometry uses 200-metre spatial batches and the existing visibility system.
Moving trains remain outside its static matrix freezing, and are distance hidden
past 1,600 metres. Updates cost only a few carriage samples per frame. Loading
reports railway progress and yields between groups of ways. Old maps release
track geometry, train geometry/materials, logo textures and audio resources.

A single filtered low rolling sound follows the nearest moving train within
85 metres, with quadratic distance attenuation and speed-dependent volume. It
uses the effects volume/mute settings, is silent while paused, hidden or flying,
and unlocks on a keyboard/pointer interaction. It is a subtle synthesized cue,
not a recording of a particular locomotive.

## Validation and limits

Temporary CPU-only checks against all three supplied exports and their HGT
fallbacks confirmed finite geometry, continuous endpoint heights, <=6% grades,
tunnel cover, carriage route bounds, stopping, reversal, pause and cleanup.
Rail generation alone took approximately 1.3 s Monaco, 5.3 s Stockholm and 2.8 s
Amsterdam in that run, before the route-selection refinement. These measurements
exclude network, GPU rendering, final terrain/building cutting and first shader
compilation; they are not FPS measurements. No permanent tests were added.

Browser visual and audible verification was unavailable in this session. Monaco's
supplied railway ways are all tunnels, so its trains will mainly be seen from
underground. Exact rail altitudes, entrances, track-switch geometry and train
clearance on exceptionally tight bends still merit visual inspection.

## Train proportions and stable track orientation

The procedural body is 14% narrower and 18% shorter vertically than the initial
model (approximately 2.56 m wide, roof 3.19 m above the track bed). Wheel centres
retain the configured track gauge, and wheel bottoms still meet the rail heads.
Carriage spacing, route sampling, acceleration, waiting and train audio are
unchanged. Modern end cars use a lofted, tapered nose with a swept windshield;
intermediate cars use straight ends rather than repeating the nose on every car.
Logo panels follow the slimmer body, with the modern front logo on the sloped hood.

Track boxes and carriage orientation now use explicit yaw and pitch with zero
roll. Rotating +Z directly onto a 3D tangent with a shortest-arc quaternion could
almost invert the up vector near south-facing slopes. A temporary sweep of 1,080
heading/grade combinations confirmed forward alignment and an upright frame
through the full heading range. Both model styles were checked for finite
geometry and the reduced clearance envelope. Browser visual inspection remains
unavailable in this session.


## Single-ended cabs, rounded roofs and city speed caps

Modern end cars each have one nose at local +Z and a flat gangway at local -Z.
The final car is rotated 180 degrees, putting its nose at the outside rear of the
consist; both connections to intermediate cars are flat. All modern carriages
use a curved elliptical roof shell with analytic smooth normals. Spacing is
12.45 m between carriage centres, leaving a small gap between straight body ends,
with gangway surrounds connecting the cars. Wheel gauge and rail contact remain
unchanged. The route end-stop envelope uses the full 6.8 m cab half-length.

Each city's railways configuration exposes maxSpeedKmh (currently 50 in the city
configs). This is a maximum in kilometres per hour, not an instantaneous target:
acceleration and end-of-route braking still apply. Zero parks the train. Legacy
speed settings in metres per second remain accepted when maxSpeedKmh is absent;
invalid values fall back to the legacy value or 14 m/s. Train sound is unchanged.
