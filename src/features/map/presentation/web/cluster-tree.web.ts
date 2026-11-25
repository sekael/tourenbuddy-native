// Ported from the PWA's features/map/presentation/components/cluster-tree.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Tour } from '@/features/tours/domain/entities/tour';
import { haversineMeters } from '@/core/utils/haversine';

export const CLUSTER_RADIUS = 50;

export interface LeafNode {
  kind: 'leaf';
  id: string;
  coord: [number, number];
}

export interface InternalNode {
  kind: 'internal';
  id: string;
  centroid: [number, number];
  leafIds: string[];
  children: [TreeNode, TreeNode];
  splitZoom: number;
  totalLeafCount: number;
}

export type TreeNode = LeafNode | InternalNode;

export function pixelsPerMeter(latDeg: number, zoom: number): number {
  return (256 * 2 ** zoom) / (40075016.686 * Math.cos((latDeg * Math.PI) / 180));
}

export function solveSplitZoom(distMeters: number, latDeg: number, radiusPx: number): number {
  if (distMeters === 0) return +Infinity;
  return Math.log2(
    (radiusPx * 40075016.686 * Math.cos((latDeg * Math.PI) / 180)) / (256 * distMeters),
  );
}

function centroidOf(node: TreeNode): [number, number] {
  return node.kind === 'leaf' ? node.coord : node.centroid;
}

function leafCountOf(node: TreeNode): number {
  return node.kind === 'leaf' ? 1 : node.totalLeafCount;
}

function leafIdsOf(node: TreeNode): string[] {
  return node.kind === 'leaf' ? [node.id] : node.leafIds;
}

/**
 * FNV-1a of a tour id, then murmur3's finaliser. Plain FNV-1a ends in `(h ^ lastChar) * prime`,
 * so summed over ids that differ only in their last character, two leaf sets collided: Allalinhorn
 * ×4 and Säntis + Altmann shared one id, hence one marker.
 */
function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function clampMonotonicity(node: InternalNode, minZoom: number): void {
  if (node.splitZoom < minZoom) node.splitZoom = minZoom;
  for (const child of node.children) {
    if (child.kind === 'internal') clampMonotonicity(child, node.splitZoom);
  }
}

export function buildClusterTree(
  tours: Tour[],
  radiusPx: number = CLUSTER_RADIUS,
): TreeNode | null {
  if (tours.length === 0) return null;

  // A cluster's id derives from its leaf set (count + order-independent hash sum), not from merge
  // order: pinning one tour out (selection) then changes only the ids of its own ancestors, so
  // every other cluster keeps its marker instead of flickering out and back in.
  const hashes = new Map<TreeNode, number>();
  const nodes: TreeNode[] = tours.map((t) => ({
    kind: 'leaf' as const,
    id: t.id,
    coord: [t.goal.lng, t.goal.lat] as [number, number],
  }));
  for (const n of nodes) hashes.set(n, idHash(n.id));

  if (nodes.length === 1) return nodes[0]!;

  // Nearest-neighbour cache: a merge only invalidates the nodes whose nearest was one of the two
  // merged, so a build is ~O(n²) instead of rescanning every pair per merge (O(n³): 600 tours
  // took a second, and every selection rebuilds the tree).
  const alive: (TreeNode | null)[] = nodes;
  const nn: number[] = [];
  const nnDist: number[] = [];
  function scanNearest(i: number): void {
    nn[i] = -1;
    nnDist[i] = Infinity;
    for (let k = 0; k < alive.length; k++) {
      if (k === i || !alive[k]) continue;
      const d = haversineMeters(centroidOf(alive[i]!), centroidOf(alive[k]!));
      if (d < nnDist[i]!) {
        nnDist[i] = d;
        nn[i] = k;
      }
    }
  }
  for (let i = 0; i < alive.length; i++) scanNearest(i);

  for (let remaining = alive.length; remaining > 1; remaining--) {
    let bestI = -1;
    for (let i = 0; i < alive.length; i++) {
      if (alive[i] && (bestI < 0 || nnDist[i]! < nnDist[bestI]!)) bestI = i;
    }
    const bestJ = nn[bestI]!;
    const bestDist = nnDist[bestI]!;

    const a = alive[bestI]!;
    const b = alive[bestJ]!;
    const wA = leafCountOf(a);
    const wB = leafCountOf(b);
    const total = wA + wB;
    const cA = centroidOf(a);
    const cB = centroidOf(b);
    const centroid: [number, number] = [
      (cA[0] * wA + cB[0] * wB) / total,
      (cA[1] * wA + cB[1] * wB) / total,
    ];
    const splitZoom = solveSplitZoom(bestDist, centroid[1], radiusPx);
    const leafIds = [...leafIdsOf(a), ...leafIdsOf(b)].sort();
    const hash = (hashes.get(a)! + hashes.get(b)!) >>> 0;

    const merged: InternalNode = {
      kind: 'internal',
      id: `cluster-${total}-${hash.toString(36)}`,
      centroid,
      leafIds,
      children: [a, b],
      splitZoom,
      totalLeafCount: total,
    };

    hashes.set(merged, hash);
    alive[bestI] = merged;
    alive[bestJ] = null;
    scanNearest(bestI);
    for (let k = 0; k < alive.length; k++) {
      if (!alive[k] || k === bestI) continue;
      if (nn[k] === bestI || nn[k] === bestJ) {
        scanNearest(k);
      } else {
        const d = haversineMeters(centroidOf(alive[k]!), centroid);
        if (d < nnDist[k]!) {
          nnDist[k] = d;
          nn[k] = bestI;
        }
      }
    }
  }

  const root = alive.find((n) => n !== null)!;
  if (root.kind === 'internal') clampMonotonicity(root, -Infinity);
  return root;
}

export function cutForest(
  root: TreeNode | null,
  zoom: number,
  bbox?: [number, number, number, number],
): TreeNode[] {
  if (!root) return [];
  const result: TreeNode[] = [];

  function walk(node: TreeNode): void {
    if (node.kind === 'leaf') {
      result.push(node);
      return;
    }
    if (node.splitZoom <= zoom) {
      walk(node.children[0]);
      walk(node.children[1]);
    } else {
      result.push(node);
    }
  }

  walk(root);

  if (!bbox) return result;

  return result.filter((node) => {
    const [lng, lat] = node.kind === 'leaf' ? node.coord : node.centroid;
    return lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3];
  });
}

export function collectSplitZooms(root: TreeNode | null): number[] {
  if (!root) return [];
  const zooms: number[] = [];

  function walk(node: TreeNode): void {
    if (node.kind === 'internal') {
      zooms.push(node.splitZoom);
      walk(node.children[0]);
      walk(node.children[1]);
    }
  }

  walk(root);
  return zooms.sort((a, b) => a - b);
}

export function findCrossings(splitZooms: number[], fromZoom: number, toZoom: number): number[] {
  if (fromZoom === toZoom) return [];
  if (fromZoom < toZoom) {
    return splitZooms.filter((z) => z > fromZoom && z <= toZoom);
  }
  return splitZooms.filter((z) => z >= toZoom && z < fromZoom);
}

export function buildParentMap(root: TreeNode | null): Map<string, string> {
  const map = new Map<string, string>();

  function walk(node: TreeNode, parentId: string | null): void {
    if (parentId !== null) map.set(node.id, parentId);
    if (node.kind === 'internal') {
      walk(node.children[0], node.id);
      walk(node.children[1], node.id);
    }
  }

  if (root) walk(root, null);
  return map;
}
