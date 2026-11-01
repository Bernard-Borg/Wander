import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RailwayConfig } from "./RailwayConfig";

/** Centre spacing leaves a 25 cm gap between the straight 12.2 m carriage bodies. */
export const CARRIAGE_SPACING = 12.45;
/** Longest half-envelope, including the outward nose and couplers. */
export const CARRIAGE_HALF_LENGTH = 6.8;

/** Shared procedural cab/trailer geometry, with glazed openings and rounded modern roofs. */
export class TrainModel {
    readonly prototype = new THREE.Group();
    private geometries: THREE.BufferGeometry[] = [];
    private materials: THREE.Material[] = [];
    private logo?: THREE.Texture;
    private disposed = false;
    private trailer?: TrainModel;

    /** Builds a single outward cab (+Z) or a straight-ended trailer using the city livery. */
    constructor(config: RailwayConfig, cab = true) {
        const modern = config.style === "modern", tapered = modern && cab;
        const body = new THREE.MeshStandardMaterial({ color: config.primary, roughness: 0.43, metalness: 0.35, side: THREE.DoubleSide });
        const accent = new THREE.MeshStandardMaterial({ color: config.accent, roughness: 0.5, metalness: 0.22, side: THREE.DoubleSide });
        const under = new THREE.MeshStandardMaterial({ color: "#272d32", roughness: 0.8, side: THREE.DoubleSide });
        const inside = new THREE.MeshStandardMaterial({ color: "#aaa59a", roughness: 0.9, side: THREE.DoubleSide });
        const glass = new THREE.MeshStandardMaterial({ color: "#87b2bf", transparent: true, opacity: 0.3, roughness: 0.12, metalness: 0.15, depthWrite: false, side: THREE.DoubleSide });
        this.materials.push(body, accent, under, inside, glass);
        const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
        /** Adds a translated primitive to its shared material batch. */
        const part = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
            g.translate(x, y, z);
            if (!batches.has(material)) batches.set(material, []);
            batches.get(material)!.push(g);
        };
        /** Adds a box primitive without creating a separate render object. */
        const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => part(new THREE.BoxGeometry(w, h, d), m, x, y, z);
        /** Adds a quad, optionally retaining analytic vertex normals for smooth roof lighting. */
        const quad = (m: THREE.Material, vertices: THREE.Vector3[], normals?: THREE.Vector3[]) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flatMap(v => v.toArray()), 3));
            g.setIndex([0, 1, 2, 0, 2, 3]);
            if (normals) g.setAttribute("normal", new THREE.Float32BufferAttribute(normals.flatMap(v => v.toArray()), 3));
            else g.computeVertexNormals();
            part(g, m);
        };
        const back = -6.1, front = tapered ? 4.7 : 6.1;
        const centre = (front + back) / 2, length = front - back;
        box(under, 0, 0.85, centre, 2.55, 0.5, length - 0.3);
        box(inside, 0, 1.18, centre, 2.7, 0.14, length);
        if (modern) {
            // A half-ellipse roof shell: smooth normal field, real thickness and closed end rims.
            const steps = 24;
            /** Samples the outer/inner roof shell at an angle and longitudinal endpoint. */
            const roof = (angle: number, z: number, inner = false) => new THREE.Vector3(1.42 * Math.cos(angle) * (inner ? 0.96 : 1), 3.3 + 0.55 * Math.sin(angle) - (inner ? 0.08 : 0), z);
            /** Analytic ellipse normal prevents visible lighting facets along the roof. */
            const normal = (angle: number) => new THREE.Vector3(Math.cos(angle) / 1.42, Math.sin(angle) / 0.55, 0).normalize();
            for (let i = 0; i < steps; i++) {
                const a = Math.PI * i / steps, b = Math.PI * (i + 1) / steps;
                quad(body, [roof(a, back), roof(a, front), roof(b, front), roof(b, back)], [normal(a), normal(a), normal(b), normal(b)]);
                quad(body, [roof(b, back, true), roof(b, front, true), roof(a, front, true), roof(a, back, true)], [normal(b).negate(), normal(b).negate(), normal(a).negate(), normal(a).negate()]);
                for (const z of [back, front]) quad(body, [roof(a, z), roof(b, z), roof(b, z, true), roof(a, z, true)]);
            }
        } else box(body, 0, 3.75, centre, 2.85, 0.2, length);
        for (const side of [-1, 1]) {
            box(body, side * 1.39, 1.65, centre, 0.1, 0.85, length);
            box(accent, side * 1.45, 2.1, centre, 0.035, 0.22, length);
            box(body, side * 1.39, modern ? 3.34 : 3.5, centre, 0.1, modern ? 0.1 : 0.35, length);
            const windows = Math.max(1, Math.floor(length / 1.8));
            const step = length / windows;
            for (let i = 0; i < windows; i++) {
                const z = back + step * (i + 0.5);
                box(body, side * 1.39, 2.75, z - step / 2, 0.11, modern ? 1.12 : 1.3, 0.12);
                box(glass, side * 1.395, 2.79, z, 0.02, 1.08, step - 0.14);
                box(accent, side * 0.87, 1.55, z, 0.65, 0.45, 0.6);
                box(accent, side * 1.02, 1.94, z - 0.25, 0.65, 0.65, 0.12);
            }
            for (const z of [back + 1.1, front - 1.1]) {
                box(accent, side * 1.455, 2.3, z, 0.04, 2, 0.75);
                box(glass, side * 1.48, 2.8, z, 0.02, 0.8, 0.5);
            }
        }
        if (tapered) {
            const sections = [{ z: 4.7, width: 1.4, roof: 3.85 }, { z: 5.2, width: 1.27, roof: 3.5 }, { z: 5.75, width: 0.99, roof: 2.6 }, { z: 6.3, width: 0.53, roof: 1.85 }, { z: 6.65, width: 0.08, roof: 1.45 }];
            /** Samples a cab section with a curved crown continuous with the carriage roof. */
            const ring = (s: typeof sections[number]) => {
                const points = [[-s.width, 1.4], [-s.width * 0.8, 1.02], [s.width * 0.8, 1.02], [s.width, 1.4], [s.width, s.roof - 0.55]];
                for (let i = 1; i <= 12; i++) { const angle = Math.PI * i / 12; points.push([s.width * Math.cos(angle), s.roof - 0.55 + 0.55 * Math.sin(angle)]); }
                return points.map(([x, y]) => new THREE.Vector3(x, y, s.z));
            };
            for (let i = 1; i < sections.length; i++) {
                const a = ring(sections[i - 1]), b = ring(sections[i]);
                for (let j = 0; j < a.length; j++) {
                    const next = (j + 1) % a.length;
                    const window = (i === 2 && j >= 6 && j <= 13) || (i === 1 && (j === 4 || j === 15));
                    quad(window ? glass : j === 1 ? under : j === 0 || j === 2 ? accent : body, [a[next], b[next], b[j], a[j]]);
                }
            }
            box(body, 0, 1.235, 6.65, 0.16, 0.43, 0.02);
            box(under, 0, 0.9, 6.55, 0.3, 0.13, 0.5);
        }
        // Only the outward end has a nose. All inward-facing connections are flat and closely coupled.
        for (const end of tapered ? [-1] : [-1, 1]) {
            const z = end * 6.1;
            box(body, 0, 1.65, z, 2.85, 0.85, 0.12);
            box(glass, 0, 2.7, z, 2.6, 1.2, 0.02);
            for (const side of [-1, 1]) box(body, side * 1.37, 2.7, z, 0.12, 1.2, 0.12);
            if (modern) {
                const shape = new THREE.Shape(); shape.moveTo(-1.42, 3.3);
                for (let i = 0; i <= 24; i++) { const angle = Math.PI - Math.PI * i / 24; shape.lineTo(1.42 * Math.cos(angle), 3.3 + 0.55 * Math.sin(angle)); }
                shape.closePath(); part(new THREE.ShapeGeometry(shape), body, 0, 0, z);
            } else box(body, 0, 3.65, z, 2.85, 0.15, 0.12);
            box(under, 0, 0.9, end * 6.2, 0.3, 0.14, 0.35);
            if (modern && (!cab || end === -1)) {
                // Bellows surround an open centre passage instead of blocking the end windows.
                for (const side of [-1, 1]) box(under, side * 0.64, 2.25, end * 6.13, 0.12, 2.05, 0.22);
                box(under, 0, 3.25, end * 6.13, 1.4, 0.12, 0.22);
            }
        }
        for (const z of [-4, -2.9, 2.9, 4]) for (const side of [-1, 1]) {
            const wheel = new THREE.CylinderGeometry(0.39, 0.39, 0.16, 12); wheel.rotateZ(Math.PI / 2); wheel.userData.railWheel = true;
            part(wheel, under, side * 0.7175, 0.57, z);
        }
        for (const [material, geometries] of batches) {
            for (const g of geometries) {
                g.scale(g.userData.railWheel ? 1 : 0.86, 0.82, 1); g.translate(0, 0.18 * (1 - 0.82), 0); g.deleteAttribute("uv");
            }
            const geometry = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose()); this.geometries.push(geometry);
            const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = material !== glass; mesh.receiveShadow = true; this.prototype.add(mesh);
        }
        this.prototype.userData.taperedFront = tapered;
        if (config.logo) {
            const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); this.materials.push(material);
            const g = new THREE.PlaneGeometry(0.85, 0.34); this.geometries.push(g);
            for (const side of [-1, 1]) {
                const logo = new THREE.Mesh(g, material); logo.name = "rail-logo"; logo.rotation.y = side * Math.PI / 2;
                logo.position.set(side * 1.465 * 0.86, 0.18 + (1.6 - 0.18) * 0.82, 4); logo.scale.y = 0.82; this.prototype.add(logo);
            }
            const logo = new THREE.Mesh(g, material); logo.name = "rail-logo";
            logo.position.set(0, tapered ? 1.88 : 1.43, tapered ? 6.02 : 6.17);
            if (tapered) logo.rotation.x = -Math.atan(0.55 / (0.75 * 0.82));
            logo.scale.set(tapered ? 0.65 : 0.86, 0.8, 1); this.prototype.add(logo);
            this.logo = new THREE.TextureLoader().load(config.logo, texture => {
                if (this.disposed) { texture.dispose(); return; }
                texture.colorSpace = THREE.SRGBColorSpace; material.map = texture; material.opacity = 1; material.needsUpdate = true;
            }, undefined, () => {});
        }
        if (tapered) this.trailer = new TrainModel({ ...config, logo: undefined }, false);
    }
    /** Creates an outward cab or an intermediate trailer borrowing shared city resources. */
    createCarriage(gauge: number, end: boolean): THREE.Group {
        if (!end && this.trailer) return this.trailer.createCarriage(gauge, false);
        const result = this.prototype.clone(true); result.scale.x = gauge / 1.435;
        result.traverse(o => { if (o.name === "rail-logo") o.visible = end; }); return result;
    }
    /** Releases all shared geometry, materials, logos and the intermediate-car prototype. */
    dispose(): void {
        this.disposed = true; this.trailer?.dispose(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.logo?.dispose();
    }
}
