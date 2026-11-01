import { targetEngineRPM, type EngineState, type VehicleConfig } from "./VehicleConfig";

/** Independent crankshaft speed and a short-lived slipping-clutch launch approximation. */
export class EngineDrivetrain {
    rpm = 0;
    wheelspin = 0;
    wheelSpeed = 0;
    private heldBrake = false;
    /** Borrows per-vehicle engine response and clutch tuning. */
    constructor(private config: VehicleConfig) {}
    /** Clears engine/clutch state on ignition changes, vehicle resets or teleportation. */
    reset(): void { this.rpm = this.wheelspin = this.wheelSpeed = 0; this.heldBrake = false; }
    /** Advances RPM independently from chassis speed and couples raised revs back to driven wheels. */
    update(dt: number, state: EngineState, speedKmh: number, throttle: number, brake: boolean, grounded: boolean): void {
        const audio = this.config.audio, tuning = this.config.drivetrain;
        if (state !== "running") { this.reset(); this.rpm = state === "starting" ? 240 : 0; return; }
        const pedal = Math.min(1, Math.abs(throttle));
        const coupled = targetEngineRPM(speedKmh, pedal, audio);
        const free = audio.idleRPM + (audio.maxRPM - audio.idleRPM) * pedal * 0.97;
        const unlocked = brake || !grounded;
        if (this.heldBrake && !brake && grounded && pedal > 0.1 && Math.abs(speedKmh) < 35) {
            this.wheelspin = Math.max(0, Math.min(1, (this.rpm - coupled) / Math.max(1, audio.maxRPM - coupled)));
        }
        this.heldBrake = brake;
        if (unlocked || pedal < 0.05 || Math.abs(speedKmh) >= 35 || speedKmh * throttle < -1) this.wheelspin = 0;
        else this.wheelspin *= Math.exp(-(tuning?.clutchEngagement ?? 2.4) * dt);
        const target = unlocked ? free : coupled + this.wheelspin * Math.max(0, free - coupled);
        const rate = target > this.rpm ? tuning?.revRise ?? audio.rpmResponse : tuning?.revFall ?? audio.rpmResponse * 1.5;
        this.rpm += Math.max(-rate * dt, Math.min(rate * dt, target - this.rpm));
        this.rpm = Math.max(0, Math.min(audio.maxRPM, this.rpm));
        const extra = unlocked && !brake ? Math.max(0, this.rpm - audio.idleRPM) / audio.maxRPM : this.wheelspin;
        this.wheelSpeed = speedKmh / 3.6 + Math.sign(throttle) * extra * (audio.gears[0] / 3.6);
    }
}
