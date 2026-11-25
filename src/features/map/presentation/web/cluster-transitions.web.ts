// Ported from the PWA's features/map/presentation/components/cluster-transitions.ts (port-pwa-web): MapLibre GL JS on the web.
import type { TreeNode } from './cluster-tree.web';

export interface RenderedNode {
  id: string;
  kind: 'leaf' | 'internal';
  centroid: [number, number];
  leafIds: string[];
}

export interface ForestDiff {
  appeared: RenderedNode[];
  disappeared: RenderedNode[];
  updated: RenderedNode[];
}

export function diffForests(
  oldByNodeId: Map<string, RenderedNode>,
  newForest: TreeNode[],
): ForestDiff {
  const newByNodeId = new Map<string, RenderedNode>();
  for (const node of newForest) {
    const centroid = node.kind === 'leaf' ? node.coord : node.centroid;
    const leafIds = node.kind === 'leaf' ? [node.id] : node.leafIds;
    newByNodeId.set(node.id, { id: node.id, kind: node.kind, centroid, leafIds });
  }

  const appeared: RenderedNode[] = [];
  const disappeared: RenderedNode[] = [];
  const updated: RenderedNode[] = [];

  for (const [id, node] of newByNodeId) {
    if (!oldByNodeId.has(id)) {
      appeared.push(node);
    } else {
      updated.push(node);
    }
  }

  for (const [id, node] of oldByNodeId) {
    if (!newByNodeId.has(id)) {
      disappeared.push(node);
    }
  }

  return { appeared, disappeared, updated };
}
