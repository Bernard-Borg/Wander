/** Height-aware, spatially instanced broadleaf trees. @packageDocumentation */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GeoJSON } from "@/types";
import { osmMetres } from "./OsmValues";

/** Chooses a reproducible height: explicit height, then height:range, then 5?12 m. */
export function treeHeight(tags: Record<string, unknown>, random: number): number {
    const height = osmMetres(tags.height);
    if (height !== undefined) return height;
    const range = String(tags["height:range"] ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(?:m)?\s*(?:[-?;]|to)\s*(\d+(?:\.\d+)?)\s*(?:m)?$/i);
    const open = String(tags["height:range"] ?? "").trim().match(/^([<>])\s*(\d+(?:\.\d+)?)\s*m?$/i);
    const limit = open ? Number(open[2]) : 0;
    const min = range ? Number(range[1]) : open && limit > 0 ? (open[1] === "<" ? limit * 0.5 : limit) : 5;
    const max = range ? Number(range[2]) : open && limit > 0 ? (open[1] === "<" ? limit : limit * 1.25) : 12;
    if (min > 0 && max >= min) return min + (max - min) * random;
    return 5 + 7 * random;
}

/** Loads one model and instances its primitive meshes in 200 metre cells. */
export class TreeGenerator {
    private treeGroup = new THREE.Group();
    private model: THREE.Group | null = null;
    private loading: Promise<THREE.Group> | null = null;
    private disposed = false;
    private revision = 0;

    /** Registers the tree root with ordinary scenery culling. */
    constructor(private scene: THREE.Scene) {
        this.treeGroup.userData.isTreeGroup = true;
        this.treeGroup.userData.cullDistance = 650;
        this.treeGroup.name = "Trees";
        scene.add(this.treeGroup);
    }

    /** Loads the shared source model, preserving all node transforms and materials. */
    private async loadModel(): Promise<THREE.Group> {
        if (this.model) return this.model;
        this.loading ??= new GLTFLoader().loadAsync("/models/trees/broadleaved.gltf").then(gltf => {
            if (this.disposed) { this.disposeModel(gltf.scene); throw new Error("Tree generator disposed"); }
            this.model = gltf.scene;
            return gltf.scene;
        });
        return this.loading;
    }

    /** Builds deterministic tree instances with their base at sampled terrain height. */
    async generateTreesFromGeoJSON(data: GeoJSON, centerLat: number, centerLon: number,
        heightAt: (x: number, z: number) => number = () => 0): Promise<void> {
        this.clear();
        const revision = this.revision;
        const model = await this.loadModel();
        if (this.disposed || revision !== this.revision) return;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
        if (!(size.y > 0)) throw new Error("Broadleaf tree model has no measurable height");
        const centre = bounds.getCenter(new THREE.Vector3());
        const normalize = new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z);
        const primitives: THREE.Mesh[] = [];
        model.traverse(object => { if (object instanceof THREE.Mesh) primitives.push(object); });
        const cells = new Map<string, THREE.Matrix4[]>();
        const projection = Math.PI / 180 * 6371000;
        let count = 0;
        for (const feature of data.features) {
            if (feature.properties.natural !== "tree" || feature.geometry.type !== "Point") continue;
            const [lon, lat] = feature.geometry.coordinates;
            const x = (lon - centerLon) * projection * Math.cos(centerLat * Math.PI / 180);
            const z = -(lat - centerLat) * projection;
            let seed = 2166136261;
            for (const char of String(feature.id ?? feature.properties["@id"] ?? lon + "," + lat))
                seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
            const random = (seed >>> 0) / 4294967296;
            const height = treeHeight(feature.properties, random);
            const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (seed >>> 8) / 16777216 * Math.PI * 2);
            const scale = height / size.y;
            const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z), z), rotation,
                new THREE.Vector3(scale, scale, scale)).multiply(normalize);
            const key = Math.floor(x / 200) + "," + Math.floor(z / 200);
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key)!.push(matrix);
            count++;
        }
        for (const matrices of cells.values()) for (const primitive of primitives) {
            const mesh = new THREE.InstancedMesh(primitive.geometry, primitive.material, matrices.length);
            matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix.clone().multiply(primitive.matrixWorld)));
            mesh.computeBoundingSphere();
            mesh.castShadow = mesh.receiveShadow = true;
            this.treeGroup.add(mesh);
        }
        this.treeGroup.userData.treeCount = count;
    }

    /** Removes instances while retaining reusable source geometry and materials. */
    clear(): void {
        this.revision++;
        for (const mesh of this.treeGroup.children) (mesh as THREE.InstancedMesh).dispose();
        this.treeGroup.clear();
    }

    /** Releases each shared source resource once. */
    private disposeModel(model: THREE.Group): void {
        const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
        model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                materials.add(material);
                for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
            }
        });
        geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    }

    /** Releases instances, source assets and scene ownership, including pending loads. */
    dispose(): void {
        this.disposed = true; this.clear();
        if (this.model) this.disposeModel(this.model);
        this.model = null;
        this.scene.remove(this.treeGroup);
    }
}
