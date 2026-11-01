import * as THREE from "three";
import type { GeoJSON } from "@/types";
import type { ElevationTerrain } from "./ElevationTerrain";
import type { RoadKind } from "./RoadProfiles";

/** A connected piece of track with metre-based arc-length sampling. */
export class RailPath {
    readonly curve: THREE.CurvePath<THREE.Vector3>;
    readonly distances: number[] = [0];
    readonly length: number;
    /** Length of source ways that are not underground; used to favour visible services. */
    surfaceLength: number;
    readonly headroom = 6.4;
    readonly input: { id: string; kind: RoadKind; sidewalks?: { left: number; right: number } };
    /** Creates a polyline shared exactly by the track mesh, bores and animated trains. */
    constructor(readonly id: string, readonly points: THREE.Vector3[], readonly kind: RoadKind,
        readonly layer: number, readonly railway: string, readonly gauge: number, readonly service: boolean) {
        this.input = { id, kind };
        this.curve = new THREE.CurvePath();
        for (let i = 1; i < points.length; i++) {
            this.curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
            this.distances.push(this.distances[i - 1] + points[i - 1].distanceTo(points[i]));
        }
        this.length = this.distances.at(-1)!;
        this.surfaceLength = kind === "tunnel" ? 0 : this.length;
    }
    /** Tunnel clearance half-width, including clearance around a three-metre-wide carriage. */
    halfWidthAt(_t: number): number { return 3; }
    /** Railway profiles are immutable and need no generation-time sample cache. */
    setGenerationCaching(_enabled: boolean): void { /* shared corridor interface */ }
    /** Samples by distance with binary search; reversals never alter the underlying track. */
    at(distance: number, target = new THREE.Vector3()): THREE.Vector3 {
        const d = THREE.MathUtils.clamp(distance, 0, this.length);
        let low = 1, high = this.distances.length - 1;
        while (low < high) { const mid = (low + high) >>> 1; if (this.distances[mid] < d) low = mid + 1; else high = mid; }
        const a = this.distances[low - 1], b = this.distances[low];
        return target.copy(this.points[low - 1]).lerp(this.points[low], (d - a) / (b - a || 1));
    }
}

/** Normalizes Unicode minus signs in OSM numeric tags, rejecting non-finite values. */
function numeric(input: unknown): number | undefined {
    const value = input == null ? "" : String(input);
    if (!value.trim()) return undefined;
    const number = Number(value.replace(/−/g, "-"));
    return Number.isFinite(number) ? number : undefined;
}

/** Builds clipped, layer-aware tracks without adding railway edges to the driving road network. */
export function buildRailPaths(data: GeoJSON, project: (lat: number, lon: number) => { x: number; z: number },
    terrain: ElevationTerrain | null): RailPath[] {
    const paths: RailPath[] = [];
    const joins = new Map<string, THREE.Vector3[]>();
    for (const feature of data.features) {
        const p = feature.properties;
        if (feature.geometry.type !== "LineString" || !["rail", "subway"].includes(String(p.railway ?? ""))) continue;
        const explicit = numeric(p.layer);
        const tunnel = p.tunnel === "yes" || (explicit === undefined && p.railway === "subway" && p.bridge !== "yes");
        const layer = explicit ?? (tunnel ? -1 : p.bridge === "yes" ? 1 : 0);
        const kind: RoadKind = tunnel || layer < 0 ? "tunnel" : p.bridge === "yes" || layer > 0 ? "bridge" : "ground";
        const offset = kind === "tunnel" ? -Math.max(9, Math.abs(layer) * 7) : kind === "bridge" ? Math.max(6, layer * 6) : 0;
        const gauge = THREE.MathUtils.clamp((numeric(String(p.gauge ?? "").split(";")[0]) ?? 1435) / 1000, 0.6, 2);
        const original = feature.geometry.coordinates.map(([lon, lat]) => project(lat, lon));
        if (original.length < 2) continue;
        const ground = (x: number, z: number) => terrain?.sample(x, z).height ?? 0;
        const start = ground(original[0].x, original[0].z) + offset + 0.08;
        const end = ground(original.at(-1)!.x, original.at(-1)!.z) + offset + 0.08;
        const total = original.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - original[i].x, b.z - original[i].z), 0);
        let travelled = 0, run: THREE.Vector3[] = [], part = 0;
        /** Commits a contiguous in-bounds run; outside-map gaps never become connecting tracks. */
        const flush = () => {
            if (run.length > 1) {
                const path = new RailPath(`${p["@id"] ?? feature.id}/${part++}`, run, kind, layer, String(p.railway), gauge, !!p.service);
                if (path.length > 1) paths.push(path);
                // Only coordinates actually shared by OSM ways join. No proximity-based cross-track snapping.
                for (const point of [run[0], run.at(-1)!]) {
                    const key = `${p.railway}:${point.x.toFixed(3)},${point.z.toFixed(3)}`;
                    if (!joins.has(key)) joins.set(key, []);
                    joins.get(key)!.push(point);
                }
            }
            run = [];
        };
        for (let i = 1; i < original.length; i++) {
            const a = original[i - 1], b = original[i];
            const length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.max(1, Math.ceil(length / 6));
            for (let j = i === 1 ? 0 : 1; j <= count; j++) {
                const t = j / count, x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
                if (!Number.isFinite(x + z) || (terrain && !terrain.contains(x, z))) { flush(); continue; }
                const y = kind === "ground" ? ground(x, z) + 0.08 : THREE.MathUtils.lerp(start, end, (travelled + t * length) / (total || 1));
                if (Number.isFinite(y) && (!run.length || Math.hypot(run.at(-1)!.x - x, run.at(-1)!.z - z) > 0.001)) run.push(new THREE.Vector3(x, y, z));
            }
            travelled += length;
        }
        flush();
    }
    // A multi-source shortest-path envelope bounds grades without depending on way order.
    // Terrain provides upper bounds: tunnels retain cover and terrain spikes cannot create vertical rails.
    interface HeightNode { height: number; points: THREE.Vector3[]; links: Array<{ node: HeightNode; rise: number }> }
    const nodes: HeightNode[] = [], endpoints = new Map<THREE.Vector3, HeightNode>();
    for (const points of joins.values()) {
        const node: HeightNode = { height: Math.min(...points.map(p => p.y)), points, links: [] };
        nodes.push(node); for (const point of points) endpoints.set(point, node);
    }
    for (const path of paths) {
        let previous: HeightNode | undefined;
        for (const point of path.points) {
            let node = endpoints.get(point);
            if (!node) { node = { height: point.y, points: [point], links: [] }; nodes.push(node); }
            if (path.kind === "tunnel") node.height = Math.min(node.height, (terrain?.sample(point.x, point.z).height ?? 0) - 8);
            if (previous) {
                const a = previous.points[0], rise = Math.hypot(point.x - a.x, point.z - a.z) * 0.06;
                previous.links.push({ node, rise }); node.links.push({ node: previous, rise });
            }
            previous = node;
        }
    }
    const heap: Array<{ node: HeightNode; height: number }> = [];
    /** Inserts a height candidate into the minimum-priority binary heap. */
    const push = (entry: typeof heap[number]) => {
        let i = heap.length; heap.push(entry);
        while (i > 0) { const parent = (i - 1) >>> 1; if (heap[parent].height <= entry.height) break; heap[i] = heap[parent]; i = parent; }
        heap[i] = entry;
    };
    for (const node of nodes) push({ node, height: node.height });
    while (heap.length) {
        const current = heap[0], last = heap.pop()!;
        if (heap.length) {
            let i = 0;
            while (i * 2 + 1 < heap.length) {
                let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].height < heap[child].height) child++;
                if (heap[child].height >= last.height) break; heap[i] = heap[child]; i = child;
            }
            heap[i] = last;
        }
        if (current.height > current.node.height) continue;
        for (const { node, rise } of current.node.links) if (node.height > current.height + rise + 1e-8) {
            node.height = current.height + rise; push({ node, height: node.height });
        }
    }
    for (const node of nodes) for (const point of node.points) point.y = node.height;
    return paths.map(p => new RailPath(p.id, p.points, p.kind, p.layer, p.railway, p.gauge, p.service));
}

/** Joins contiguous ways at compatible endpoints, preferring straight continuations at switches. */
export function railRoutes(paths: RailPath[]): RailPath[] {
    const candidates = paths.filter(p => !p.service);
    const ends = new Map<string, Array<{ path: RailPath; reverse: boolean }>>();
    const key = (p: THREE.Vector3, railway: string) => `${railway}:${p.x.toFixed(3)},${p.z.toFixed(3)},${p.y.toFixed(2)}`;
    for (const path of candidates) for (const reverse of [false, true]) {
        const k = key(reverse ? path.points.at(-1)! : path.points[0], path.railway);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k)!.push({ path, reverse });
    }
    const used = new Set<RailPath>(), routes: RailPath[] = [];
    // Start at open ends first, then consume remaining loops/branches deterministically.
    const ordered = [...candidates].sort((a, b) => Number(ends.get(key(a.points[0], a.railway))!.length !== 1) - Number(ends.get(key(b.points[0], b.railway))!.length !== 1) || b.length - a.length);
    for (const seed of ordered) {
        if (used.has(seed)) continue;
        const points = seed.points.map(p => p.clone()); used.add(seed);
        let surfaceLength = seed.surfaceLength;
        for (const backwards of [false, true]) {
            if (backwards) points.reverse();
            while (true) {
                const last = points.at(-1)!, previous = points.at(-2)!;
                const direction = last.clone().sub(previous).normalize();
                const options = (ends.get(key(last, seed.railway)) ?? []).filter(o => !used.has(o.path) && Math.abs(o.path.gauge - seed.gauge) < 0.01);
                options.sort((a, b) => {
                    const tangent = (o: typeof a) => o.reverse ? o.path.points.at(-2)!.clone().sub(last).normalize() : o.path.points[1].clone().sub(last).normalize();
                    return direction.dot(tangent(b)) - direction.dot(tangent(a));
                });
                const next = options[0]; if (!next) break;
                const extension = next.reverse ? [...next.path.points].reverse() : next.path.points;
                const tangent = extension[1].clone().sub(extension[0]).normalize();
                if (direction.dot(tangent) < 0.3) break; // Never U-turn through a turnout.
                points.push(...extension.slice(1).map(p => p.clone())); used.add(next.path); surfaceLength += next.path.surfaceLength;
            }
        }
        if (points.length > 1) {
            const route = new RailPath(seed.id, points, seed.kind, seed.layer, seed.railway, seed.gauge, false);
            route.surfaceLength = surfaceLength; routes.push(route);
        }
    }
    return routes.sort((a, b) => b.length - a.length);
}

/** Aligns local +Z to the track tangent with pitch/yaw only, preventing arbitrary roll near southward headings.
 * @param direction - Track tangent; normalization is not required.
 * @param target - Reusable quaternion receiving the orientation.
 */
export function railRotation(direction: THREE.Vector3, target: THREE.Quaternion): THREE.Quaternion {
    return target.setFromEuler(new THREE.Euler(
        -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
        Math.atan2(direction.x, direction.z), 0, "YXZ",
    ));
}
