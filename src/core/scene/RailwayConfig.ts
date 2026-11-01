/** City-wide procedural railway appearance and simulation settings. */
export interface RailwayConfig {
    /** Body silhouette: sloping modern cab or upright older carriage. */
    style: "old" | "modern";
    /** Main carriage paint, as a CSS colour. */
    primary: string;
    /** Waist stripe and door paint, as a CSS colour. */
    accent: string;
    /** Optional SVG/bitmap logo URL applied to the end carriages. */
    logo?: string;
    /** Upper bound on moving consists for the entire city, default three. */
    trains?: number;
    /** Carriages per consist; clamped to two through five, default three. */
    carriages?: number;
    /** Maximum train speed in km/h; zero parks trains. Defaults to 50.4 km/h. */
    maxSpeedKmh?: number;
    /** Legacy maximum in metres per second. @deprecated Use maxSpeedKmh. */
    speed?: number;
    /** Seconds stopped at each route end before returning, default 150. */
    turnaroundSeconds?: number;
}

/** Resolves the city speed cap to metres per second, accepting the legacy setting. */
export function railwayMaxSpeed(config?: RailwayConfig): number {
    const kmh = config?.maxSpeedKmh;
    if (typeof kmh === "number" && Number.isFinite(kmh) && kmh >= 0) return kmh / 3.6;
    const legacy = config?.speed;
    return typeof legacy === "number" && Number.isFinite(legacy) && legacy >= 0 ? legacy : 14;
}
