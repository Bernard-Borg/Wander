/** A single quiet rolling-noise voice shared by all nearby trains. No per-train audio contexts. */
export class TrainAudio {
    private context?: AudioContext;
    private gain?: GainNode;
    private sources: AudioScheduledSourceNode[] = [];
    private disposed = false;
    /** Defers audio creation until a trusted keyboard/touch/pointer interaction. */
    constructor() {
        document.addEventListener("pointerdown", this.unlock);
        document.addEventListener("keydown", this.unlock);
    }
    /** Unlocks a browser audio context and builds a low, filtered rolling sound. */
    private unlock = (): void => {
        if (this.disposed || this.context) {
            if (this.context?.state === "suspended") void this.context.resume().catch(() => {});
            return;
        }
        this.context = new AudioContext();
        const ctx = this.context;
        this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(ctx.destination);
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 480; filter.Q.value = 0.4; filter.connect(this.gain);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), samples = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.08) / 1.08; samples[i] = previous * 1.6; }
        const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.connect(filter); noise.start();
        const motor = ctx.createOscillator(); motor.type = "sine"; motor.frequency.value = 75;
        const motorGain = ctx.createGain(); motorGain.gain.value = 0.045; motor.connect(motorGain); motorGain.connect(filter); motor.start();
        this.sources.push(noise, motor);
        void ctx.resume().catch(() => {});
    };
    /** Smooths a proximity/speed-weighted effects gain, clamped against malformed persisted settings. */
    update(level: number): void {
        if (!this.context || !this.gain) return;
        const value = Number.isFinite(level) ? Math.min(0.4, Math.max(0, level)) : 0;
        this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.15);
    }
    /** Stops voices, closes their context and unregisters the gesture handlers. */
    dispose(): void {
        this.disposed = true;
        document.removeEventListener("pointerdown", this.unlock); document.removeEventListener("keydown", this.unlock);
        this.sources.forEach(s => { s.stop(); s.disconnect(); }); this.sources = [];
        if (this.context) void this.context.close().catch(() => {});
    }
}
