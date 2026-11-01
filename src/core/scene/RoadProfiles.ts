/**
 * RoadProfiles types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import { SpatialGrid, closestPoint } from "./CollisionWorld";
import type { Point } from "./CollisionWorld";
import type { SurfaceSample } from "./ElevationTerrain";

export type RoadKind = "ground" | "bridge" | "tunnel";
export interface RoadLevelOverride {
    kind?: RoadKind;
    startHeight?: number;
    endHeight?: number;
    heightOffset?: number;
    clearance?: number;
    headroom?: number;
}
export interface RoadLevelSettings {
    layerSeparation: number;
    tunnelCover: number;
    tunnelHeadroom: number;
    rampLength: number;
    /** Target tunnel entrance transition length in metres, separate from bridge approaches. */
    tunnelRampLength: number;
    maxGrade: number;
    deckThickness: number;
    overrides: Record<string, RoadLevelOverride>;
}
export const DEFAULT_ROAD_LEVELS: RoadLevelSettings = {
    layerSeparation: 3,
    tunnelCover: 2,
    tunnelHeadroom: 4,
    rampLength: 35,
    tunnelRampLength: 12,
    maxGrade: 0.22,
    deckThickness: 0.5,
    overrides: {},
};
export interface RoadInput {
    id: string;
    points: Point[];
    kind: RoadKind;
    layer: number;
    halfWidth: number;
    sidewalks?: { left: number; right: number };
    name?: string;
    surface: string;
    /** Original OSM road class controls paving and markings. */
    highway?: string;
    lanes?: number;
    headroom?: number;
}
interface Node extends Point {
    ground: number;
    height: number;
    links: Array<{ node: Node; length: number; kind: RoadKind }>;
    kinds: Set<RoadKind>;
    layers: number[];
    engineeredApproach?: boolean;
}
interface Segment {
    a: Node;
    b: Node;
    road: RoadProfile;
}
export interface RoadContact extends SurfaceSample {
    surface: string;
    grip: number;
    structure: RoadKind;
    roadId?: string;
    ceiling?: number;
}

/**
 * Clamps a scalar to zero through one and applies cubic smoothstep interpolation.
 *
 * @param v - Vertex or scalar being evaluated.
 */
const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
};

/**
 * Samples a solved road elevation profile and supplies tapered widths and shared endpoint cross-sections.
 */
export class RoadProfile {
    readonly nodes: Node[];
    readonly curve: THREE.Curve<THREE.Vector3>;
    readonly headroom: number;
    startLaneCount?: number;
    endLaneCount?: number;
    startHalfWidth: number;
    endHalfWidth: number;
    startNormal?: THREE.Vector3;
    endNormal?: THREE.Vector3;
    /** Shared fillet midpoint replacing the sharp plan-view endpoint, retaining graph connectivity. */
    startJoinPoint?: THREE.Vector3;
    /** Shared fillet midpoint at the road end. */
    endJoinPoint?: THREE.Vector3;
    private horizontalLength = 0;
    private readonly horizontalCurve: THREE.CatmullRomCurve3;
    /**
     * Returns road half-width in metres at a normalized curve parameter, including endpoint tapers.
     *
     * @param t - Normalized curve or local interpolation parameter.
     */
    halfWidthAt(t: number): number {
        const startSpan = Math.min(this.horizontalLength / 2, Math.max(15, Math.abs(this.startHalfWidth - this.input.halfWidth) * 12));
        const endSpan = Math.min(this.horizontalLength / 2, Math.max(15, Math.abs(this.endHalfWidth - this.input.halfWidth) * 12));
        const start = 1 - smooth((t * this.horizontalLength) / Math.max(0.01, startSpan));
        const end = 1 - smooth(((1 - t) * this.horizontalLength) / Math.max(0.01, endSpan));
        return (
            this.input.halfWidth +
            (this.startHalfWidth - this.input.halfWidth) * start +
            (this.endHalfWidth - this.input.halfWidth) * end
        );
    }
    /**
     * Returns the marking width multiplier used to taper lane dividers at lane-count transitions.
     *
     * @param t - Normalized curve or local interpolation parameter.
     */
    dividerScaleAt(t: number): number {
        const start =
            this.startLaneCount !== undefined && this.startLaneCount !== this.input.lanes
                ? smooth((t * this.horizontalLength) / 15)
                : 1;
        const end =
            this.endLaneCount !== undefined && this.endLaneCount !== this.input.lanes
                ? smooth(((1 - t) * this.horizontalLength) / 15)
                : 1;
        return Math.min(start, end);
    }
    /**
     * Returns a normalized road-edge direction blended toward shared endpoint cross-sections.
     *
     * @param t - Normalized curve or local interpolation parameter.
     */
    perpendicularAt(t: number): THREE.Vector3 {
        const tangent = this.horizontalPoint(Math.min(1, t + 0.0001))
            .sub(this.horizontalPoint(Math.max(0, t - 0.0001))).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const blend = Math.min(0.5, 15 / Math.max(1, this.horizontalLength));
        if (this.startNormal && t < blend) normal.lerp(this.startNormal, 1 - smooth(t / blend));
        if (this.endNormal && t > 1 - blend)
            normal.lerp(this.endNormal, 1 - smooth((1 - t) / blend));
        return normal.normalize();
    }

    /** Rounds a connected endpoint through a shared fillet midpoint without changing graph connectivity.
     * @param t - Normalized position along the original road parameterization.
     * @param target - Destination for the horizontal centreline point.
     */
    private horizontalPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
        if (this.input.highway === "steps") {
            let distance = Math.max(0, Math.min(1, t)) * this.horizontalLength;
            for (let index = 1; index < this.nodes.length; index++) {
                const a = this.nodes[index - 1], b = this.nodes[index];
                const length = Math.hypot(b.x - a.x, b.z - a.z);
                if (distance <= length || index === this.nodes.length - 1) {
                    const fraction = length > 0 ? Math.min(1, distance / length) : 0;
                    return target.set(a.x + (b.x - a.x) * fraction, 0, a.z + (b.z - a.z) * fraction);
                }
                distance -= length;
            }
        }
        const span = Math.min(0.3, 18 / Math.max(1, this.horizontalLength));
        const start = !!this.startNormal && t < span;
        const end = !!this.endNormal && t > 1 - span;
        if (!start && !end) return this.horizontalCurve.getPoint(t, target);
        const normal = (start ? this.startNormal : this.endNormal)!;
        const direction = new THREE.Vector3(normal.z, 0, -normal.x);
        const a = this.horizontalCurve.getPoint(start ? 0 : 1 - span);
        const b = this.horizontalCurve.getPoint(start ? span : 1);
        if (start && this.startJoinPoint) a.copy(this.startJoinPoint).setY(0);
        if (end && this.endJoinPoint) b.copy(this.endJoinPoint).setY(0);
        const handle = a.distanceTo(b) / 3;
        const c = a.clone().addScaledVector(start ? direction : this.horizontalCurve.getTangent(1 - span), handle);
        const d = b.clone().addScaledVector(start ? this.horizontalCurve.getTangent(span) : direction, -handle);
        const u = start ? t / span : (t - 1 + span) / span;
        const v = 1 - u;
        return target.copy(a).multiplyScalar(v*v*v).addScaledVector(c,3*v*v*u)
            .addScaledVector(d,3*v*u*u).addScaledVector(b,u*u*u);
    }
    /** Returns the maximum plan-view endpoint blend distance allowed by this road's length. */
    horizontalJoinReach(): number { return this.horizontalLength * 0.3; }

    private generationSamples: Map<number, Map<number, RoadContact>> | null = null;
    /** Enables a short-lived exact-coordinate cache while static geometry is generated. */
    setGenerationCaching(enabled: boolean): void {
        this.generationSamples = enabled ? new Map() : null;
    }
    private grid = new SpatialGrid<Segment>();
    private segments: Segment[] = [];
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param input - Road definition or normalized vehicle controls, as indicated by its type.
     * @param nodes - Connected road-profile nodes.
     * @param groundAt - Terrain height and slope sampler.
     * @param settings - Road profile and structure settings.
     */
    constructor(
        readonly input: RoadInput,
        nodes: Node[],
        private groundAt: (x: number, z: number) => SurfaceSample,
        settings: RoadLevelSettings,
    ) {
        this.nodes = nodes;
        this.startHalfWidth = this.endHalfWidth = input.halfWidth;
        for (let i = 1; i < nodes.length; i++)
            this.horizontalLength += Math.hypot(
                nodes[i].x - nodes[i - 1].x,
                nodes[i].z - nodes[i - 1].z,
            );
        this.headroom =
            settings.overrides[input.id]?.headroom ?? input.headroom ?? settings.tunnelHeadroom;
        const profile = this;
        const path = new THREE.CatmullRomCurve3(
            nodes.map((p) => new THREE.Vector3(p.x, 0, p.z)),
            false,
            "centripetal",
        );
        this.horizontalCurve = path;
        this.curve = new /**
         * Adapts the horizontal road centreline to the solved vertical profile.
         */
        (class extends THREE.Curve<THREE.Vector3> {
            /**
             * Initializes instance state and owned resources using the supplied dependencies.
             */
            constructor() {
                super();
            }
            /**
             * Samples the custom centreline and replaces its vertical coordinate with the solved road elevation.
             *
             * @param t - Normalized curve or local interpolation parameter.
             * @param target - Vector receiving the sampled curve point.
             */
            getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
                profile.horizontalPoint(t, target);
                target.y = profile.sample(target.x, target.z).height;
                return target;
            }
        })();
        for (let i = 1; i < nodes.length; i++) {
            const segment = { a: nodes[i - 1], b: nodes[i], road: this };
            this.segments.push(segment);
            this.grid.insert(
                segment,
                Math.min(segment.a.x, segment.b.x) - input.halfWidth - 3,
                Math.min(segment.a.z, segment.b.z) - input.halfWidth - 3,
                Math.max(segment.a.x, segment.b.x) + input.halfWidth + 3,
                Math.max(segment.a.z, segment.b.z) + input.halfWidth + 3,
            );
        }
    }

    /**
     * Samples the represented surface height and, where available, slopes and contact metadata.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     */
    sample(x: number, z: number): RoadContact {
        const cached = this.generationSamples?.get(x)?.get(z);
        if (cached) return { ...cached };
        let best: Segment | undefined,
            distance = Infinity,
            along = 0;
        const nearby = this.grid.at(x, z);
        for (const segment of nearby instanceof Set && nearby.size ? nearby : this.segments) {
            const dx = segment.b.x - segment.a.x, dz = segment.b.z - segment.a.z;
            const fraction = Math.max(0, Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / (dx * dx + dz * dz || 1)));
            const qx = segment.a.x + fraction * dx, qz = segment.a.z + fraction * dz;
            const d = Math.hypot(qx - x, qz - z);
            if (d < distance) {
                distance = d;
                best = segment;
                const length = Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z);
                along = length ? Math.hypot(qx - segment.a.x, qz - segment.a.z) / length : 0;
            }
        }
        const ground = this.groundAt(x, z);
        let height = ground.height + 0.06,
            slopeX = ground.slopeX,
            slopeZ = ground.slopeZ;
        if (best) {
            const { a, b } = best,
                dx = b.x - a.x,
                dz = b.z - a.z,
                length2 = dx * dx + dz * dz || 1;
            if (this.input.kind === "ground" && !a.engineeredApproach && !b.engineeredApproach) {
                const oa = a.height - a.ground,
                    ob = b.height - b.ground;
                height += oa + (ob - oa) * along;
                slopeX += ((ob - oa) * dx) / length2;
                slopeZ += ((ob - oa) * dz) / length2;
            } else {
                height = a.height + (b.height - a.height) * along;
                slopeX = ((b.height - a.height) * dx) / length2;
                slopeZ = ((b.height - a.height) * dz) / length2;
            }
        }
        // Both sides of a join use the same cross-section plane, even where the
        // terrain slopes across a wider carriageway. This removes vertical edge seams.
        for (const start of [true, false]) {
            const normal = start ? this.startNormal : this.endNormal;
            if (!normal) continue;
            const end = this.nodes[start ? 0 : this.nodes.length - 1];
            const anchor = (start ? this.startJoinPoint : this.endJoinPoint) ?? end;
            const neighbor = this.nodes[start ? 1 : this.nodes.length - 2];
            const direction = start ? 1 : -1;
            const along = ((x - anchor.x) * normal.z - (z - anchor.z) * normal.x) * direction;
            const span = Math.min(15, this.horizontalLength / 3);
            // A join plane is local to its endpoint. On switchbacks, projecting
            // onto its infinite plane can capture a remote leg and teleport its height.
            const lateral = (x - anchor.x) * normal.x + (z - anchor.z) * normal.z;
            const endWidth =
                (start ? this.startHalfWidth : this.endHalfWidth) +
                Math.max(this.input.sidewalks?.left ?? 0, this.input.sidewalks?.right ?? 0) +
                0.5;
            if (
                along < -0.01 ||
                along >= span ||
                Math.abs(lateral) > endWidth ||
                Math.hypot(x - anchor.x, z - anchor.z) > Math.hypot(span, endWidth)
            )
                continue;
            const blend = 1 - smooth(Math.max(0, along) / Math.max(span, 0.001));
            const grade =
                (neighbor.height - end.height) /
                Math.max(0.001, Math.hypot(neighbor.x - anchor.x, neighbor.z - anchor.z));
            if (Math.abs(along) < 1e-6) {
                height = end.height;
                slopeX = normal.z * direction * grade;
                slopeZ = -normal.x * direction * grade;
                break;
            }
            height = THREE.MathUtils.lerp(height, end.height + Math.max(0, along) * grade, blend);
            slopeX = THREE.MathUtils.lerp(slopeX, normal.z * direction * grade, blend);
            slopeZ = THREE.MathUtils.lerp(slopeZ, -normal.x * direction * grade, blend);
        }
        if (this.input.highway === "steps" && best) {
            const rise = best.b.height - best.a.height;
            const run = Math.hypot(best.b.x - best.a.x, best.b.z - best.a.z);
            const count = Math.max(1, Math.ceil(Math.abs(rise) / 0.17), Math.round(run / 0.32));
            height = best.a.height + rise * Math.min(count, Math.floor(along * count + 1e-8)) / count;
            slopeX = slopeZ = 0;
        }
        const surface = this.input.surface;
        const grip = ["gravel", "dirt", "ground", "sand"].includes(surface)
            ? 0.6
            : surface === "cobblestone"
              ? 0.8
              : 1;
        const result: RoadContact = {
            height,
            slopeX,
            slopeZ,
            surface,
            grip,
            structure: this.input.kind,
            roadId: this.input.id,
            ceiling: this.input.kind === "tunnel" ? height + this.headroom : undefined,
        };
        if (this.generationSamples) {
            let column = this.generationSamples.get(x);
            if (!column) { column = new Map(); this.generationSamples.set(x, column); }
            column.set(z, { ...result });
        }
        return result;
    }
}

/** Estimated road profiles: OSM supplies ordering/connectivity, not surveyed metre heights. */
export class RoadProfileNetwork {
    readonly profiles: RoadProfile[] = [];
    private nodes = new Map<string, Node>();
    private segments: Segment[] = [];
    readonly settings: RoadLevelSettings;

    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param inputs - Road definitions with horizontal geometry, layer and structure metadata.
     * @param groundAt - Terrain height and slope sampler.
     * @param options - Optional road-profile settings and per-way overrides.
     * @param referenceHeight - Source elevation datum offset in metres.
     */
    constructor(
        inputs: RoadInput[],
        groundAt: (x: number, z: number) => SurfaceSample,
        options: Partial<RoadLevelSettings> = {},
        referenceHeight = 0,
    ) {
        this.settings = {
            ...DEFAULT_ROAD_LEVELS,
            ...options,
            overrides: options.overrides ?? {},
        };
        for (const key of [
            "layerSeparation",
            "tunnelCover",
            "tunnelHeadroom",
            "rampLength",
            "tunnelRampLength",
            "maxGrade",
            "deckThickness",
        ] as const) {
            if (!Number.isFinite(this.settings[key]) || this.settings[key] <= 0)
                this.settings[key] = DEFAULT_ROAD_LEVELS[key];
        }
        for (const input of inputs) {
            input.kind = this.settings.overrides[input.id]?.kind ?? input.kind;
            const points: Node[] = [];
            for (let i = 0; i < input.points.length - 1; i++) {
                const a = input.points[i],
                    b = input.points[i + 1];
                const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5));
                for (let j = 0; j < steps; j++)
                    points.push(
                        this.node(
                            a.x + ((b.x - a.x) * j) / steps,
                            a.z + ((b.z - a.z) * j) / steps,
                            input,
                            groundAt,
                        ),
                    );
            }
            const last = input.points[input.points.length - 1];
            points.push(this.node(last.x, last.z, input, groundAt));
            const filtered = points.filter((node, i) => !i || node !== points[i - 1]);
            if (filtered.length < 2) continue;
            const profile = new RoadProfile(input, filtered, groundAt, this.settings);
            this.profiles.push(profile);
            for (let i = 1; i < filtered.length; i++) {
                const a = filtered[i - 1],
                    b = filtered[i],
                    length = Math.hypot(b.x - a.x, b.z - a.z);
                a.links.push({ node: b, length, kind: input.kind });
                b.links.push({ node: a, length, kind: input.kind });
                this.segments.push({ a, b, road: profile });
            }
        }
        this.plan("bridge");
        this.plan("tunnel");
        this.coupleBridgeDecks();
        this.separateCrossings();
        this.limitGrades("bridge");
        this.limitGrades("tunnel");
        // Tunnel exits can share nodes with bridges. Reconcile both networks together
        // after planning so changing a shared exit cannot leave a vertical step.
        this.limitGrades("all");
        const offsets = new Map<Node, number[]>();
        for (const road of this.profiles) {
            const override = this.settings.overrides[road.input.id];
            if (!override) continue;
            if (Number.isFinite(override.heightOffset))
                for (const node of road.nodes) {
                    const values = offsets.get(node) ?? [];
                    values.push(override.heightOffset!);
                    offsets.set(node, values);
                }
        }
        for (const [node, values] of offsets)
            node.height += values.reduce((a, b) => a + b, 0) / values.length;
        const corrections = new Map<Node, number[]>();
        for (const road of this.profiles) {
            const override = this.settings.overrides[road.input.id];
            if (!override) continue;
            const startDelta = Number.isFinite(override.startHeight)
                ? override.startHeight! - referenceHeight - road.nodes[0].height
                : 0;
            const endDelta = Number.isFinite(override.endHeight)
                ? override.endHeight! - referenceHeight - road.nodes[road.nodes.length - 1].height
                : 0;
            const lengths = [0];
            for (let i = 1; i < road.nodes.length; i++)
                lengths.push(
                    lengths[i - 1] +
                        Math.hypot(
                            road.nodes[i].x - road.nodes[i - 1].x,
                            road.nodes[i].z - road.nodes[i - 1].z,
                        ),
                );
            for (let i = 0; i < road.nodes.length; i++) {
                const t = lengths[i] / lengths[lengths.length - 1];
                const values = corrections.get(road.nodes[i]) ?? [];
                values.push(startDelta * (1 - t) + endDelta * t);
                corrections.set(road.nodes[i], values);
            }
        }
        for (const [node, values] of corrections)
            node.height += values.reduce((a, b) => a + b, 0) / values.length;
        this.straightenBridgeSpans();
        this.blendApproaches();
        this.smoothTunnelApproaches();
        this.limitGrades("all");
        this.configureJoins();
    }

    /** Local constraints between sustained parallel carriageways of the same named bridge. */
    private straightenBridgeSpans(): void {
        const owners = new Map<Node, Set<RoadProfile>>();
        for (const p of this.profiles)
            for (const n of p.nodes) {
                const set = owners.get(n) ?? new Set<RoadProfile>();
                set.add(p);
                owners.set(n, set);
            }
        // Keep junctions and explicit height controls, but remove local bumps between them.
        const heights = new Map<Node, number>();
        for (const p of this.profiles) {
            if (p.input.kind !== "bridge") continue;
            const anchors = p.nodes
                .map((n, i) =>
                    i === 0 || i === p.nodes.length - 1 || owners.get(n)!.size > 1 ? i : -1,
                )
                .filter((i) => i >= 0);
            for (let j = 1; j < anchors.length; j++) {
                const a = anchors[j - 1],
                    b = anchors[j],
                    distances = [0];
                for (let i = a + 1; i <= b; i++)
                    distances.push(
                        distances[distances.length - 1] +
                            Math.hypot(
                                p.nodes[i].x - p.nodes[i - 1].x,
                                p.nodes[i].z - p.nodes[i - 1].z,
                            ),
                    );
                const total = distances[distances.length - 1];
                for (let i = a + 1; i < b; i++)
                    heights.set(
                        p.nodes[i],
                        THREE.MathUtils.lerp(
                            p.nodes[a].height,
                            p.nodes[b].height,
                            distances[i - a] / Math.max(total, 0.001),
                        ),
                    );
            }
        }
        for (const [n, height] of heights) n.height = height;
    }

    /**
     * Shares endpoint cross-sections and rounds bends between exactly two connected roads.
     */
    private configureJoins(): void {
        const ends = new Map<Node, Array<{ p: RoadProfile; start: boolean }>>();
        for (const p of this.profiles)
            for (const start of [true, false]) {
                const node = p.nodes[start ? 0 : p.nodes.length - 1];
                const list = ends.get(node) ?? [];
                list.push({ p, start });
                ends.set(node, list);
            }
        for (const list of ends.values()) {
            if (list.length !== 2) continue; // Branching intersections retain their own widths.
            const normals = list.map(({ p, start }) => {
                return p.perpendicularAt(start ? 0 : 1);
            });
            // Orient both normals in the first road's travel direction, regardless of OSM way direction.
            const orientation = list[0].start === list[1].start ? -1 : 1;
            const dot = normals[0].dot(normals[1]) * orientation;
            if (dot < -0.7) continue; // Near-reversals need a junction/turning-area solution.
            const shared = normals[0]
                .clone()
                .addScaledVector(normals[1], orientation)
                .normalize();
            const width = list.reduce((sum, e) => sum + e.p.input.halfWidth, 0) / 2;
            const reach = Math.min(18, ...list.map(({p}) => p.horizontalJoinReach()));
            const join = new THREE.Vector3();
            list.forEach(({start}, i) => {
                const n = normals[i]!;
                join.addScaledVector(new THREE.Vector3(n.z, 0, -n.x), start ? 1 : -1);
            });
            const node = list[0].p.nodes[list[0].start ? 0 : list[0].p.nodes.length - 1];
            join.multiplyScalar(reach * 0.25).add(new THREE.Vector3(node.x, 0, node.z));
            list.forEach(({ p, start }, i) => {
                const normal = shared.clone().multiplyScalar(i === 1 ? orientation : 1);
                if (start) {
                    p.startLaneCount = list[1 - i].p.input.lanes;
                    p.startHalfWidth = width;
                    p.startNormal = normal;
                    p.startJoinPoint = join.clone();
                } else {
                    p.endLaneCount = list[1 - i].p.input.lanes;
                    p.endHalfWidth = width;
                    p.endNormal = normal;
                    p.endJoinPoint = join.clone();
                }
            });
        }
    }

    /**
     * Adds local grade constraints between sustained parallel bridges with matching names and layers.
     */
    private coupleBridgeDecks(): void {
        const grid = new SpatialGrid<Segment>(40);
        const bridges = this.segments.filter((s) => s.road.input.kind === "bridge");
        for (const s of bridges)
            grid.insert(
                s,
                Math.min(s.a.x, s.b.x) - 20,
                Math.min(s.a.z, s.b.z) - 20,
                Math.max(s.a.x, s.b.x) + 20,
                Math.max(s.a.z, s.b.z) + 20,
            );
        const pairs = new Map<string, { links: Array<[Node, Node, number]>; length: number }>();
        for (const a of bridges) {
            const input = a.road.input;
            if (!input.name || this.settings.overrides[input.id]) continue;
            const dx = a.b.x - a.a.x,
                dz = a.b.z - a.a.z,
                length = Math.hypot(dx, dz);
            if (!length) continue;
            const seen = new Set<RoadProfile>();
            for (const b of grid.at(a.a.x, a.a.z)) {
                const other = b.road.input;
                if (
                    other.id <= input.id ||
                    seen.has(b.road) ||
                    input.layer !== other.layer ||
                    input.name !== other.name ||
                    this.settings.overrides[other.id]
                )
                    continue;
                const bx = b.b.x - b.a.x,
                    bz = b.b.z - b.a.z,
                    bl = Math.hypot(bx, bz);
                if (!bl || Math.abs((dx * bx + dz * bz) / (length * bl)) < 0.985) continue;
                const along = ((a.a.x - b.a.x) * bx + (a.a.z - b.a.z) * bz) / (bl * bl);
                if (along < 0 || along > 1) continue;
                const q = closestPoint(a.a, b.a, b.b),
                    distance = Math.hypot(q.x - a.a.x, q.z - a.a.z);
                if (distance < 2 || distance > Math.min(20, input.halfWidth + other.halfWidth + 6))
                    continue;
                seen.add(b.road);
                const n = along < 0.5 ? b.a : b.b;
                const longitudinal = Math.abs((n.x - a.a.x) * dx + (n.z - a.a.z) * dz) / length;
                const key = `${input.id}|${other.id}`;
                const pair = pairs.get(key) ?? { links: [], length: 0 };
                pair.links.push([a.a, n, longitudinal]);
                pair.length += length;
                pairs.set(key, pair);
            }
        }
        for (const pair of pairs.values()) {
            if (pair.length < 25 || pair.links.length < 5) continue;
            for (const [a, b, length] of pair.links) {
                a.links.push({ node: b, length, kind: "bridge" });
                b.links.push({ node: a, length, kind: "bridge" });
            }
        }
    }

    /**
     * Creates or reuses a rounded-coordinate network node and records its terrain height, kinds and layers.
     *
     * @param x - Local eastward coordinate in metres.
     * @param z - Local southward coordinate in metres.
     * @param road - Sampled road elevation and slopes.
     * @param groundAt - Terrain height and slope sampler.
     */
    private node(
        x: number,
        z: number,
        road: RoadInput,
        groundAt: (x: number, z: number) => SurfaceSample,
    ): Node {
        const key = `${x.toFixed(3)},${z.toFixed(3)}`;
        let node = this.nodes.get(key);
        if (!node) {
            const ground = groundAt(x, z).height + 0.06;
            node = {
                x,
                z,
                ground,
                height: ground,
                links: [],
                kinds: new Set(),
                layers: [],
            };
            this.nodes.set(key, node);
        }
        node.kinds.add(road.kind);
        node.layers.push(road.layer);
        return node;
    }

    /**
     * Traverses links of one road kind to calculate bounded distances along the connected network.
     *
     * @param sources - Starting nodes for network traversal.
     * @param kind - Road structure or sound variant, as indicated by its type.
     * @param limit - Maximum traversal distance in metres.
     */
    private distances(sources: Node[], kind: RoadKind, limit = Infinity): Map<Node, number> {
        const distance = new Map<Node, number>(sources.map((node) => [node, 0])),
            queue = [...sources];
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i],
                d = distance.get(node)!;
            for (const link of node.links) {
                if (link.kind !== kind || d + link.length > limit) continue;
                if (d + link.length < (distance.get(link.node) ?? Infinity)) {
                    distance.set(link.node, d + link.length);
                    queue.push(link.node);
                }
            }
        }
        return distance;
    }

    /**
     * Estimates bridge or tunnel heights from connected component anchors and configured clearances.
     *
     * @param kind - Road structure or sound variant, as indicated by its type.
     */
    private plan(kind: "bridge" | "tunnel"): void {
        const visited = new Set<Node>();
        for (const start of this.nodes.values()) {
            if (visited.has(start) || !start.kinds.has(kind)) continue;
            const component = [start];
            visited.add(start);
            for (let i = 0; i < component.length; i++)
                for (const link of component[i].links) {
                    if (link.kind === kind && !visited.has(link.node)) {
                        visited.add(link.node);
                        component.push(link.node);
                    }
                }
            const portals = component.filter(
                (node) =>
                    node.kinds.size > 1 ||
                    node.links.filter((link) => link.kind === kind).length === 1,
            );
            const distance = this.distances(portals, kind);
            const anchorDistances = portals.map((portal) => ({
                portal,
                distance: this.distances([portal], kind),
            }));
            const maxDistance = Math.max(
                1,
                ...component.map((node) => distance.get(node) ?? this.settings.rampLength),
            );
            const clearances = this.profiles
                .filter((road) => road.input.kind === kind && component.includes(road.nodes[0]))
                .map((road) => this.settings.overrides[road.input.id]?.clearance)
                .filter((value): value is number => Number.isFinite(value) && value! > 0);
            const clearance = Math.max(this.settings.layerSeparation, ...clearances);
            for (const node of component) {
                const anchors = anchorDistances
                    .map((anchor) => ({
                        y: anchor.portal.ground,
                        d: anchor.distance.get(node) ?? Infinity,
                    }))
                    .sort((a, b) => a.d - b.d)
                    .slice(0, 2);
                let base = node.ground;
                if (anchors[0]?.d === 0) base = anchors[0].y;
                else if (anchors.length === 1) base = anchors[0].y;
                else if (anchors.length === 2)
                    base =
                        (anchors[0].y * anchors[1].d + anchors[1].y * anchors[0].d) /
                        (anchors[0].d + anchors[1].d);
                const level = Math.max(1, ...node.layers.map((layer) => Math.abs(layer)));
                if (kind === "bridge") node.height = base + clearance;
                else {
                    const blend = smooth(
                        (distance.get(node) ?? this.settings.rampLength) /
                            Math.min(this.settings.tunnelRampLength, maxDistance),
                    );
                    const depth = Math.min(
                        Math.max(
                            clearance * level,
                            this.settings.tunnelHeadroom + this.settings.tunnelCover,
                        ),
                        maxDistance * this.settings.maxGrade * 0.65,
                    );
                    node.height = base - depth * blend;
                }
            }
        }
    }

    /**
     * Adjusts differently layered road crossings to maintain the configured vertical separation.
     */
    private separateCrossings(): void {
        const grid = new SpatialGrid<Segment>(40);
        for (const segment of this.segments)
            grid.insert(
                segment,
                Math.min(segment.a.x, segment.b.x),
                Math.min(segment.a.z, segment.b.z),
                Math.max(segment.a.x, segment.b.x),
                Math.max(segment.a.z, segment.b.z),
            );
        for (let pass = 0; pass < 3; pass++)
            for (const a of this.segments) {
                if (a.road.input.kind === "ground") continue;
                const middle = {
                    x: (a.a.x + a.b.x) / 2,
                    z: (a.a.z + a.b.z) / 2,
                };
                const candidates = new Set([
                    ...grid.at(a.a.x, a.a.z),
                    ...grid.at(middle.x, middle.z),
                    ...grid.at(a.b.x, a.b.z),
                ]);
                for (const b of candidates) {
                    if (
                        a.road === b.road ||
                        a.road.input.layer === b.road.input.layer ||
                        [b.a, b.b].includes(a.a) ||
                        [b.a, b.b].includes(a.b)
                    )
                        continue;
                    const ax = a.b.x - a.a.x,
                        az = a.b.z - a.a.z,
                        bx = b.b.x - b.a.x,
                        bz = b.b.z - b.a.z;
                    const det = ax * bz - az * bx;
                    if (Math.abs(det) < 1e-8) continue;
                    const dx = b.a.x - a.a.x,
                        dz = b.a.z - a.a.z;
                    const ta = (dx * bz - dz * bx) / det,
                        tb = (dx * az - dz * ax) / det;
                    if (ta < 0 || ta > 1 || tb < 0 || tb > 1) continue;
                    const ya = a.a.height + (a.b.height - a.a.height) * ta,
                        yb = b.a.height + (b.b.height - b.a.height) * tb;
                    const upper = a.road.input.layer > b.road.input.layer ? a : b;
                    const lower = upper === a ? b : a;
                    const gap = upper === a ? ya - yb : yb - ya;
                    const needed = this.settings.layerSeparation - gap;
                    if (needed <= 0.01) continue;
                    const adjusted = upper.road.input.kind === "bridge" ? upper : lower;
                    if (adjusted.road.input.kind === "ground") continue;
                    const sign = adjusted === upper ? 1 : -1;
                    const spread = this.distances(
                        [adjusted.a, adjusted.b],
                        adjusted.road.input.kind,
                        Math.max(this.settings.rampLength, (needed * 1.5) / this.settings.maxGrade),
                    );
                    for (const [node, distance] of spread)
                        node.height +=
                            sign *
                            needed *
                            (1 -
                                smooth(
                                    distance /
                                        Math.max(
                                            this.settings.rampLength,
                                            (needed * 1.5) / this.settings.maxGrade,
                                        ),
                                ));
                }
            }
    }

    /**
     * Propagates structure height corrections through connected links to constrain longitudinal grades.
     *
     * @param kind - Road structure or sound variant, as indicated by its type.
     */
    private limitGrades(kind: "bridge" | "tunnel" | "all"): void {
        const queue = [...this.nodes.values()].filter((node) =>
            kind === "all"
                ? node.kinds.has("bridge") || node.kinds.has("tunnel")
                : node.kinds.has(kind),
        );
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i];
            for (const link of node.links) {
                if (kind === "all" ? link.kind === "ground" : link.kind !== kind) continue;
                const limit = link.length * this.settings.maxGrade;
                if (kind === "bridge" && node.height - link.node.height > limit + 0.000001) {
                    link.node.height = node.height - limit;
                    queue.push(link.node);
                } else if (kind !== "bridge" && link.node.height - node.height > limit + 0.000001) {
                    link.node.height = node.height + limit;
                    queue.push(link.node);
                }
            }
        }
    }

    /** Engineers short surface approaches as connected road profiles instead of terrain drapes.
     * Reduces steep elevation-sample bumps near tunnel portals without moving bridge decks
     * or explicit road-height overrides. Corrections lower high samples rather than invent hills.
     */
    private smoothTunnelApproaches(): void {
        const portals = [...this.nodes.values()].filter(
            (node) => node.kinds.has("ground") && node.kinds.has("tunnel"),
        );
        if (!portals.length) return;
        const reach = this.settings.tunnelRampLength * 2;
        const nearby = this.distances(portals, "ground", reach);
        const protectedNodes = new Set<Node>();
        for (const profile of this.profiles) {
            const override = this.settings.overrides[profile.input.id];
            if (
                profile.input.kind === "bridge" ||
                (override &&
                    [override.startHeight, override.endHeight, override.heightOffset].some(
                        Number.isFinite,
                    ))
            )
                for (const node of profile.nodes) protectedNodes.add(node);
        }
        const eligible = new Set([...nearby.keys()].filter((node) => !protectedNodes.has(node)));
        // Keep the outer boundary tied to its existing surface profile.
        const boundary = new Set(
            [...eligible].filter((node) =>
                node.links.some((link) => link.kind === "ground" && !eligible.has(link.node)),
            ),
        );
        const queue = [...eligible];
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i]!;
            for (const link of node.links) {
                if (link.kind !== "ground" || !eligible.has(link.node) || boundary.has(link.node))
                    continue;
                const maximum = node.height + link.length * this.settings.maxGrade;
                if (link.node.height > maximum + 1e-6) {
                    link.node.height = maximum;
                    queue.push(link.node);
                }
            }
        }
        for (const node of eligible) node.engineeredApproach = true;
    }

    /**
     * Blends bridge and tunnel endpoint offsets into adjacent ground-road approaches.
     */
    private blendApproaches(): void {
        const changes = new Map<Node, number>();
        for (const node of this.nodes.values()) {
            if (!node.kinds.has("ground") || node.kinds.size < 2) continue;
            const offset = node.height - node.ground;
            const length =
                node.kinds.has("tunnel") && !node.kinds.has("bridge")
                    ? this.settings.tunnelRampLength
                    : Math.max(
                          this.settings.rampLength,
                          (Math.abs(offset) * 1.5) / this.settings.maxGrade,
                      );
            for (const [neighbor, distance] of this.distances([node], "ground", length)) {
                if (neighbor.kinds.size > 1) continue;
                const change = offset * (1 - smooth(distance / length));
                if (Math.abs(change) > Math.abs(changes.get(neighbor) ?? 0))
                    changes.set(neighbor, change);
            }
        }
        for (const [node, offset] of changes) node.height = node.ground + offset;
    }
}
