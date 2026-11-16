// Invisible Navigation Mesh Builder & Wall-Aware Pathfinding for Lizards
// Generates cached invisible waypoints on walkable floors/platforms and climbing poles,
// strictly blocking any edge that intersects solid walls or barriers.

export interface NavPlatformInput {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  label?: string;
}

export interface NavPoleInput {
  x: number;
  yMin: number;
  yMax: number;
}

export interface NavPipeInput {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetLocationId?: string;
  isShelterPipe?: boolean;
  isDenPipe?: boolean;
}

export interface NavNode {
  id: number;
  x: number;
  y: number;
  kind: 'surface' | 'pole' | 'pipe';
  poleIndex?: number;
  pipeId?: string;
}

export interface NavEdge {
  to: number;
  cost: number;
  kind: 'walk' | 'pole' | 'jump' | 'pipe';
  poleX?: number;
  pipeId?: string;
}

export interface NavWaypoint {
  x: number;
  y: number;
  kind: 'walk' | 'pole' | 'jump' | 'pipe';
  poleX?: number;
  pipeId?: string;
}

interface WallBlocker {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LocationNavGraph {
  signature: string;
  nodes: NavNode[];
  edges: NavEdge[][];
  blockers: WallBlocker[];
}

const navGraphCache = new Map<string, LocationNavGraph>();

function extractWallBlockers(platforms: NavPlatformInput[]): WallBlocker[] {
  const blockers: WallBlocker[] = [];
  for (const p of platforms) {
    if (p.type === 'wall' || p.type === 'shelter') {
      blockers.push({ x: p.x + 2, y: p.y + 2, w: Math.max(2, p.w - 4), h: Math.max(2, p.h - 4) });
    } else if (p.h >= 45) {
      // Tall concrete/metal monolith: walkable on top (p.y), solid wall interior below top surface
      blockers.push({ x: p.x + 2, y: p.y + 10, w: Math.max(2, p.w - 4), h: Math.max(2, p.h - 12) });
    }
  }
  return blockers;
}

function isPointInsideWall(x: number, y: number, blockers: WallBlocker[]): boolean {
  for (const b of blockers) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return true;
    }
  }
  return false;
}

// Liang-Barsky line segment vs AABB intersection test: ensures no path crosses through any wall
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-8) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, x1 - rx) &&
    clip(dx, rx + rw - x1) &&
    clip(-dy, y1 - ry) &&
    clip(dy, ry + rh - y1)
  ) {
    return t1 >= t0;
  }
  return false;
}

export function doesSegmentCrossAnyWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  blockers: WallBlocker[]
): boolean {
  for (const b of blockers) {
    if (segmentIntersectsRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) {
      return true;
    }
  }
  return false;
}

export function getOrBuildNavGraph(
  roomKey: string,
  platforms: NavPlatformInput[],
  poles: NavPoleInput[],
  pipes?: NavPipeInput[]
): LocationNavGraph {
  const sig = `${roomKey}:${platforms.length}:${poles.length}:${pipes?.length ?? 0}`;
  const cached = navGraphCache.get(roomKey);
  if (cached && cached.signature === sig) {
    return cached;
  }

  const blockers = extractWallBlockers(platforms);
  const nodes: NavNode[] = [];

  const addNode = (x: number, y: number, kind: NavNode['kind'], poleIndex?: number, pipeId?: string): number => {
    const id = nodes.length;
    nodes.push({ id, x: Math.round(x), y: Math.round(y), kind, poleIndex, pipeId });
    return id;
  };

  // 1. Invisible floor & platform walkable surface nodes
  for (const plat of platforms) {
    if (plat.type === 'wall' || plat.type === 'shelter') continue;
    if (plat.y <= 35 || plat.w < 36) continue;
    const surfaceY = plat.y - 12;
    const minX = plat.x + 22;
    const maxX = plat.x + plat.w - 22;
    if (minX > maxX) {
      const midX = plat.x + plat.w / 2;
      if (!isPointInsideWall(midX, surfaceY, blockers)) {
        addNode(midX, surfaceY, 'surface');
      }
      continue;
    }
    const count = Math.max(2, Math.ceil((maxX - minX) / 80) + 1);
    for (let i = 0; i < count; i++) {
      const sx = minX + ((maxX - minX) * i) / (count - 1);
      if (!isPointInsideWall(sx, surfaceY, blockers)) {
        addNode(sx, surfaceY, 'surface');
      }
    }
  }

  // 2. Invisible climbing pole nodes (sampled at platforms + regular intervals)
  const poleNodeGroups: number[][] = [];
  poles.forEach((pole, pIdx) => {
    const heights = new Set<number>();
    heights.add(pole.yMin + 14);
    heights.add(pole.yMax - 12);

    for (const plat of platforms) {
      if (plat.type === 'wall' || plat.type === 'shelter') continue;
      if (plat.y >= pole.yMin - 24 && plat.y <= pole.yMax + 24) {
        if (pole.x >= plat.x - 65 && pole.x <= plat.x + plat.w + 65) {
          heights.add(plat.y - 12);
        }
      }
    }

    for (let py = pole.yMin + 85; py < pole.yMax - 30; py += 85) {
      heights.add(py);
    }

    const sortedY = Array.from(heights).sort((a, b) => a - b);
    const groupIds: number[] = [];
    for (const py of sortedY) {
      if (!isPointInsideWall(pole.x, py, blockers)) {
        groupIds.push(addNode(pole.x, py, 'pole', pIdx));
      }
    }
    poleNodeGroups.push(groupIds);
  });

  // 3. Same-room shortcut pipe nodes
  const pipePairs: Array<{ a: number; b: number; pipeId: string }> = [];
  if (pipes) {
    for (const pipe of pipes) {
      if (pipe.isShelterPipe || pipe.targetLocationId) continue;
      const a = addNode(pipe.startX, pipe.startY, 'pipe', undefined, pipe.id);
      const b = addNode(pipe.endX, pipe.endY, 'pipe', undefined, pipe.id);
      pipePairs.push({ a, b, pipeId: pipe.id });
    }
  }

  const edges: NavEdge[][] = Array.from({ length: nodes.length }, () => []);
  const connect = (u: number, v: number, cost: number, kind: NavEdge['kind'], poleX?: number, pipeId?: string) => {
    edges[u].push({ to: v, cost, kind, poleX, pipeId });
  };

  // Pole vertical connections (only if unobstructed by walls)
  poleNodeGroups.forEach((ids, pIdx) => {
    const px = poles[pIdx].x;
    for (let i = 0; i < ids.length - 1; i++) {
      const u = ids[i];
      const v = ids[i + 1];
      if (!doesSegmentCrossAnyWall(nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y, blockers)) {
        const dy = Math.abs(nodes[v].y - nodes[u].y);
        connect(u, v, dy * 1.1, 'pole', px);
        connect(v, u, dy * 1.1, 'pole', px);
      }
    }
  });

  // Shortcut pipe connections
  for (const pair of pipePairs) {
    connect(pair.a, pair.b, 95, 'pipe', undefined, pair.pipeId);
    connect(pair.b, pair.a, 95, 'pipe', undefined, pair.pipeId);
  }

  // Walk & Jump/Drop edges (strictly checked against ALL walls)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);

      if (dx > 180 || dy > 190) continue;
      if (doesSegmentCrossAnyWall(a.x, a.y, b.x, b.y, blockers)) continue;

      if (dy <= 24 && dx <= 165) {
        const dist = Math.hypot(dx, dy);
        connect(i, j, dist, 'walk');
        connect(j, i, dist, 'walk');
      } else if (dx <= 135 && dy <= 160) {
        const aToBDy = b.y - a.y; // negative = upward jump
        if (aToBDy >= -92 && aToBDy <= 180) {
          connect(i, j, Math.hypot(dx, dy) * (aToBDy < 0 ? 1.45 : 1.15), 'jump');
        }
        const bToADy = a.y - b.y;
        if (bToADy >= -92 && bToADy <= 180) {
          connect(j, i, Math.hypot(dx, dy) * (bToADy < 0 ? 1.45 : 1.15), 'jump');
        }
      }
    }
  }

  const graph: LocationNavGraph = { signature: sig, nodes, edges, blockers };
  navGraphCache.set(roomKey, graph);
  return graph;
}

export function findNextGraphWaypoint(
  roomKey: string,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  platforms: NavPlatformInput[],
  poles: NavPoleInput[],
  pipes?: NavPipeInput[]
): NavWaypoint | null {
  const graph = getOrBuildNavGraph(roomKey, platforms, poles, pipes);
  const { nodes, edges, blockers } = graph;
  if (nodes.length === 0) return null;

  // Dynamic temporary node count: base nodes + start + goal
  const totalCount = nodes.length + 2;
  const startId = nodes.length;
  const goalId = nodes.length + 1;

  const startEdges: NavEdge[] = [];
  const incomingToGoal: Array<{ from: number; edge: NavEdge }> = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const ds = Math.hypot(n.x - startX, n.y - startY);
    if (ds <= 185 && !doesSegmentCrossAnyWall(startX, startY, n.x, n.y, blockers)) {
      startEdges.push({
        to: i,
        cost: ds,
        kind: n.kind === 'pole' && Math.abs(n.y - startY) > 25 ? 'pole' : 'walk',
        poleX: n.poleIndex !== undefined ? poles[n.poleIndex]?.x : undefined,
        pipeId: n.pipeId
      });
    }

    const dg = Math.hypot(n.x - goalX, n.y - goalY);
    if (dg <= 195 && !doesSegmentCrossAnyWall(n.x, n.y, goalX, goalY, blockers)) {
      incomingToGoal.push({
        from: i,
        edge: {
          to: goalId,
          cost: dg,
          kind: Math.abs(goalY - n.y) > 28 && goalY < n.y ? 'jump' : 'walk'
        }
      });
    }
  }

  // Fallback anchor link to closest unobstructed node if start or goal is slightly further away
  if (startEdges.length === 0) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (doesSegmentCrossAnyWall(startX, startY, nodes[i].x, nodes[i].y, blockers)) continue;
      const d = Math.hypot(nodes[i].x - startX, nodes[i].y - startY);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      startEdges.push({ to: bestIdx, cost: bestDist, kind: 'walk' });
    }
  }

  if (incomingToGoal.length === 0) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (doesSegmentCrossAnyWall(nodes[i].x, nodes[i].y, goalX, goalY, blockers)) continue;
      const d = Math.hypot(nodes[i].x - goalX, nodes[i].y - goalY);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      incomingToGoal.push({ from: bestIdx, edge: { to: goalId, cost: bestDist, kind: 'walk' } });
    }
  }

  if (startEdges.length === 0 || incomingToGoal.length === 0) {
    return null;
  }

  const goalMap = new Map<number, NavEdge>();
  for (const item of incomingToGoal) {
    goalMap.set(item.from, item.edge);
  }

  const distArr = new Float64Array(totalCount).fill(Infinity);
  const prevNode = new Int32Array(totalCount).fill(-1);
  const prevEdge: Array<NavEdge | null> = new Array(totalCount).fill(null);
  const visited = new Uint8Array(totalCount);

  distArr[startId] = 0;

  for (let iter = 0; iter < totalCount; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < totalCount; i++) {
      if (!visited[i] && distArr[i] < best) {
        best = distArr[i];
        u = i;
      }
    }
    if (u === -1 || u === goalId) break;
    visited[u] = 1;

    const adj = u === startId ? startEdges : (u < nodes.length ? edges[u] : []);
    for (const edge of adj) {
      const alt = distArr[u] + edge.cost;
      if (alt < distArr[edge.to]) {
        distArr[edge.to] = alt;
        prevNode[edge.to] = u;
        prevEdge[edge.to] = edge;
      }
    }
    const gEdge = goalMap.get(u);
    if (gEdge) {
      const alt = distArr[u] + gEdge.cost;
      if (alt < distArr[goalId]) {
        distArr[goalId] = alt;
        prevNode[goalId] = u;
        prevEdge[goalId] = gEdge;
      }
    }
  }

  if (!Number.isFinite(distArr[goalId])) {
    return null;
  }

  // Reconstruct path and pick immediate next node after startId
  let step = goalId;
  while (prevNode[step] !== -1 && prevNode[step] !== startId) {
    step = prevNode[step];
  }

  const stepEdge = prevEdge[step];
  if (!stepEdge) return null;

  if (step === goalId) {
    return { x: goalX, y: goalY, kind: stepEdge.kind };
  }

  const targetNode = nodes[step];
  if (!targetNode) return null;

  return {
    x: targetNode.x,
    y: targetNode.y,
    kind: stepEdge.kind,
    poleX: stepEdge.poleX,
    pipeId: stepEdge.pipeId
  };
}
