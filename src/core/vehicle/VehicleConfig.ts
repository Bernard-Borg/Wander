/**
 * VehicleConfig types and implementation for the city driving simulator.
 * @packageDocumentation
 */

export type EngineState = "off" | "starting" | "running";
/** Model, handling, collision, presentation and audio tuning for one vehicle. */
export interface VehicleConfig {
    /** Stable identifier used as the vehicle registry key. */
    id: string;
    /** Human-readable name shown in the vehicle selector. */
    name: string;
    /** Visual asset dimensions and first-person seating position. */
    model: {
        /** Public URL of the glTF model. */
        path: string;
        /** Target model length along its local Z axis, in metres. */
        length: number;
        /** Effective tyre radius in metres, used to animate wheel rotation. */
        wheelRadius: number;
        /** Driver-eye offset [X, Y, Z] as fractions of the scaled model width, height and length; positive Z is forward. */
        eye: [number, number, number];
        /** Symmetric headlamp position [half-spacing X, height Y, forward Z], as fractions of centred model bounds. */
        headlights?: [number, number, number];
        /** Symmetric rear-lamp position [half-spacing X, height Y, rear Z], as fractions of centred model bounds. */
        taillights?: [number, number, number];
    };
    /** Parameters for the planar vehicle dynamics. */
    physics: {
        /** Normal forward speed limit in km/h. */
        maxSpeed: number;
        /** Maximum reverse speed magnitude in km/h. */
        reverseSpeed: number;
        /** Base forward engine acceleration in metres per second squared. */
        acceleration: number;
        /** Fraction of uphill gravity compensated by the engine under throttle. */
        hillClimbAssist: number;
        /** Base reverse engine acceleration magnitude in metres per second squared. */
        reverseAcceleration: number;
        /** Service-brake deceleration magnitude in metres per second squared. */
        brakeDeceleration: number;
        /** Handbrake deceleration magnitude in metres per second squared. */
        handbrakeDeceleration: number;
        /** Distance between front and rear axles in metres. */
        wheelbase: number;
        /** Maximum front-wheel steering angle magnitude in radians. */
        maxSteeringAngle: number;
        /** Vehicle mass in kilograms. */
        mass: number;
        /** Fraction of static vehicle weight carried by the front axle, from 0 to 1. */
        frontWeight: number;
        /** Centre-of-mass height above the contact plane in metres, used for weight transfer. */
        centreOfMassHeight: number;
        /** Rotational inertia about the vertical axis in kilogram metres squared. */
        yawInertia: number;
        /** Front-axle lateral force response to tyre slip angle, in newtons per radian. */
        frontCornerStiffness: number;
        /** Rear-axle lateral force response to tyre slip angle, in newtons per radian. */
        rearCornerStiffness: number;
        /** Fraction of engine drive force sent to the front axle; defaults to zero (rear-wheel drive). */
        frontDriveFraction?: number;
        /** Fraction of braking force assigned to the front axle, from 0 to 1. */
        brakeBias: number;
        /** Multiplier on the speed-dependent grip-limited steering angle. */
        steeringAssist: number;
        /** Maximum yaw angular speed magnitude in radians per second. */
        maxYawRate: number;
        /** Base lateral acceleration budget in metres per second squared, scaled by surface grip. */
        cornerGrip: number;
        /** Tyre traction multiplier applied to surface grip for cornering, braking and drive forces.
         * A value of 1 uses the surface baseline; higher values increase grip.
         */
        gripMultiplier: number;
        /** Rate in inverse seconds at which yaw speed approaches the assisted target. */
        yawDamping: number;
        /** Constant rolling deceleration in metres per second squared. */
        rollingResistance: number;
        /** Extra coasting deceleration in metres per second squared when throttle is released. */
        engineResistance: number;
        /** Quadratic drag coefficient in inverse metres; multiplied by speed squared in SI units. */
        drag: number;
    };
    /** Dimensions of the simplified vehicle collision volume. */
    collision: {
        /** Horizontal collision radius in metres. */
        radius: number;
        /** Distance from the centre to each end collision-circle centre in metres; overall length is 2 * (halfLength + radius). */
        halfLength: number;
        /** Half-height of the collision volume in metres. */
        halfHeight: number;
    };
    /** Input smoothing rates; higher values produce faster responses. */
    controls: {
        /** Throttle application response rate in inverse seconds. */
        throttleRise: number;
        /** Throttle release response rate in inverse seconds. */
        throttleFall: number;
        /** Steering application response rate in inverse seconds. */
        steerRise: number;
        /** Steering centring response rate in inverse seconds. */
        steerReturn: number;
    };
    /** Cosmetic suspension lean, independent of collision geometry. */
    bodyMotion: {
        /** Body roll in radians per metre per second squared of lateral acceleration. */
        rollGain: number;
        /** Body pitch in radians per metre per second squared of longitudinal acceleration. */
        pitchGain: number;
        /** Body-lean smoothing response rate in inverse seconds. */
        response: number;
    };
    /** Camera follow tuning and terrain-orientation smoothing. */
    camera: {
        /** Chase-camera position response rate in inverse seconds. */
        followRate: number;
        /** Grounded vehicle alignment response rate in inverse seconds. */
        terrainTiltRate: number;
        /** Base chase-camera distance from its vehicle target in metres. */
        distance: number;
    };
    /** Optional independent crankshaft and slipping-clutch launch tuning. */
    drivetrain?: {
        /** Free-rev rise rate in RPM/s; defaults to audio.rpmResponse. */
        revRise?: number;
        /** RPM fall rate in RPM/s; defaults to 1.5 times audio.rpmResponse. */
        revFall?: number;
        /** Clutch/wheelspin recovery in inverse seconds; default 2.4. */
        clutchEngagement?: number;
        /** Maximum fractional drive boost from a raised-rev launch; default 0.25. */
        launchBoost?: number;
    };
    /** Synthesized engine, ignition and impact sound tuning. */
    audio: {
        /** Engine idle speed in revolutions per minute. */
        idleRPM: number;
        /** Upper engine speed limit in revolutions per minute. */
        maxRPM: number;
        /** Low-frequency engine character reference in hertz; 30 leaves the pulse pitch unscaled. */
        baseFrequency: number;
        /** Engine partials: frequency multiplier, relative gain and oscillator waveform. */
        harmonics: Array<{
            /** Frequency relative to the fundamental. */
            ratio: number;
            /** Relative output gain. */
            gain: number;
            /** Web Audio oscillator waveform. */
            wave: OscillatorType;
        }>;
        /** Cylinder count for a four-stroke engine's combustion pulse rate. */
        cylinders: number;
        /** RPM-to-pitch tracking exponent; below 1 softens high-rev pitch without detuning harmonics. */
        pitchTracking: number;
        /** Low-pass cutoff [idle, high RPM] in hertz. */
        filterRange: [number, number];
        /** Exhaust saturation amount, normally 0?1. */
        saturation: number;
        /** Maximum synthesized RPM rise per second. */
        rpmResponse: number;
        /** Horn frequencies in hertz. */
        hornFrequencies: [number, number];
        /** Horn output gain before master volume. */
        hornVolume: number;
        /** Startup playback pitch/rate multiplier. */
        ignitionPitch: number;
        /** Impact playback pitch/rate multiplier. */
        impactPitch: number;
        /** Engine sound gain multiplier. */
        engineVolume: number;
        /** Collision sound gain multiplier. */
        impactVolume: number;
        /** Minimum collision impact speed in metres per second required to play a crash sound. */
        impactThreshold: number;
        /** Ignition startup duration in seconds. */
        ignitionDuration: number;
        /** Ascending gear speed boundaries in km/h used to estimate engine RPM. */
        gears: number[];
    };
}

export const DEFAULT_VEHICLE: VehicleConfig = {
    id: "honda-nsx",
    name: "Honda NSX",
    model: {
        path: "/models/nsx/nsx.gltf",
        length: 4.43,
        // Scaled glTF tyre radius at the configured 4.43 m body length.
        wheelRadius: 0.32,
        eye: [-0.18, 0.24, 0.05],
        headlights: [0.34, -0.12, 0.49],
        taillights: [0.34, -0.04, -0.49],
    },
    physics: {
        maxSpeed: 262,
        reverseSpeed: 74,
        acceleration: 5.67,
        hillClimbAssist: 0.65,
        reverseAcceleration: 2.4,
        brakeDeceleration: 1.5,
        handbrakeDeceleration: 2.5,
        wheelbase: 2.53,
        maxSteeringAngle: 0.61,
        mass: 1432,
        frontWeight: 0.4,
        centreOfMassHeight: 0.47,
        yawInertia: 1850,
        frontCornerStiffness: 105000,
        rearCornerStiffness: 160000,
        brakeBias: 0.58,
        steeringAssist: 1,
        maxYawRate: 0.75,
        cornerGrip: 9.61,
        gripMultiplier: 1.1,
        yawDamping: 5,
        rollingResistance: 0.15,
        engineResistance: 0.3,
        drag: 0.162,
    },
    // Approximate the scaled body (4.43 x 1.99 x 1.12 m), with a small side inset.
    collision: { radius: 0.96, halfLength: 1.255, halfHeight: 0.56 },
    controls: {
        throttleRise: 3.5,
        throttleFall: 5,
        steerRise: 16,
        steerReturn: 20,
    },
    bodyMotion: { rollGain: 0.0023, pitchGain: 0.0016, response: 8 },
    camera: { followRate: 7, terrainTiltRate: 9, distance: 9 },
    audio: {
        idleRPM: 850,
        maxRPM: 8000,
        baseFrequency: 24,
        engineVolume: 1.5,
        impactVolume: 0.65,
        impactThreshold: 1.5,
        ignitionDuration: 0.8,
        gears: [55, 95, 140, 185, 225, 262],
        harmonics: [
            { ratio: 1, gain: 0.6, wave: "triangle" },
            { ratio: 0.5, gain: 0.2, wave: "sine" },
            { ratio: 2, gain: 0.18, wave: "triangle" },
        ],
        cylinders: 6,
        pitchTracking: 0.85,
        filterRange: [180, 650],
        saturation: 0.08,
        rpmResponse: 5200,
        hornFrequencies: [400, 500],
        hornVolume: 0.1,
        ignitionPitch: 1.15,
        impactPitch: 1.05,
    },
};

// 2020 Jeep Gladiator, 3.6 V6 Rubicon automatic in 2H.
const JEEP_GLADIATOR: VehicleConfig = {
    id: "jeep-gladiator",
    name: "2020 Jeep Gladiator",
    model: {
        path: "/models/jeep/gladiator.gltf",
        length: 5.6,
        wheelRadius: 0.42,
        eye: [0.195, 0.27, 0.1],
        headlights: [0.32, -0.03, 0.49],
        taillights: [0.38, -0.13, -0.49],
    },
    physics: {
        maxSpeed: 156,
        reverseSpeed: 48,
        acceleration: 3.58,
        hillClimbAssist: 0.65,
        reverseAcceleration: 2.4,
        brakeDeceleration: 7.3,
        handbrakeDeceleration: 3.43,
        wheelbase: 3.487,
        maxSteeringAngle: 0.6,
        mass: 2301,
        frontWeight: 0.54,
        centreOfMassHeight: 0.8,
        yawInertia: 5600,
        frontCornerStiffness: 150000,
        rearCornerStiffness: 140000,
        brakeBias: 0.64,
        steeringAssist: 1,
        maxYawRate: 0.85,
        cornerGrip: 6.3,
        gripMultiplier: 1.2,
        yawDamping: 3.5,
        rollingResistance: 0.18,
        engineResistance: 0.25,
        drag: 0.0004,
    },
    collision: { radius: 1.0, halfLength: 1.8, halfHeight: 1.04 },
    controls: {
        throttleRise: 2.7,
        throttleFall: 5,
        steerRise: 11,
        steerReturn: 14,
    },
    bodyMotion: { rollGain: 0.0035, pitchGain: 0.0024, response: 6 },
    camera: { followRate: 6, terrainTiltRate: 8, distance: 12 },
    audio: {
        idleRPM: 650,
        maxRPM: 6600,
        baseFrequency: 22,
        engineVolume: 1.8,
        impactVolume: 0.75,
        impactThreshold: 1.5,
        ignitionDuration: 1.1,
        gears: [54, 81, 120, 151, 197, 252, 300, 377],
        harmonics: [
            { ratio: 1, gain: 0.6, wave: "triangle" },
            { ratio: 0.5, gain: 0.48, wave: "sine" },
            { ratio: 2, gain: 0.12, wave: "triangle" },
        ],
        cylinders: 6,
        pitchTracking: 0.8,
        filterRange: [130, 440],
        saturation: 0.12,
        rpmResponse: 2800,
        hornFrequencies: [330, 415],
        hornVolume: 0.13,
        ignitionPitch: 0.85,
        impactPitch: 0.85,
    },
};

// 1976 VW Golf GTI MK1, 1.6 four-speed FWD.
const VW_GOLF_MK1: VehicleConfig = {
    id: "vw-golf-mk1",
    name: "1976 VW Golf GTI MK1",
    model: {
        path: "/models/vw/golf.gltf",
        length: 3.71,
        wheelRadius: 0.288,
        eye: [0.195, 0.34, -0.045],
        headlights: [0.32, -0.13, 0.49],
        taillights: [0.35, -0.1, -0.49],
    },
    physics: {
        maxSpeed: 182,
        reverseSpeed: 47,
        // Calibrated to the published 9.2 s 0-100 km/h within this simplified engine model.
        acceleration: 3.385,
        hillClimbAssist: 0.65,
        reverseAcceleration: 2.5,
        brakeDeceleration: 7.8,
        handbrakeDeceleration: 3.43,
        wheelbase: 2.4,
        maxSteeringAngle: 0.56,
        mass: 810,
        frontWeight: 0.6,
        frontDriveFraction: 1,
        centreOfMassHeight: 0.48,
        yawInertia: 1000,
        frontCornerStiffness: 55000,
        rearCornerStiffness: 48000,
        brakeBias: 0.67,
        steeringAssist: 1,
        maxYawRate: 1.15,
        cornerGrip: 7.7,
        gripMultiplier: 1.05,
        yawDamping: 4,
        rollingResistance: 0.13,
        engineResistance: 0.22,
        drag: 0.0006,
    },
    collision: { radius: 0.81, halfLength: 1.045, halfHeight: 0.665 },
    controls: {
        throttleRise: 4,
        throttleFall: 5,
        steerRise: 14,
        steerReturn: 18,
    },
    bodyMotion: { rollGain: 0.0026, pitchGain: 0.0019, response: 9 },
    camera: { followRate: 8, terrainTiltRate: 10, distance: 8 },
    audio: {
        idleRPM: 900,
        maxRPM: 6500,
        baseFrequency: 28,
        engineVolume: 1.44,
        impactVolume: 0.6,
        impactThreshold: 1.5,
        ignitionDuration: 0.95,
        gears: [53, 94, 141, 182],
        harmonics: [
            { ratio: 1, gain: 0.55, wave: "triangle" },
            { ratio: 0.5, gain: 0.15, wave: "sine" },
            { ratio: 2, gain: 0.24, wave: "triangle" },
        ],
        cylinders: 4,
        pitchTracking: 0.9,
        filterRange: [160, 560],
        saturation: 0.16,
        rpmResponse: 4000,
        hornFrequencies: [440, 550],
        hornVolume: 0.09,
        ignitionPitch: 1.05,
        impactPitch: 1.18,
    },
};

// 2022 Porsche 911 GT3 Touring (992)
const PORSCHE_911: VehicleConfig = {
    id: "porsche-911",
    name: "2022 Porsche 911 GT3",
    model: {
        path: "/models/porsche/911.gltf",
        length: 4.573,
        wheelRadius: 0.355,
        eye: [-0.19, 0.17, 0.12],
        headlights: [0.32, 0.03, 0.46],
        taillights: [0.4, 0.06, -0.48],
    },
    physics: {
        maxSpeed: 318,
        reverseSpeed: 35,
        acceleration: 9.0,
        hillClimbAssist: 0.85,
        reverseAcceleration: 3.0,
        brakeDeceleration: 12.0,
        handbrakeDeceleration: 5.0,
        wheelbase: 2.457,
        maxSteeringAngle: 0.58,
        mass: 1418,
        frontWeight: 0.4,
        centreOfMassHeight: 0.48,
        yawInertia: 2600,
        frontCornerStiffness: 115000,
        rearCornerStiffness: 145000,
        frontDriveFraction: 0,
        brakeBias: 0.62,
        steeringAssist: 1.0,
        maxYawRate: 1.15,
        cornerGrip: 9.81,
        gripMultiplier: 1.15,
        yawDamping: 5.0,
        rollingResistance: 0.15,
        engineResistance: 0.35,
        drag: 0.00038,
    },
    collision: {
        radius: 0.92,
        halfLength: 1.36,
        halfHeight: 0.64,
    },
    controls: {
        throttleRise: 5.0,
        throttleFall: 7.0,
        steerRise: 12.0,
        steerReturn: 16.0,
    },
    bodyMotion: {
        rollGain: 0.0018,
        pitchGain: 0.0015,
        response: 10,
    },
    camera: {
        followRate: 7,
        terrainTiltRate: 9,
        distance: 10,
    },
    drivetrain: {
        revRise: 5500,
        revFall: 6500,
        clutchEngagement: 4.5,
        launchBoost: 0.3,
    },
    audio: {
        idleRPM: 900,
        maxRPM: 9000,
        baseFrequency: 30,
        engineVolume: 2.0,
        impactVolume: 0.75,
        impactThreshold: 1.5,
        ignitionDuration: 1.3,
        gears: [0, 68, 105, 145, 185, 225, 270, 318],
        harmonics: [
            { ratio: 1, gain: 0.65, wave: "sawtooth" },
            { ratio: 0.5, gain: 0.25, wave: "triangle" },
            { ratio: 2, gain: 0.3, wave: "sawtooth" },
            { ratio: 3, gain: 0.12, wave: "sine" },
        ],
        cylinders: 6,
        pitchTracking: 0.95,
        filterRange: [180, 1800],
        saturation: 0.28,
        rpmResponse: 5500,
        hornFrequencies: [390, 490],
        hornVolume: 0.12,
        ignitionPitch: 1.1,
        impactPitch: 0.85,
    },
};

export const VEHICLES: Record<string, VehicleConfig> = {
    [DEFAULT_VEHICLE.id]: DEFAULT_VEHICLE,
    [JEEP_GLADIATOR.id]: JEEP_GLADIATOR,
    [VW_GOLF_MK1.id]: VW_GOLF_MK1,
    [PORSCHE_911.id]: PORSCHE_911,
};

/**
 * Estimates RPM from signed speed in km/h, throttle load and configured gear speed boundaries.
 *
 * @param speed - Signed vehicle speed in km/h.
 * @param throttle - Normalized signed throttle request.
 * @param audio - Engine sound and gear tuning.
 */
export function targetEngineRPM(
    speed: number,
    throttle: number,
    audio: VehicleConfig["audio"],
): number {
    const index = audio.gears.findIndex((end) => Math.abs(speed) < end);
    const gear = index < 0 ? audio.gears.length - 1 : index;
    const start = gear === 0 ? 0 : audio.gears[gear - 1] * 0.6;
    const ratio = Math.max(
        0,
        Math.min(1, (Math.abs(speed) - start) / Math.max(1, audio.gears[gear] - start)),
    );
    return Math.min(
        audio.maxRPM,
        audio.idleRPM + ratio * (audio.maxRPM - audio.idleRPM) * 0.77 + Math.abs(throttle) * 1500,
    );
}
