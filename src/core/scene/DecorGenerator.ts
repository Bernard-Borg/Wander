import { osmDirection } from "./OsmValues";
import { addMoaiParts } from "./Moai";
/**
 * DecorGenerator types and implementation for the city driving simulator.
 * @packageDocumentation
 */

import * as THREE from "three";
import type { GeoJSON, GeoJSONFeature } from "@/types";
import { CollisionWorld, type Point } from "./CollisionWorld";
import { TrafficSigns } from "./TrafficSigns";
import { BusStopSigns } from "./BusStopSigns";

type Shape = "box" | "cylinder" | "sphere" | "cone";
/** Simple, recognizable street furniture, instanced by primitive/material and 200 m cell. */
export class DecorGenerator {
    private night = false;
    private lampPositions: THREE.Vector3[] = [];
    private lampLights: THREE.PointLight[] = [];
    private lastLightUpdate = -Infinity;
    private readonly lampColor = 0xffedc2;
    private group = new THREE.Group();
    private trafficSigns = new TrafficSigns();
    private busStops = new BusStopSigns();
    private geometries: Record<Shape, THREE.BufferGeometry> = {
        box: new THREE.BoxGeometry(1, 1, 1),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
        sphere: new THREE.SphereGeometry(0.5, 8, 6),
        cone: new THREE.ConeGeometry(0.5, 1, 8),
    };
    private materials = new Map<number, THREE.MeshStandardMaterial>();
    private batches = new Map<string, { shape: Shape; color: number; matrices: THREE.Matrix4[] }>();
    /**
     * Initializes instance state and owned resources using the supplied dependencies.
     *
     * @param scene - Scene receiving generated objects; ownership remains with the caller.
     * @param collisions - Shared collision world receiving generated obstacles.
     */
    constructor(
        private scene: THREE.Scene,
        private collisions: CollisionWorld,
    ) {
        // Keep a fixed light count: changing it recompiles every lit scene material.
        for (let i = 0; i < 8; i++) {
            const light = new THREE.PointLight(0xffdf9e, 0, 22, 2);
            light.name = "Nearby street lamp";
            light.castShadow = false;
            this.lampLights.push(light);
            scene.add(light);
        }
        this.group.userData.cullDistance = 500;
        this.busStops.group.userData.cullDistance = 150;
        this.group.name = "Street furniture";
        scene.add(this.group);
        scene.add(this.busStops.group);
        scene.add(this.trafficSigns.group);
    }
    /**
     * Generates the supported OSM features using the supplied coordinate and elevation samplers.
     *
     * @param data - OSM-derived GeoJSON collection.
     * @param project - Projection from latitude/longitude to local horizontal coordinates.
     * @param heightAt - Base-elevation sampler in local metres.
     * @param contains - Reports whether a local point is within the supported generation area.
     */
    generate(
        data: GeoJSON,
        project: (lat: number, lon: number) => Point,
        heightAt: (x: number, z: number, layer: number, wall: boolean) => number,
        contains: (x: number, z: number) => boolean,
        countryCode: string | readonly string[] = [],
    ): void {
        this.clear();
        let generated = 0;
        const metal = 0x454e52,
            wood = 0x9c714b,
            stone = 0xb8afa0,
            green = 0x46643c,
            blue = 0x3c779b;
        for (const feature of data.features) {
            const p = feature.properties,
                g = feature.geometry;
            // Underground hydrants have no above-ground body or collision obstacle.
            if (p.emergency === "fire_hydrant"
                && String(p["fire_hydrant:type"] ?? "").trim().toLowerCase() === "underground") continue;
            const isBusStop = p.highway === "bus_stop"
                || ((p.public_transport === "platform" || p.highway === "platform") && p.bus === "yes");
            // Keep bus-stop signs, but omit other platform outlines and amenities.
            if (!isBusStop && (p.highway === "platform" || p.public_transport === "platform"
                || p.railway === "platform" || p["construction:railway"] === "platform")) continue;
            const coords =
                g.type === "Point"
                    ? [g.coordinates]
                    : g.type === "LineString"
                      ? g.coordinates
                      : g.type === "Polygon"
                        ? g.coordinates[0]
                        : g.coordinates[0]?.[0];
            if (!coords?.length) continue;
            const points = coords.map(([lon, lat]) => project(lat, lon));
            const layer = Number(p.layer) || 0;
            /**
             * Resolves the current decor feature elevation, passing its layer and barrier classification to the sampler.
             *
             * @param pt - Local horizontal point at which to resolve the current feature base height.
             */
            const height = (pt: Point) =>
                heightAt(
                    pt.x,
                    pt.z,
                    layer,
                    ["wall", "retaining_wall", "fence", "guard_rail", "chain"].includes(
                        String(p.barrier),
                    ) || p.historic === "citywalls",
                );
            const platform = p.highway === "platform" || p.public_transport === "platform";
            const barrier = String(p.barrier ?? (p.historic === "citywalls" ? "wall" : ""));
            const linear =
                [
                    "wall",
                    "retaining_wall",
                    "hedge",
                    "fence",
                    "chain",
                    "guard_rail",
                    "kerb",
                ].includes(barrier) ||
                platform ||
                p.man_made === "embankment" ||
                p.man_made === "cutting";
            if (linear && !isBusStop && points.length > 1) {
                const h = this.dimension(
                    p.height,
                    platform
                        ? 0.1
                        : barrier === "kerb"
                          ? 0.12
                          : barrier === "guard_rail"
                            ? 0.8
                            : barrier === "hedge"
                              ? 1.5
                              : 1.8,
                    0.08,
                    12,
                );
                const width = this.dimension(
                    p.width,
                    platform ? 1.5 : barrier === "kerb" ? 0.18 : barrier === "hedge" ? 0.65 : 0.3,
                    0.08,
                    3,
                );
                let made = false;
                for (let i = 1; i < points.length; i++) {
                    const a = points[i - 1],
                        b = points[i],
                        distance = Math.hypot(b.x - a.x, b.z - a.z);
                    const steps = Math.ceil(distance / 3);
                    for (let j = 0; j < steps; j++) {
                        const t = j / steps,
                            u = (j + 1) / steps;
                        const start = {
                            x: a.x + (b.x - a.x) * t,
                            z: a.z + (b.z - a.z) * t,
                        };
                        const end = {
                            x: a.x + (b.x - a.x) * u,
                            z: a.z + (b.z - a.z) * u,
                        };
                        const mid = {
                            x: (start.x + end.x) / 2,
                            z: (start.z + end.z) / 2,
                        };
                        if (!contains(start.x, start.z) || !contains(end.x, end.z)) continue;
                        const ya = height(start),
                            yb = height(end),
                            length = Math.hypot(end.x - start.x, end.z - start.z);
                        const yaw = Math.atan2(end.x - start.x, end.z - start.z),
                            rail = ["fence", "chain", "guard_rail"].includes(barrier);
                        const y = (ya + yb) / 2;
                        this.part(
                            "box",
                            rail ? metal : barrier === "hedge" ? green : stone,
                            mid.x,
                            y + (rail ? h * 0.7 : h / 2),
                            mid.z,
                            width,
                            rail ? 0.12 : h,
                            Math.hypot(length, yb - ya),
                            yaw,
                            -Math.atan2(yb - ya, length),
                        );
                        if (rail)
                            this.part(
                                "cylinder",
                                metal,
                                start.x,
                                ya + h / 2,
                                start.z,
                                0.09,
                                h,
                                0.09,
                            );
                        if (barrier !== "kerb" && !platform) {
                            const nx = (Math.cos(yaw) * width) / 2,
                                nz = (-Math.sin(yaw) * width) / 2;
                            this.collisions.addPolygon(
                                [
                                    [
                                        { x: start.x + nx, z: start.z + nz },
                                        { x: end.x + nx, z: end.z + nz },
                                        { x: end.x - nx, z: end.z - nz },
                                        { x: start.x - nx, z: start.z - nz },
                                    ],
                                ],
                                Math.min(ya, yb),
                                Math.max(ya, yb) + h,
                            );
                        }
                        made = true;
                    }
                }
                if (made) generated++;
                continue;
            }
            // Polygons use their footprint centroid, not the first corner; line platforms use a midpoint.
            const unique = g.type === "Polygon" && points.length > 1 ? points.slice(0, -1) : points;
            const pt =
                g.type === "Point"
                    ? points[0]
                    : {
                          x: unique.reduce((v, q) => v + q.x, 0) / unique.length,
                          z: unique.reduce((v, q) => v + q.z, 0) / unique.length,
                      };
            if (!contains(pt.x, pt.z)) continue;
            const y = height(pt),
                direction = osmDirection(p.direction),
                yaw = direction === undefined ? 0 : Math.PI - (direction * Math.PI) / 180;
            /**
             * Registers an item or generated feature with this instance using the supplied geometry and metadata.
             *
             * @param shape - Primitive kind or vehicle collision dimensions, as indicated by its type.
             * @param color - Primitive material colour.
             * @param x - Local eastward coordinate in metres.
             * @param up - Vertical offset in the current feature frame.
             * @param z - Local southward coordinate in metres.
             * @param sx - Primitive width scale.
             * @param sy - Primitive height scale.
             * @param sz - Primitive depth scale.
             */
            const add = (
                shape: Shape,
                color: number,
                x: number,
                up: number,
                z: number,
                sx: number,
                sy: number,
                sz: number,
            ) => {
                this.part(
                    shape,
                    color,
                    pt.x + x * Math.cos(yaw) + z * Math.sin(yaw),
                    y + up,
                    pt.z - x * Math.sin(yaw) + z * Math.cos(yaw),
                    sx,
                    sy,
                    sz,
                    yaw,
                );
            };
            /**
             * Adds a vertical post in the current decor feature frame.
             *
             * @param h - Post height in metres.
             */
            const post = (h = 2.4) => add("cylinder", metal, 0, h / 2, 0, 0.075, h, 0.075);
            let radius = 0.2,
                solid = true,
                collisionOffset = 0;
            const amenity = String(p.amenity ?? ""),
                man = String(p.man_made ?? "");
            if (amenity === "bench") {
                add("box", wood, 0, 0.48, 0, 1.8, 0.12, 0.5);
                add("box", wood, 0, 0.85, 0.22, 1.8, 0.55, 0.09);
                for (const x of [-0.65, 0.65]) add("box", metal, x, 0.22, 0, 0.08, 0.44, 0.4);
                radius = 0.7;
            } else if (["waste_basket", "recycling", "grit_bin"].includes(amenity)) {
                const scale = amenity === "recycling" ? 1.5 : 1;
                add(
                    "cylinder",
                    amenity === "recycling" ? green : metal,
                    0,
                    0.4 * scale,
                    0,
                    0.48 * scale,
                    0.8 * scale,
                    0.48 * scale,
                );
                add("cylinder", 0x242b2c, 0, 0.82 * scale, 0, 0.52 * scale, 0.08, 0.52 * scale);
                radius = 0.3 * scale;
            } else if (man === "surveillance") {
                const bearing = osmDirection(p["camera:direction"]) ?? osmDirection(p["camera:angle"]);
                if (bearing === undefined) continue;
                const cameraYaw = Math.PI - bearing * Math.PI / 180;
                const cameraHeight = this.dimension(p.height, 3, 1, 12);
                post(cameraHeight);
                this.part("box", stone, pt.x, y + cameraHeight, pt.z, 0.22, 0.2, 0.48, cameraYaw);
                this.part("cylinder", 0x14232c, pt.x + Math.sin(cameraYaw) * 0.25,
                    y + cameraHeight, pt.z + Math.cos(cameraYaw) * 0.25,
                    0.12, 0.06, 0.12, cameraYaw, Math.PI / 2);
            } else if (p.highway === "street_lamp" || man === "utility_pole") {
                const h = this.dimension(p.height, 6, 2, 18);
                post(h);
                add("box", metal, 0, h, 0.5, 0.12, 0.12, 1.1);
                add(
                    "box",
                    p.highway === "street_lamp" ? this.lampColor : 0xf2e2b5,
                    0,
                    h - 0.1,
                    1,
                    0.35,
                    0.16,
                    0.65,
                );
                if (p.highway === "street_lamp")
                    this.lampPositions.push(new THREE.Vector3(pt.x + Math.sin(yaw), y + h - 0.25, pt.z + Math.cos(yaw)));
            } else if (isBusStop) {
                post(2.7);
                add("box", metal, 0, 2.35, 0, 1.45, 0.75, 0.12);
                this.busStops.add(p, pt.x, y, pt.z, yaw);
            } else if (p.traffic_sign) {
                if (g.type !== "Point") continue;
                const signDirection = osmDirection(p["traffic_sign:direction"]) ?? osmDirection(p.direction);
                const facing = signDirection === undefined ? yaw : Math.PI - signDirection * Math.PI / 180;
                const count = this.trafficSigns.add(p, countryCode, pt.x, y, pt.z, facing);
                if (!count) continue;
                const poleHeight = 2.6 + (count - 1) * 0.85;
                // Keep the 7.5 cm pole behind the panel, using its actual facing.
                this.part("cylinder", metal, pt.x - Math.sin(facing) * 0.065,
                    y + poleHeight / 2, pt.z - Math.cos(facing) * 0.065,
                    0.075, poleHeight, 0.075);
                radius = 0.08;
            } else if (amenity === "clock") {
                post();
                const board = false;
                add("box", stone, 0, 2, 0, board ? 1.3 : 0.48, board ? 1 : 0.6, 0.1);
                add(
                    "box",
                    p.traffic_sign ? 0xa44237 : blue,
                    0,
                    2,
                    -0.06,
                    board ? 1.15 : 0.38,
                    board ? 0.84 : 0.48,
                    0.015,
                );
            } else if (amenity === "shelter") {
                for (const x of [-1.3, 1.3])
                    for (const z of [-0.6, 0.6]) add("cylinder", metal, x, 1.2, z, 0.09, 2.4, 0.09);
                add("box", metal, 0, 2.45, 0, 3, 0.16, 1.6);
                solid = false;
            } else if (amenity === "bicycle_parking" || barrier === "cycle_barrier") {
                for (const x of [-0.6, 0, 0.6]) {
                    add("box", metal, x, 0.75, 0, 0.06, 0.06, 1.1);
                    for (const z of [-0.5, 0.5])
                        add("cylinder", metal, x, 0.38, z, 0.06, 0.76, 0.06);
                }
                radius = 0.55;
            } else if (amenity === "fountain") {
                add("cylinder", stone, 0, 0.2, 0, 2.2, 0.4, 2.2);
                add("cylinder", blue, 0, 0.42, 0, 1.95, 0.025, 1.95);
                add("cone", 0xb6dce1, 0, 0.9, 0, 0.22, 1, 0.22);
                radius = 1.1;
            } else if (
                ["drinking_water", "post_box", "telephone", "parking_meter"].includes(amenity) ||
                man === "water_tap" ||
                p.emergency === "fire_hydrant"
            ) {
                const hydrant = p.emergency === "fire_hydrant";
                add(
                    hydrant ? "cylinder" : "box",
                    hydrant || amenity === "post_box" ? 0xad4033 : metal,
                    0,
                    0.55,
                    0,
                    0.4,
                    1.1,
                    0.35,
                );
                if (hydrant || amenity === "drinking_water" || man === "water_tap")
                    add("box", stone, 0, 0.85, -0.2, 0.5, 0.12, 0.3);
            } else if (man === "flagpole") {
                const h = this.dimension(p.height, 7, 3, 40);
                post(h);
                add("box", 0xbe5650, 0.65, h - 0.6, 0, 1.3, 0.8, 0.025);
            } else if (p.artwork_type === "statue" || p.artwork_type === "sculpture"
                || p.memorial === "statue" || p.historic === "statue") {
                const scale = this.dimension(p.height, 2.8, 1, 8) / 2.8;
                /** Adds one stone feature in normalized moai coordinates.
                 * @param color - Stone colour for this feature.
                 * @param x - Horizontal offset relative to the statue centre.
                 * @param up - Height above the statue base.
                 * @param z - Depth offset; the face points toward positive local Z.
                 * @param sx - Feature width before height scaling.
                 * @param sy - Feature height before height scaling.
                 * @param sz - Feature depth before height scaling.
                 */
                const stonePart = (color: number, x: number, up: number, z: number, sx: number, sy: number, sz: number): void => {
                    add("box", color, x * scale, up * scale, z * scale, sx * scale, sy * scale, sz * scale);
                };
                addMoaiParts(stonePart, stone);
                radius = 0.58 * scale;
            } else if (p.historic) {
                add("box", stone, 0, 0.3, 0, 1, 0.6, 1);
                add(
                    "box",
                    stone,
                    0,
                    1.25,
                    0,
                    0.7,
                    1.3,
                    0.7,
                );
                radius = 0.5;
            } else if (
                [
                    "bollard",
                    "block",
                    "stone",
                    "jersey_barrier",
                    "gate",
                    "lift_gate",
                    "swing_gate",
                    "turnstile",
                ].includes(barrier)
            ) {
                const gate = ["gate", "lift_gate", "swing_gate"].includes(barrier);
                collisionOffset = gate ? 2 : 0;
                add(
                    "cylinder",
                    barrier === "bollard" ? metal : stone,
                    collisionOffset,
                    0.45,
                    0,
                    0.28,
                    0.9,
                    0.28,
                );
                if (gate) add("box", 0xdfd6bc, collisionOffset, 1.6, 0, 0.12, 2.3, 0.12); // Open boom: never invent a closed road.
                if (barrier === "jersey_barrier") add("box", stone, 0, 0.4, 0, 1.8, 0.8, 0.5);
            } else if (p.natural === "shrub") {
                add("sphere", green, 0, 0.5, 0, 1.3, 1, 1.3);
                solid = false;
            } else continue;
            if (solid)
                this.collisions.addTrunk(
                    {
                        x: pt.x + collisionOffset * Math.cos(yaw),
                        z: pt.z - collisionOffset * Math.sin(yaw),
                    },
                    radius,
                    y,
                );
            generated++;
        }
        for (const batch of this.batches.values()) {
            let material = this.materials.get(batch.color);
            if (!material) {
                material = new THREE.MeshStandardMaterial({
                    color: batch.color,
                    roughness: 0.85,
                    emissive: batch.color === this.lampColor ? this.lampColor : 0x000000,
                    emissiveIntensity: batch.color === this.lampColor && this.night ? 3 : 0,
                });
                this.materials.set(batch.color, material);
            }
            const mesh = new THREE.InstancedMesh(
                this.geometries[batch.shape],
                material,
                batch.matrices.length,
            );
            batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
            mesh.computeBoundingSphere();
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
        }
        this.batches.clear();
        console.log(
            `Generated ${generated} decor features in ${this.group.children.length} spatial batches`,
        );
    }
    /**
     * Parses a tagged dimension and clamps it to generation bounds, using a fallback for invalid values.
     *
     * @param value - Input value to normalize, clamp or parse.
     * @param fallback - Value used for missing or invalid input.
     * @param min - Inclusive lower bound.
     * @param max - Inclusive upper bound.
     */
    private dimension(
        value: GeoJSONFeature["properties"][string],
        fallback: number,
        min: number,
        max: number,
    ): number {
        const parsed = parseFloat(String(value));
        return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    }
    /**
     * Appends a scaled and rotated primitive transform to its material and spatial batch.
     *
     * @param shape - Primitive kind or vehicle collision dimensions, as indicated by its type.
     * @param color - Primitive material colour.
     * @param x - Local eastward coordinate in metres.
     * @param y - Local elevation in metres.
     * @param z - Local southward coordinate in metres.
     * @param sx - Primitive width scale.
     * @param sy - Primitive height scale.
     * @param sz - Primitive depth scale.
     * @param yaw - Horizontal rotation in radians.
     * @param pitch - Vertical rotation in radians.
     */
    private part(
        shape: Shape,
        color: number,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        yaw = 0,
        pitch = 0,
    ): void {
        const key = `${Math.floor(x / 200)},${Math.floor(z / 200)},${shape},${color}`;
        let batch = this.batches.get(key);
        if (!batch) {
            batch = { shape, color, matrices: [] };
            this.batches.set(key, batch);
        }
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        batch.matrices.push(
            new THREE.Matrix4().compose(
                new THREE.Vector3(x, y, z),
                rotation,
                new THREE.Vector3(sx, sy, sz),
            ),
        );
    }
    /**
     * Clears generated content and cached lookup data so the instance can be reused.
     */
    /** Switches lamp lenses and nearby illumination with the sky preset. */
    setNight(enabled: boolean): void {
        this.night = enabled;
        const material = this.materials.get(this.lampColor);
        if (material) material.emissiveIntensity = enabled ? 3 : 0;
        this.lastLightUpdate = -Infinity;
        for (const light of this.lampLights) light.intensity = 0;
    }

    /** Assigns a bounded pool of shadowless lights to the nearest lamps at four Hz. */
    updateLights(position: THREE.Vector3, seconds: number): void {
        if (!this.night || seconds - this.lastLightUpdate < 0.25) return;
        this.lastLightUpdate = seconds;
        const nearest: Array<{ position: THREE.Vector3; distance: number }> = [];
        for (const lamp of this.lampPositions) {
            const distance = lamp.distanceToSquared(position);
            if (distance > 90 * 90) continue;
            let index = nearest.findIndex(candidate => distance < candidate.distance);
            if (index < 0) index = nearest.length;
            if (index < this.lampLights.length) {
                nearest.splice(index, 0, { position: lamp, distance });
                if (nearest.length > this.lampLights.length) nearest.pop();
            }
        }
        this.lampLights.forEach((light, index) => {
            const lamp = nearest[index];
            light.intensity = lamp ? 180 : 0;
            if (lamp) light.position.copy(lamp.position);
        });
    }

    /** Clears generated furniture and turns off the reusable lamp lights. */
    clear(): void {
        this.lampPositions = [];
        this.lastLightUpdate = -Infinity;
        for (const light of this.lampLights) light.intensity = 0;
        this.busStops.clear();
        this.trafficSigns.clear();
        for (const child of this.group.children) (child as THREE.InstancedMesh).dispose();
        this.group.clear();
        this.batches.clear();
    }
    /**
     * Releases owned resources and unregisters scene objects, browser listeners or audio nodes as applicable.
     */
    dispose(): void {
        this.clear();
        for (const light of this.lampLights) { this.scene.remove(light); light.dispose(); }
        this.lampLights = [];
        this.trafficSigns.dispose();
        this.scene.remove(this.trafficSigns.group);
        this.busStops.dispose();
        this.scene.remove(this.busStops.group);
        Object.values(this.geometries).forEach((g) => g.dispose());
        this.materials.forEach((m) => m.dispose());
        this.scene.remove(this.group);
    }
}
