import * as THREE from "three";
import type { GeoJSON } from "@/types";
import type { ElevationTerrain } from "./ElevationTerrain";
import type { RoadContact } from "./RoadProfiles";
import { CollisionWorld, SpatialGrid, closestPoint } from "./CollisionWorld";
import { RoadCorridors } from "./RoadCorridors";
import { buildRailPaths, railRoutes, RailPath, railRotation } from "./RailNetwork";
import type { RailwayConfig } from "./RailwayConfig";
import { railwayMaxSpeed } from "./RailwayConfig";
import { TrainModel, CARRIAGE_SPACING, CARRIAGE_HALF_LENGTH } from "./TrainModel";
import { TrainAudio } from "./TrainAudio";
import { tunnelSection, TUNNEL_THICKNESS } from "./TunnelSection";

interface RailSegment { a: THREE.Vector3; b: THREE.Vector3; path: RailPath }
interface Consist { route: RailPath; cars: THREE.Group[]; distance: number; velocity: number; direction: number; wait: number }
interface Batch { material: THREE.Material; matrices: THREE.Matrix4[] }

/** Owns chunked static tracks/bores and a bounded, separately updated fleet of trains. */
export class RailwayGenerator {
    readonly tracks = new THREE.Group();
    readonly trains = new THREE.Group();
    readonly corridors = new RoadCorridors();
    private grid = new SpatialGrid<RailSegment>();
    private paths: RailPath[] = [];
    private fleet: Consist[] = [];
    private model?: TrainModel;
    private audio?: TrainAudio;
    private config?: RailwayConfig;
    private lastTime?: number;
    private box = new THREE.BoxGeometry(1, 1, 1);
    private steel = new THREE.MeshStandardMaterial({ color: "#777c80", metalness: 0.8, roughness: 0.35 });
    private timber = new THREE.MeshStandardMaterial({ color: "#554739", roughness: 0.95 });
    private ballast = new THREE.MeshStandardMaterial({ color: "#696760", roughness: 1 });
    private lining = new THREE.MeshStandardMaterial({ color: "#777b7e", roughness: 0.95, side: THREE.DoubleSide });
    /** Registers two roots; only tracks are eligible for the static visibility index. */
    constructor(scene: THREE.Scene, private collisions: CollisionWorld) {
        this.tracks.name = "Railway tracks"; this.trains.name = "Moving trains";
        this.tracks.userData.cullDistance = 1400;
        scene.add(this.tracks, this.trains);
    }
    /** Generates a railway export in chunks, yielding between groups of ways to keep loading responsive. */
    async generate(data: GeoJSON, project: (lat: number, lon: number) => { x: number; z: number },
        terrain: ElevationTerrain | null, config: RailwayConfig,
        roadAt: (x: number, z: number, y: number) => RoadContact,
        progress: (message: string, detail?: string) => Promise<void>): Promise<void> {
        this.clear(); this.config = config;
        this.paths = buildRailPaths(data, project, terrain);
        const batches = new Map<string, Batch>(), shells = new Map<string, { path: RailPath; vertices: number[] }>();
        const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
        /** Queues a box instance, grouped spatially so an entire city's tracks never form one draw. */
        const box = (material: THREE.Material, centre: THREE.Vector3, scale: THREE.Vector3, direction: THREE.Vector3) => {
            const key = `${material.uuid}:${Math.floor(centre.x / 200)},${Math.floor(centre.z / 200)}`;
            if (!batches.has(key)) batches.set(key, { material, matrices: [] });
            dummy.position.copy(centre); railRotation(direction, dummy.quaternion); dummy.scale.copy(scale); dummy.updateMatrix();
            batches.get(key)!.matrices.push(dummy.matrix.clone());
        };
        for (let index = 0; index < this.paths.length; index++) {
            const path = this.paths[index];
            for (let i = 1; i < path.points.length; i++) {
                const a = path.points[i - 1], b = path.points[i], direction = b.clone().sub(a).normalize();
                const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
                const midpoint = a.clone().add(b).multiplyScalar(0.5), length = a.distanceTo(b);
                const segment = { a, b, path };
                this.grid.insert(segment, Math.min(a.x, b.x) - 3, Math.min(a.z, b.z) - 3, Math.max(a.x, b.x) + 3, Math.max(a.z, b.z) + 3);
                const crossing = roadAt(midpoint.x, midpoint.z, midpoint.y + 0.4);
                const atRoad = !!crossing.roadId && Math.abs(crossing.height - midpoint.y) < 0.4;
                box(this.ballast, midpoint.clone().addScaledVector(up, -0.09), new THREE.Vector3(path.gauge + 1.8, 0.16, length + 0.02), direction);
                for (const side of [-1, 1]) box(this.steel, midpoint.clone().addScaledVector(normal, side * path.gauge / 2).addScaledVector(up, 0.1), new THREE.Vector3(0.07, 0.16, length + 0.015), direction);
                // Level crossings have flush embedded rails, without sleepers protruding through the tarmac.
                if (!atRoad) {
                    const count = Math.max(1, Math.ceil(length / 1.2));
                    for (let j = 0; j < count; j++) box(this.timber, a.clone().lerp(b, (j + 0.5) / count), new THREE.Vector3(path.gauge + 0.65, 0.12, 0.22), direction);
                }
                if (path.kind === "ground" && !atRoad) {
                    // Close the sides of open cuttings instead of leaving see-through terrain edges.
                    for (const side of [-1, 1]) {
                        const edge = midpoint.clone().addScaledVector(normal, side * (path.gauge / 2 + 0.9));
                        const top = terrain?.sample(edge.x, edge.z).height ?? edge.y;
                        const height = top - midpoint.y;
                        if (height > 0.15) {
                            box(this.lining, edge.clone().setY(midpoint.y + height / 2 - 0.08), new THREE.Vector3(0.12, height + 0.16, length + 0.04), direction.clone().setY(0).normalize());
                            const n = normal.clone().multiplyScalar(side), ring = [a.clone().addScaledVector(n, path.gauge / 2 + 0.9), b.clone().addScaledVector(n, path.gauge / 2 + 0.9), b.clone().addScaledVector(n, path.gauge / 2 + 1.02), a.clone().addScaledVector(n, path.gauge / 2 + 1.02)];
                            this.collisions.addPolygon([ring], Math.min(a.y, b.y), top, "road", path.id);
                        }
                    }
                }
                if (path.kind === "bridge") {
                    box(this.ballast, midpoint.clone().addScaledVector(up, -0.35), new THREE.Vector3(path.gauge + 1.8, 0.4, length), direction);
                    if (i % 5 === 0) {
                        const floor = terrain?.sample(midpoint.x, midpoint.z).height ?? 0;
                        const h = midpoint.y - 0.55 - floor;
                        if (h > 0.6) {
                            box(this.lining, new THREE.Vector3(midpoint.x, floor + h / 2, midpoint.z), new THREE.Vector3(0.65, h, 1), direction.clone().setY(0).normalize());
                            const ring = [{ x: midpoint.x - 0.4, z: midpoint.z - 0.5 }, { x: midpoint.x + 0.4, z: midpoint.z - 0.5 }, { x: midpoint.x + 0.4, z: midpoint.z + 0.5 }, { x: midpoint.x - 0.4, z: midpoint.z + 0.5 }];
                            this.collisions.addPolygon([ring], floor, floor + h, "road", path.id, true);
                        }
                    }
                }
                if (path.kind === "tunnel") {
                    box(this.lining, midpoint.clone().addScaledVector(up, -0.24), new THREE.Vector3(6, 0.16, length + 0.04), direction);
                    const key = `${path.id}:${Math.floor(midpoint.x / 200)},${Math.floor(midpoint.z / 200)}`;
                    if (!shells.has(key)) shells.set(key, { path, vertices: [] });
                    const vertices = shells.get(key)!.vertices;
                    const inner = tunnelSection(3, 3, path.headroom), outer = tunnelSection(3, 3, path.headroom, TUNNEL_THICKNESS);
                    /** Converts an arch coordinate to a point along this track segment. */
                    const vertex = (p: THREE.Vector3, q: { u: number; h: number }) => p.clone().addScaledVector(normal, q.u).addScaledVector(up, q.h);
                    /** Emits a solid-shell quad with consistent triangle topology. */
                    const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => { for (const v of [p, q, r, p, r, s]) vertices.push(v.x, v.y, v.z); };
                    for (let j = 1; j < inner.length; j++) {
                        quad(vertex(a, inner[j - 1]), vertex(b, inner[j - 1]), vertex(b, inner[j]), vertex(a, inner[j]));
                        quad(vertex(a, outer[j]), vertex(b, outer[j]), vertex(b, outer[j - 1]), vertex(a, outer[j - 1]));
                        if (i === 1) quad(vertex(a, inner[j]), vertex(a, outer[j]), vertex(a, outer[j - 1]), vertex(a, inner[j - 1]));
                        if (i === path.points.length - 1) quad(vertex(b, inner[j - 1]), vertex(b, outer[j - 1]), vertex(b, outer[j]), vertex(b, inner[j]));
                    }
                    for (const side of [-1, 1]) {
                        const n = normal.clone().multiplyScalar(side);
                        const ring = [a.clone().addScaledVector(n, 3), b.clone().addScaledVector(n, 3), b.clone().addScaledVector(n, 3.45), a.clone().addScaledVector(n, 3.45)];
                        this.collisions.addPolygon([ring], Math.min(a.y, b.y), Math.max(a.y, b.y) + path.headroom, "road", path.id, true);
                    }
                }
            }
            if (index % 64 === 63) await progress("Generating railways", `${index + 1} / ${this.paths.length} track sections`);
        }
        for (const { material, matrices } of batches.values()) {
            const mesh = new THREE.InstancedMesh(this.box, material, matrices.length);
            matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
            mesh.computeBoundingSphere(); mesh.receiveShadow = true; this.tracks.add(mesh);
        }
        this.corridors.build(this.paths.map(path => ({
            curve: path.curve, input: path.input,
            headroom: path.kind === "ground" ? 1000 : path.headroom,
            halfWidthAt: () => path.kind === "ground" ? path.gauge / 2 + 0.9 : 3,
            setGenerationCaching: () => {},
        })));
        for (const { path, vertices } of shells.values()) {
            const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
            this.corridors.cut(geometry, path.id);
            const mesh = new THREE.Mesh(geometry, this.lining); mesh.receiveShadow = true; this.tracks.add(mesh);
        }
        await progress("Preparing trains");
        const carriages = THREE.MathUtils.clamp(Math.round(config.carriages ?? 3), 2, 5);
        const routes = railRoutes(this.paths).filter(route => route.length > carriages * CARRIAGE_SPACING + 70)
            .sort((a, b) => (b.length * 0.25 + b.surfaceLength) - (a.length * 0.25 + a.surfaceLength));
        const limit = THREE.MathUtils.clamp(Math.round(config.trains ?? 3), 0, 6);
        const selected: RailPath[] = [];
        // Represent both mainline and metro services when available, favouring routes visible above ground.
        for (const railway of ["rail", "subway"]) {
            const route = routes.find(route => route.railway === railway);
            if (route && selected.length < limit) selected.push(route);
        }
        for (const route of routes) if (!selected.includes(route) && selected.length < limit) selected.push(route);
        if (selected.length) {
            this.model = new TrainModel(config); this.audio = new TrainAudio();
            for (const [index, route] of selected.entries()) {
                const cars = Array.from({ length: carriages }, (_, i) => this.model!.createCarriage(route.gauge, i === 0 || i === carriages - 1));
                cars.forEach(car => this.trains.add(car));
                const extent = (carriages - 1) * CARRIAGE_SPACING / 2 + CARRIAGE_HALF_LENGTH;
                this.fleet.push({ route, cars, distance: THREE.MathUtils.lerp(extent, route.length - extent, (index + 1) / (selected.length + 1)), velocity: 0, direction: index % 2 ? -1 : 1, wait: 0 });
            }
            this.placeTrains();
        }
    }
    /** Cuts open surface track beds and subtracts arched bores only where terrain enters them. */
    cutTerrain(geometry: THREE.BufferGeometry): void { this.corridors.cut(geometry, undefined, false, false); }
    /** Samples a passable physical track floor and arched ceiling without attracting cars from other levels. */
    contact(x: number, z: number, y: number, road: RoadContact): RoadContact {
        let result = road, best = Infinity;
        for (const { a, b, path } of this.grid.at(x, z)) {
            const p = closestPoint({ x, z }, a, b), distance = Math.hypot(x - p.x, z - p.z);
            if (distance > (path.kind === "tunnel" ? 3 : path.gauge / 2 + 0.9)) continue;
            const length = Math.hypot(b.x - a.x, b.z - a.z), t = length ? Math.hypot(p.x - a.x, p.z - a.z) / length : 0;
            const base = THREE.MathUtils.lerp(a.y, b.y, t);
            if (road.roadId && Math.abs(road.height - base) < 0.4) continue; // Drive through a level crossing normally.
            if (path.kind === "ground") {
                if (y < base - 1.1 || road.roadId) continue;
            } else if (path.kind === "tunnel" ? y < base - 1.1 || y > base + path.headroom - 0.4 : Math.abs(y - 0.4 - base) > 1.5) continue;
            const score = Math.abs(y - 0.4 - base) * 4 + distance;
            if (score >= best) continue;
            best = score;
            const height = base + (Math.abs(distance - path.gauge / 2) < 0.13 ? 0.18 : distance <= path.gauge / 2 + 0.9 ? 0.06 : -0.16);
            const dx = b.x - a.x, dz = b.z - a.z, rise = b.y - a.y;
            const ceiling = path.kind === "tunnel" ? base + 1.8 + 4.6 * Math.sqrt(Math.max(0, 1 - (distance / 3) ** 2)) : undefined;
            result = { height, roadId: path.id, slopeX: rise * dx / (length * length || 1), slopeZ: rise * dz / (length * length || 1), surface: "gravel", grip: 0.85, structure: path.kind, ceiling };
        }
        return result;
    }
    /** Places each carriage independently along the route, including pitch and yaw on curves/slopes. */
    private placeTrains(): void {
        for (const train of this.fleet) for (let i = 0; i < train.cars.length; i++) {
            const distance = train.distance + ((train.cars.length - 1) / 2 - i) * CARRIAGE_SPACING;
            const car = train.cars[i], front = train.route.at(distance + 3.45), rear = train.route.at(distance - 3.45);
            car.position.copy(front).add(rear).multiplyScalar(0.5);
            railRotation(front.sub(rear), car.quaternion);
            if (i === train.cars.length - 1) car.rotateY(Math.PI);
        }
    }
    /** Advances a bounded fleet; pauses silence sound and never accrue catch-up time. */
    update(time: number, listener: THREE.Vector3 | undefined, enabled: boolean, effectsVolume: number): void {
        const dt = enabled && this.lastTime !== undefined ? Math.min(0.1, Math.max(0, time - this.lastTime)) : 0;
        this.lastTime = time;
        let level = 0;
        for (const train of this.fleet) {
            const extent = (train.cars.length - 1) * CARRIAGE_SPACING / 2 + CARRIAGE_HALF_LENGTH;
            const remaining = train.direction > 0 ? train.route.length - extent - train.distance : train.distance - extent;
            if (train.wait > 0) { train.wait = Math.max(0, train.wait - dt); train.velocity = 0; if (!train.wait) train.direction *= -1; }
            else {
                const target = Math.min(railwayMaxSpeed(this.config), Math.sqrt(Math.max(0, 2 * 0.8 * remaining)));
                train.velocity = THREE.MathUtils.damp(train.velocity, target, 0.65, dt);
                const step = Math.min(Math.max(0, remaining), train.velocity * dt);
                train.distance += step * train.direction;
                if (remaining - step <= 0.05) { train.wait = Math.max(1, this.config?.turnaroundSeconds ?? 15); train.velocity = 0; }
            }
        }
        this.placeTrains();
        for (const train of this.fleet) for (const car of train.cars) {
            car.visible = !listener || car.position.distanceToSquared(listener) < 1600 ** 2;
            if (listener && enabled) {
                const distance = car.position.distanceTo(listener);
                level = Math.max(level, Math.max(0, 1 - distance / 85) ** 2 * Math.min(1, train.velocity / 10) * 0.3);
            }
        }
        this.audio?.update(level * effectsVolume);
    }
    /** Releases per-map state while retaining the reusable track primitives. */
    clear(): void {
        this.audio?.dispose(); this.audio = undefined; this.model?.dispose(); this.model = undefined;
        this.tracks.traverse(o => {
            if (o instanceof THREE.InstancedMesh) o.dispose();
            if (o instanceof THREE.Mesh && o.geometry !== this.box) o.geometry.dispose();
        });
        this.tracks.clear(); this.trains.clear(); this.corridors.clear(); this.grid.clear(); this.paths = []; this.fleet = []; this.lastTime = undefined;
    }
    /** Removes owned scene roots and releases all GPU/audio resources. */
    dispose(): void {
        this.clear(); this.tracks.removeFromParent(); this.trains.removeFromParent();
        this.box.dispose(); for (const material of [this.steel, this.timber, this.ballast, this.lining]) material.dispose();
    }
}
