/** Cached procedural sign faces and physical panels at mapped decor positions. @packageDocumentation */
import * as THREE from "three";
import { parseTrafficSigns, type TrafficSignSpec } from "./TrafficSignConfig";

/** Owns shared sign shapes, cached artwork and short-range LODs. */
export class TrafficSigns {
    readonly group = new THREE.Group();
    private plane = new THREE.PlaneGeometry(0.8, 0.8);
    private backing = new THREE.MeshStandardMaterial({ color: 0x8b9295, roughness: 0.8 });
    private geometry = new Map<string, THREE.ExtrudeGeometry>();
    private materials = new Map<string, THREE.MeshStandardMaterial>();

    /** Registers scenery metadata; the decor generator owns scene attachment. */
    constructor() {
        this.group.name = "Traffic signs";
        this.group.userData.cullDistance = 160;
    }

    /** Returns a sign's physical outline in canvas coordinates. */
    private outline(sign: TrafficSignSpec): Array<[number, number]> | undefined {
        if (sign.kind === "stop")
            return Array.from({ length: 8 }, (_, i) => {
                const angle = Math.PI / 8 + (i * Math.PI) / 4;
                return [256 + Math.cos(angle) * 225, 256 + Math.sin(angle) * 225];
            });
        if (sign.kind === "give_way")
            return [
                [38, 62],
                [474, 62],
                [256, 450],
            ];
        if (sign.kind === "one_way")
            return [
                [28, 100],
                [484, 100],
                [484, 412],
                [28, 412],
            ];
        if (sign.zone)
            return [
                [38, 20],
                [474, 20],
                [474, 492],
                [38, 492],
            ];
        return undefined;
    }

    /** Caches the solid panel shape independently of speed text. */
    private panel(sign: TrafficSignSpec): THREE.ExtrudeGeometry {
        const key = sign.zone ? "zone" : sign.kind;
        const cached = this.geometry.get(key);
        if (cached) return cached;
        const shape = new THREE.Shape(),
            polygon = this.outline(sign);
        if (polygon) {
            polygon.forEach(([x, y], index) => {
                const px = (x - 256) / 640,
                    py = (256 - y) / 640;
                if (index === 0) shape.moveTo(px, py);
                else shape.lineTo(px, py);
            });
            shape.closePath();
        } else shape.absarc(0, 0, 218 / 640, 0, Math.PI * 2, false);
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.025,
            bevelEnabled: false,
            curveSegments: 32,
        });
        this.geometry.set(key, geometry);
        return geometry;
    }

    /** Draws original vector-style artwork rather than downloading catalogue images. */
    private artwork(sign: TrafficSignSpec): THREE.MeshStandardMaterial | undefined {
        const key = JSON.stringify(sign),
            cached = this.materials.get(key);
        if (cached) return cached;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        const red = "#c92726",
            white = "#fffdf3",
            polygon = this.outline(sign);
        ctx.beginPath();
        if (polygon) {
            polygon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
        } else ctx.arc(256, 256, 218, 0, Math.PI * 2);
        ctx.fillStyle =
            sign.kind === "stop" || sign.kind === "no_entry"
                ? red
                : sign.kind === "one_way"
                  ? "#1558a1"
                  : white;
        ctx.fill();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (sign.kind === "no_entry") {
            ctx.fillStyle = white;
            ctx.fillRect(100, 214, 312, 84);
        } else if (sign.kind === "stop") {
            ctx.strokeStyle = white;
            ctx.lineWidth = 14;
            ctx.stroke();
            ctx.fillStyle = white;
            ctx.font = "bold 126px sans-serif";
            ctx.fillText("STOP", 256, 262, 360);
        } else if (sign.kind === "give_way") {
            ctx.strokeStyle = red;
            ctx.lineWidth = 44;
            ctx.lineJoin = "round";
            ctx.stroke();
        } else if (sign.kind === "no_access") {
            ctx.strokeStyle = red;
            ctx.lineWidth = 48;
            ctx.stroke();
        } else if (sign.kind === "one_way") {
            ctx.fillStyle = white;
            ctx.beginPath();
            ctx.moveTo(222, 355);
            ctx.lineTo(290, 355);
            ctx.lineTo(290, 245);
            ctx.lineTo(355, 245);
            ctx.lineTo(256, 145);
            ctx.lineTo(157, 245);
            ctx.lineTo(222, 245);
            ctx.closePath();
            ctx.fill();
        } else {
            const cy = sign.zone ? 295 : 256,
                radius = sign.zone ? 164 : 192;
            ctx.beginPath();
            ctx.arc(256, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = red;
            ctx.lineWidth = 43;
            ctx.stroke();
            ctx.fillStyle = "#17191a";
            ctx.font = "bold " + (sign.speed!.length > 2 ? 155 : 185) + "px sans-serif";
            ctx.fillText(sign.speed!, 256, cy + 9, 300);
            if (sign.zone) {
                ctx.font = "bold 66px sans-serif";
                ctx.fillText("ZONE", 256, 75);
            }
            if (sign.mph) {
                ctx.font = "35px sans-serif";
                ctx.fillText("mph", 256, cy + 110);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5,
            roughness: 0.8,
        });
        this.materials.set(key, material);
        return material;
    }

    /** Adds only decoded signs at the exact mapped point; returns the number of stacked panels. */
    add(
        tags: Record<string, unknown>,
        countries: string | readonly string[],
        x: number,
        y: number,
        z: number,
        yaw: number,
    ): number {
        const specs = parseTrafficSigns(tags, countries).slice(0, 4);
        let count = 0;
        for (const spec of specs) {
            const material = this.artwork(spec);
            if (!material) continue;
            const panel = new THREE.Group();
            panel.name = "Traffic sign: " + spec.kind + (spec.speed ? " " + spec.speed : "");
            panel.rotation.y = yaw;
            const body = new THREE.Mesh(this.panel(spec), this.backing);
            const face = new THREE.Mesh(this.plane, material);
            face.position.z = 0.026;
            body.castShadow = body.receiveShadow = true;
            face.receiveShadow = true;
            panel.add(body, face);
            const lod = new THREE.LOD();
            lod.position.set(x, y + 2.2 + count * 0.85, z);
            lod.addLevel(panel, 0);
            lod.addLevel(new THREE.Object3D(), 140);
            this.group.add(lod);
            count++;
        }
        return count;
    }

    /** Clears city-specific instances and releases cached canvases. */
    clear(): void {
        this.group.clear();
        this.materials.forEach((material) => {
            material.map?.dispose();
            material.dispose();
        });
        this.materials.clear();
    }
    /** Releases all shared geometry/materials owned by this generator. */
    dispose(): void {
        this.clear();
        this.plane.dispose();
        this.backing.dispose();
        this.geometry.forEach((geometry) => geometry.dispose());
        this.geometry.clear();
    }
}
