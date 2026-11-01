/** Adjacent HGT files sampled through the same interface as single HGT and GeoTIFF sources. */
import type { ElevationBounds, ElevationSampler } from "./ElevationTerrain";
import { HgtTile } from "./ElevationTerrain";

/** A rectangular mosaic of one-degree HGT tiles; native tile decoding/interpolation is unchanged. */
export class HgtMosaic implements ElevationSampler {
    private readonly tiles = new Map<string, HgtTile>();
    private readonly bounds: ElevationBounds;

    /** Validates coverage up front because the terrain mesh requires a gap-free rectangular source.
     * @param tiles - Decoded tiles with integer southwest corner coordinates.
     */
    constructor(tiles: readonly HgtTile[]) {
        if (!tiles.length) throw new Error("HGT mosaic requires at least one tile.");
        for (const tile of tiles) {
            if (!Number.isInteger(tile.south) || !Number.isInteger(tile.west) ||
                tile.south < -90 || tile.south >= 90 || tile.west < -180 || tile.west >= 180)
                throw new Error("HGT tiles require valid integer southwest latitude/longitude.");
            const key = `${tile.south},${tile.west}`;
            if (this.tiles.has(key)) throw new Error(`Duplicate HGT tile at ${key}.`);
            this.tiles.set(key, tile);
        }
        this.bounds = {
            south: Math.min(...tiles.map(t => t.south)), west: Math.min(...tiles.map(t => t.west)),
            north: Math.max(...tiles.map(t => t.south + 1)), east: Math.max(...tiles.map(t => t.west + 1)),
        };
        const expected = (this.bounds.north - this.bounds.south) * (this.bounds.east - this.bounds.west);
        if (this.tiles.size !== expected)
            throw new Error("HGT tiles must form a complete rectangular grid without gaps. Add the missing tiles.");
    }

    /** Returns combined geographic coverage without exposing mutable internal bounds. */
    getBounds(): ElevationBounds { return { ...this.bounds }; }

    /** Selects a tile in constant time, including the mosaic's outer north/east borders.
     * Shared borders consistently use the northern/eastern tile's existing edge samples.
     */
    private tileAt(lat: number, lon: number): HgtTile | undefined {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < this.bounds.south ||
            lat > this.bounds.north || lon < this.bounds.west || lon > this.bounds.east) return undefined;
        const south = Math.min(Math.floor(lat), this.bounds.north - 1);
        const west = Math.min(Math.floor(lon), this.bounds.east - 1);
        return this.tiles.get(`${south},${west}`);
    }

    /** Reports real tile coverage, including shared borders and excluding invalid coordinates. */
    covers(lat: number, lon: number): boolean { return this.tileAt(lat, lon) !== undefined; }

    /** Delegates to the selected HGT tile without altering its bilinear or NoData behaviour. */
    sample(lat: number, lon: number): number {
        const tile = this.tileAt(lat, lon);
        if (!tile) throw new Error("Requested elevation lies outside the supplied HGT mosaic.");
        return tile.sample(lat, lon);
    }
}
