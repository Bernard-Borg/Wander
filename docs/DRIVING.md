## Creative mode

Press **C** or the HUD **Fly** button to switch between driving and free flight.
The shared mode flag lives in the Pinia state store. Flight hides the car, switches
its ignition off, clears motion/held controls, silences vehicle effects and pauses
vehicle simulation. Entering flight starts at the car?s coordinates and elevation.
Returning to driving places the car at the flight position with ignition off,
preserving its initial altitude. The car then falls under gravity until it contacts
the ground, even with ignition off. Pressing the accelerator starts ignition;
held throttle moves the car once startup completes.
The selected mode carries across city switches during this session.

- WASD / arrow keys: fly forward/backward and sideways. Forward follows your view.
- Space or E: rise; Q: descend along world vertical.
- Hold Shift: fly three times faster.
- Drag left mouse: look around freely, including up/down (pitch limited near vertical).
- Mouse wheel: adjust base speed between 3 and 200 metres/second (default 30).
- C / Drive button: place the car at the current flight position. Reset view returns above city spawn.

Flight has no collisions, gravity or water reset. Navigation coordinates/heading
and nearby scenery activation follow the flight camera. Help/pause, hidden tabs
and window blur clear held flight inputs. All flight listeners are removed when
the simulator is disposed. Driving camera limits and compass math are unchanged.

## Handling

- W / Up: accelerate forward; brake first when reversing.
- S / Down: brake while moving forward, then reverse once stopped.
- A/D or arrow left/right: steering, with reduced steering authority at speed.
- Space or E (hold): the same assisted emergency handbrake, with full lateral grip
  and 30 m/s? nominal deceleration (scaled by surface grip), including sideways motion. Holding both
  keeps it active until both are released.
- Shift: boost while accelerating forward. An empty boost tank must be released
  before activating it again. It recharges when boost is inactive.
- V: toggle between third-person chase and first-person driver-seat cameras.
- Mouse drag: orbit in third person; horizontal look up to 80 degrees either side
  in first person, with no vertical look. Entering first person recentres the view.
- Mouse wheel: zoom the third-person camera; ignored in first person.
- Each map loads with ignition off and the parking lock engaged. Press I or the
  HUD power button to start before driving.
- I or the HUD power button: switch the engine off/on. Switching off stops the car
  and sets a parking lock that holds on slopes. Starting plays the ignition sound
  and retains the lock until the configured start duration finishes. Space/E remain
  the separate driving handbrake.
- Help icon or ?: open the controls modal. Driving pauses, input clears, and
  focus stays in the modal until it is closed with Escape or its close button.
- The home icon beside Settings returns to the main menu.

[VehiclePhysics](../src/core/vehicle/VehiclePhysics.ts) works in metres, seconds,
and radians. The simulator advances it at 120 Hz regardless of rendering FPS.
Long suspension gaps are discarded; catch-up work is capped after slow frames.
Handling blends a kinematic parking/reverse model into a dynamic front/rear-axle
model between 3 and 7 m/s. Tyre slip angles generate bounded forces; vehicle mass
and yaw inertia determine how momentum and heading respond. Steering no longer
rotates world velocity directly at driving speeds. The keyboard steering envelope
uses available grip rather than stacking arbitrary speed attenuation on full lock.
Steering reversals respond faster than initial steering input.

Front/rear weight distribution and longitudinal load transfer affect tyre capacity.
Load transfer includes the uphill gravity component rather than only net vehicle
acceleration, preserving the rear axle's climbing traction. `hillClimbAssist`
(default 0.65) adds throttle-dependent uphill torque compensation. Coasting gravity,
downhill acceleration and both brakes remain independent of that assist.
A combined-force budget reduces acceleration in hard corners; braking reserves
some steering capacity and traction control avoids deliberately breaking rear grip.
There is no drift mode or handbrake grip reduction. Both brakes cut throttle and
act immediately. The default is an assisted sport-car tune for the game's scaled
car, not surveyed NSX tyre/suspension measurements. Full-lock bends at highway
speed still require slowing down; steering cannot bypass available tyre force.
Forward power tapers toward
200 km/h (250 with boost); reverse is limited to 35 km/h. The HUD converts speed
to signed km/h: reversing or rolling backwards displays a minus. Opposite throttle
slows the vehicle before reversing it. The listed figures describe the default
vehicle; other configurations can supply different stats.

Physics snapshots are interpolated for each render frame. Both the model and
driver-seat camera use that same interpolated pose; camera targets are computed
directly from it without relying on scene-matrix updates. The chase camera
uses a yaw-only orbit anchored to the current rendered car, with vertical camera
smoothing only. Horizontal tracking and aiming do not lag behind the car, so
camera distance cannot increase with speed and orbiting keeps the car in view.
Small terrain pitch/bank changes do not swing its whole offset.
A separate visual body group adds restrained, smoothed acceleration/braking pitch
and cornering roll. This is not added to either camera mount or road contact pose.
Visible front wheels follow the physics steering angle rather than raw keyboard lock. Teleports, pause and visibility
changes reset interpolation. Ground/tunnel camera clearance remains enforced.

## Collisions and road contact

[CollisionWorld](../src/core/scene/CollisionWorld.ts) indexes building footprints,
courtyard holes, tree trunks, and tunnel sidewalls in a spatial grid. Three
overlapping circles approximate the car body. Small simulation steps prevent
high-speed tunneling at the supported speeds; contact correction removes inward
velocity and preserves tangential movement for wall sliding. This is an arcade
collision model, without deformable bodywork, rollover, or a full rigid-body
suspension system.

Road queries use an indexed set of sampled segments for surface detection. Rabat and Monaco
load their supplied SRTM height fields: terrain triangles, draped roads, scenery,
collision heights, camera clearance and vehicle contact share its elevations.
The car pitches/banks with the road, slows on climbs and can gain speed while
coasting downhill. Cities without configured elevation remain flat. Ground and
roads retain separate depth biases. Spawn/reset positions use a road near the
selected city centre and resolve footprint overlaps.

## Loading, audio, and lifecycle

City selection waits for both scene data and the car model. Required road or
model failures show Retry and Choose city actions; optional tree/building data
may be absent. Map requests have timeouts. Input resets on focus loss or page
visibility changes. Audio cannot block throttle, and mute has no physics effect.

Procedural engine audio follows throttle and approximate automatic gearing.
Continuous speed-dependent road/wind noise and the engine's filtered white-noise
texture are removed, including their loop sources and noise-gain nodes. The engine
keeps its tonal harmonics; ignition and crash effects remain one-shot buffers.
Collision audio uses a low body thump, filtered crushing noise and short panel
chatter, with no sharp broadband crack or sustained metallic ringing. Intensity
uses the horizontal speed lost immediately across collision resolution (m/s), not
remaining speed or positional overlap. Gains rise with normalized speed loss to
the power 1.5; a 45 m/s loss reaches full intensity. Tiny contacts below the vehicle's
configured threshold are silent. Larger losses add some filtered detail and a
longer retrigger cooldown (0.25?0.55 s). Effects volume and mute still apply.
Collision response removes inward velocity without restitution and dissipates
some tangential energy, but no longer clears yaw rate on every contact: that
previously suppressed steering away from walls during repeated light scrapes.
Positional overlap correction never adds velocity.
Starter audio combines a short mechanical key transient,
starter motor/compression pulses and a textured combustion catch, without the
previous sustained rev-up tone.
Generated buffers are normalized below clipping. Browser audio permission may require a driving
keypress. City switches save the outgoing position and dispose input listeners,
audio contexts, geometries, materials, textures, shadows, and the old canvas.

The compass is a backed heading strip with coordinates beneath it. Its display
uses the original needle convention (inverse simulation yaw): from north, a left
turn displays northwest and a right turn displays northeast. The world and
geographic conversions remain unchanged. The instrument
cluster includes speed, gear, RPM, engine/parking state and boost reserve; RPM
continues to work when audio is muted. Existing settings retain their behaviour.

### Loading diagnostics

[LoadingScreen.vue](../src/parts/LoadingScreen.vue) reads shared progress from
[the loading store](../src/stores/loading.ts). It shows the active stage, road
counts during mesh generation, total elapsed time, and the five most recently
completed stages with durations. A complete timing table is printed to the
browser console on completion or failure. Each city load/retry resets the history.

Stages distinguish road download/parsing, elevation, road-profile solving,
corridor preparation, road/marking generation, scenery download, water, terrain,
parks, trees, street furniture, buildings/tunnel openings, spawn, vehicle assets,
controls/audio and first rendering. Timings are wall-clock diagnostics, including
brief browser paint yields; they are not GPU benchmarks or estimated progress
percentages. Heavy synchronous work can pause the elapsed-time display; the
stage is painted before that work begins so its name identifies the active task.
There is no worker/off-thread generation change in this update.

## Vehicle configuration

[VehicleConfig.ts](../src/core/vehicle/VehicleConfig.ts) defines the typed vehicle
registry and the default vehicle. Configurations control model path and
scale, wheel radius, cabin eye point, speed/acceleration/braking/steering/grip,
boost, collision dimensions, input response, camera smoothing, engine RPM/gears,
audio volumes and ignition duration. Speeds are km/h, distances metres,
acceleration/deceleration metres/second squared, angles radians and times seconds.
The three-circle collision shape uses a circle radius and the front/rear circle
centre offset (`halfLength`). Model eye coordinates are fractions of scaled bounds.

To add another car, copy `DEFAULT_VEHICLE` into a new registry entry, replace the
model/stats and pass that configuration as the second argument to
`new DrivingSimulator(container, config)`. Nested objects must be copied when
overriding individual fields. There is currently one vehicle and no selection UI.
Alternate GLTF models need compatible wheel node names for wheel animation;
camera placement and collision dimensions are configured separately.

### Handling parameters

The default handling tune is in [VehicleConfig.ts](../src/core/vehicle/VehicleConfig.ts):

- `mass` (kg), `yawInertia` (kg m?), `frontWeight` (static front load fraction),
  `centreOfMassHeight` and `wheelbase` (metres) set mass and load-transfer response.
- `frontCornerStiffness` / `rearCornerStiffness` (N/radian) balance turn-in and rear
  stability; these are game tuning values matched to the scaled model.
- `cornerGrip` is the nominal lateral acceleration budget (m/s?); road grip scales
  that budget. `steeringAssist` scales the useful high-speed steering envelope,
  `maxSteeringAngle` is low-speed lock, and `yawDamping` smooths heading response.
- `brakeBias` allocates braking between axles. Service/handbrake deceleration,
  engine power, resistance and boost remain separately configurable.
- `controls.steerRise` and `steerReturn` set keyboard filtering. The return rate
  also applies when reversing steering direction.
- `bodyMotion` controls visual roll/pitch gains (radians per m/s?) and response.
  Those values do not move the camera or change collisions.

One-off numerical inspections of the current default tune gave approximately
1.88 seconds / 26.2 metres for straight 100?0 km/h braking on full-grip flat road,
for the service brake, including when throttle was held. The stronger assisted
handbrake now stops from 100 km/h in about 0.93 seconds / 12.8 metres on full-grip
flat ground; its whole-velocity deceleration is deliberately stronger than the
ordinary axle-force budget. Fixed-step trajectories matched at 30, 60 and
144 rendered frames per second. Repeated slalom/braking runs on asphalt,
cobblestone and loose-ground grip remained finite, and collision resolution
added no speed in repeated wall impacts. These checks do not replace a browser
drive to judge steering feel or listening to the audio. No test files were added.

## HUD components

[Overlay.vue](../src/parts/Overlay.vue) coordinates events and shortcuts. Focused
components in [hud/](../src/parts/hud/) own their markup and styles:
`VehicleInstruments` (the preserved speedometer and other instruments),
`NavigationCompass`, `HudActions`, `ControlsHelp`, and
`HudIcon`. Settings keep their existing behaviour, with larger labels and icons
for audio and city switching.

## FPS counter

The HUD displays a compact FPS counter. Performance charts and their F3 shortcut
have been removed. HUD text is non-selectable, and compass labels and markings
use white foregrounds with dark shadows instead of a surrounding panel.

## Gravity and contact

The car integrates vertical motion at 9.81 m/s? independently of engine state.
An elevated spawn falls instead of snapping onto the road. Airborne tyres supply
no acceleration, braking or steering forces; horizontal momentum is retained.
Ground contact arrests downward motion without a rebound. Uphill and downhill
road forces still use the sampled surface slope. This is a height-field contact
model, not a full rigid-body suspension or rollover simulation.

## Elevation

See [Elevation](ELEVATION.md) for the Rabat/Monaco implementation, tile coverage and source limitations.

## Sky

[ProceduralSky](../src/core/scene/ProceduralSky.ts) renders a camera-centred sky
with a sun disc and moving procedural clouds. The icon beside Settings and Main
Menu cycles **morning ? noon ? night**. It changes solar direction, sky/cloud
colours, ambient and directional lighting, and matching horizon fog without
reloading the city. The preference is saved locally and applied to subsequent map
loads. Night hides the sun and retains low ambient illumination for navigation.
The gameplay sky follows both driving and creative cameras; the main-menu diorama
uses its own lighting. Clouds remain a distant visual layer without volumetric
shadows or weather simulation. The sky uses one draw call and no image downloads.

## Vehicle lights

Press **L** while driving to toggle headlights and rear lights together, during
day or night. Key repeat is ignored; paused dialogs, text inputs and Ctrl/Alt/Meta
shortcuts do not toggle them. Ignition does not control this switch. Changing the
time preset resets the manual choice: night enables lights, morning/noon disable
them. Loading a map or switching cars also initializes lamps from the current time
preset. Flying hides the car and its attached lights.

### Identifying existing model lamps

[Car](../src/core/vehicle/Car.ts) traverses the loaded model's meshes and inspects
**material names**, not mesh names, texture pixels, OSM data or automatic visual
recognition. Only Three.js MeshStandardMaterial instances (including its physical
material subclass) matching the following rules are modified:

| Lamp | Material-name rule | Current model examples |
| --- | --- | --- |
| Front | Exact name `light_glass`, case insensitive | NSX |
| Front | Exact, case-sensitive `vM_LightGlassNormal_Clear_Low1` | Golf |
| Rear | Regex `/^red_?glass(?:_\d+)?$/i` | NSX: `red_glass`, `red_glass_2`, `red_glass_3`; Jeep: `RED_GLASS` |
| Rear | Exact, case-sensitive `vM_LightGlassNormal_OuterRed_Low1` | Golf |

Matching materials receive a gentle emissive colour: warm white at intensity 0.7
in front, red at 0.5 at the rear. Their original emissive colour/intensity are
restored when switched off. A shared material is processed once; all meshes using
that material will glow. Broad names such as Jeep's LightA/LightEmissiveA are not
matched because they can cover multiple lamp/body sections. Thus the Jeep's front
light source is invisible while its existing red rear glass can glow. Unmatched
materials retain their original appearance. No additional oval lens meshes are
created. A new model with different material names needs explicit matching rules
before its existing glass can glow.

### Beam placement and tuning

Material identification only controls the visible lamp glass. Actual illumination
comes from two spotlights and two red point lights, positioned independently using
[VehicleConfig](../src/core/vehicle/VehicleConfig.ts):

- `model.headlights` and `model.taillights` are symmetric placement tuples
  `[half-spacing X, height Y, longitudinal Z]`, expressed as fractions of the
  centred, scaled model width/height/length. Positive Z points forward. Each tuple
  creates one lamp on each side; negative Y is below the model centre.
- Defaults when omitted: front `[0.34, -0.12, 0.49]`, rear
  `[0.35, -0.08, -0.49]`. Current cars override these values.
- Headlight source adds 0.12 m forward to the configured location; its target is
  offset 25 m forward, 3.5 m downward and 0.8 m outward. Each spotlight has intensity
  6000, range 65 m, half-angle 30?, penumbra 0.65 and inverse-square decay.
- Rear point lights add 0.1 m rearward, with intensity 2.5, range 3 m and
  inverse-square decay. These are running lights, not brake/reverse indicators.
- A subtle transparent additive cone (38 m long, half-angle 22.5?, maximum shader
  alpha factor 0.012) suggests headlight haze. This is decorative geometry, not
  volumetric scattering. Real surface illumination comes from the spotlights.

Lights and cones follow the interpolated chassis pose, including steering direction,
pitch and suspension lean. Neither front nor rear lights cast shadows, so obstacles
do not block their illumination; this keeps the rendering cost lower. Light power,
range, direction and haze constants currently live in the light creation method in
[Car](../src/core/vehicle/Car.ts), not in vehicle configuration. Model alignment and
perceived brightness should still be reviewed in-game.

## HUD visibility and manual recovery

Settings has General and HUD pages. HUD independently persists instrument-cluster,
compass/coordinates and search visibility. The settings button and recovery controls
remain available. Hiding these elements does not disable telemetry or simulation.
Delete and the dedicated touch Reset button perform the same recovery as Reset
location; water recovery occurs only when the vehicle body touches/crosses the surface,
not merely when its coordinates fall within a water polygon. Typing, modifier-key
shortcuts and paused dialogs do not trigger keyboard recovery.

When returning from creative flight, the car keeps the camera position/elevation
and takes its yaw from the camera's horizontal viewing direction. Pitch is ignored;
for an exactly vertical view, the last car heading is retained.


## Rounded two-road joins

When exactly two road endpoints connect, their ribbons now share a cross-section
and a short cubic fillet through the inside of the bend. This also works when
OSM ways have opposite coordinate directions. Straight continuations retain their
centreline. Sharp near-reversals and branching T/crossroads retain the existing
junction behaviour; this is not a generalized intersection mesher.

Both carriageways taper to their mean endpoint width. Taper distance grows with
the width difference and is bounded by available road length, so 1/2/3-lane and
other lane-count changes do not create an abrupt width step. Existing divider
markings fade at changes rather than inventing turn-lane or traffic-direction rules.
The smoothed profile is shared by road mesh, paint, sidewalks, structural sides
and road contact sampling; this does not change the bridge height solver.
