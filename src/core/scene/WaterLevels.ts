import { SpatialGrid, closestPoint, type Point } from "./CollisionWorld";

/** Water polygon and its initially estimated local height. */
export interface WaterLevelArea {
    outer: Point[];
    holes: Point[][];
    height: number;
    /** Explicit OSM elevations must not be overwritten by neighbouring estimates. */
    fixedHeight?: boolean;
    /** Coastline sea or a bay supplies a sea-level anchor for its connected group. */
    sea?: boolean;
}

/** Boundary segment used only while resolving water connectivity during loading. */
interface Edge { a: Point; b: Point; owner: number; }

/** Resolves touching/overlapping water groups once, without adding per-frame work.
 * Each unanchored group uses its largest polygon's initial height. Coastline/bay
 * groups use sea level; explicit feature elevations remain authoritative.
 * @param areas - Mutable water areas whose height fields receive the solved levels.
 * @param seaHeight - Sea level in the city's local vertical coordinate system.
 */
export function resolveWaterLevels(areas: WaterLevelArea[], seaHeight: number): void {
    const tolerance = 0.0001; // Numerical tolerance only, not a proximity connection radius.
    const parents = areas.map((_, i) => i);
    /** Finds and compresses the connected-component representative. */
    const find = (id: number): number => {
        let root = id;
        while (parents[root] !== root) root = parents[root]!;
        while (parents[id] !== id) { const next = parents[id]!; parents[id] = root; id = next; }
        return root;
    };
    /** Joins two components after confirmed geometric contact. */
    const join = (a: number, b: number): void => { parents[find(a)] = find(b); };
    /** Computes oriented side of a segment for a point. */
    const side = (a: Point, b: Point, p: Point): number => (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
    /** Includes crossings, shared edges and vertex-on-edge contact with unequal vertex spacing. */
    const touching = (e: Edge, f: Edge): boolean => {
        if (Math.max(e.a.x,e.b.x)+tolerance < Math.min(f.a.x,f.b.x) ||
            Math.max(f.a.x,f.b.x)+tolerance < Math.min(e.a.x,e.b.x) ||
            Math.max(e.a.z,e.b.z)+tolerance < Math.min(f.a.z,f.b.z) ||
            Math.max(f.a.z,f.b.z)+tolerance < Math.min(e.a.z,e.b.z)) return false;
        if (side(e.a,e.b,f.a)*side(e.a,e.b,f.b)<0 && side(f.a,f.b,e.a)*side(f.a,f.b,e.b)<0) return true;
        return [[e.a,f.a,f.b],[e.b,f.a,f.b],[f.a,e.a,e.b],[f.b,e.a,e.b]].some(([p,a,b]) => {
            const q = closestPoint(p!,a!,b!);
            return Math.hypot(p!.x-q.x,p!.z-q.z)<=tolerance;
        });
    };
    const cellSize = 100;
    const grid = new SpatialGrid<Edge>(cellSize);
    for (let owner=0;owner<areas.length;owner++) {
        for (const ring of [areas[owner]!.outer,...areas[owner]!.holes]) {
            for (let i=0;i<ring.length;i++) {
                const edge = { a:ring[i]!, b:ring[(i+1)%ring.length]!, owner };
                if (edge.a.x===edge.b.x && edge.a.z===edge.b.z) continue;
                const minX=Math.min(edge.a.x,edge.b.x)-tolerance, maxX=Math.max(edge.a.x,edge.b.x)+tolerance;
                const minZ=Math.min(edge.a.z,edge.b.z)-tolerance, maxZ=Math.max(edge.a.z,edge.b.z)+tolerance;
                const candidates = new Set<Edge>();
                for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)
                    for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)
                        for(const other of grid.at((x+0.5)*cellSize,(z+0.5)*cellSize)) candidates.add(other);
                for(const other of candidates)
                    if(find(owner)!==find(other.owner) && touching(edge,other)) join(owner,other.owner);
                grid.insert(edge,minX,minZ,maxX,maxZ);
            }
        }
    }
    /** Point-in-ring test used for polygons overlapping through containment without edge crossings. */
    const inside = (p: Point, ring: Point[]): boolean => {
        let hit=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
            const a=ring[i]!,b=ring[j]!;
            if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) hit=!hit;
        }
        return hit;
    };
    /** Distinguishes water interior from dry islands represented by holes. */
    const wet = (p: Point, area: WaterLevelArea): boolean => inside(p,area.outer) && !area.holes.some(h=>inside(p,h));
    const bounds=areas.map((area,id)=>({id,minX:Math.min(...area.outer.map(p=>p.x)),maxX:Math.max(...area.outer.map(p=>p.x)),
        minZ:Math.min(...area.outer.map(p=>p.z)),maxZ:Math.max(...area.outer.map(p=>p.z))})).sort((a,b)=>a.minX-b.minX);
    for(let i=0;i<bounds.length;i++) for(let j=i+1;j<bounds.length && bounds[j]!.minX<=bounds[i]!.maxX;j++) {
        const a=bounds[i]!,b=bounds[j]!;
        if(find(a.id)===find(b.id) || a.maxZ<b.minZ || b.maxZ<a.minZ) continue;
        if(areas[a.id]!.outer.some(p=>wet(p,areas[b.id]!)) || areas[b.id]!.outer.some(p=>wet(p,areas[a.id]!))) join(a.id,b.id);
    }
    /** Calculates actual polygon area, subtracting islands, independent of ring winding. */
    const ringArea = (ring: Point[]): number => Math.abs(ring.reduce((sum,p,i)=>{
        const q=ring[(i+1)%ring.length]!; return sum+p.x*q.z-q.x*p.z;
    },0))/2;
    const groups=new Map<number,{largest:number;size:number;sea:boolean}>();
    areas.forEach((area,id)=>{
        const root=find(id),size=Math.max(0,ringArea(area.outer)-area.holes.reduce((sum,h)=>sum+ringArea(h),0));
        const group=groups.get(root);
        if(!group) groups.set(root,{largest:id,size,sea:!!area.sea});
        else { group.sea ||= !!area.sea; if(size>group.size){group.size=size;group.largest=id;} }
    });
    areas.forEach((area,id)=>{
        if(area.fixedHeight) return;
        const group=groups.get(find(id))!;
        area.height=group.sea?seaHeight:areas[group.largest]!.height;
    });
}
