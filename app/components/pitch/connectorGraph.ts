import type { PitchObject, PitchConnector } from './PitchCanvas';

/**
 * Connector geometry — connectors are edges that ATTACH to objects by id (not fixed
 * coordinates), so a line between two players follows them when either is moved. This
 * module resolves those edges to concrete endpoints and detects closed loops so a ring
 * of connected objects (a polygon) can be filled.
 *
 * All coordinates are normalised 0–1, matching PitchObject.x/y.
 */

export interface ConnSeg { id: string; color: string; width: number; from: { x: number; y: number }; to: { x: number; y: number } }
export interface ConnLoop { ids: string[]; color: string }

/** Resolve each connector to its two object centres (skipping any whose endpoints were deleted). */
export function connectorSegments(objects: PitchObject[], connectors?: PitchConnector[]): ConnSeg[] {
  if (!connectors?.length) return [];
  const byId = new Map(objects.map(o => [o.id, o]));
  const segs: ConnSeg[] = [];
  for (const c of connectors) {
    const a = byId.get(c.from), b = byId.get(c.to);
    if (!a || !b || c.from === c.to) continue;
    segs.push({ id: c.id, color: c.color, width: c.width, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });
  }
  return segs;
}

const undirectedKey = (u: string, v: string) => (u < v ? u + '|' + v : v + '|' + u);

/**
 * Find closed loops (fundamental cycles) among the connectors — each returned as an
 * ordered list of object ids forming a polygon. A star/hub (no cycle) yields nothing, so
 * only genuinely-closed shapes are fillable. Uses a spanning forest: every non-tree edge
 * closes exactly one fundamental cycle. Good for the common ring-of-players case.
 */
export function closedLoops(objects: PitchObject[], connectors?: PitchConnector[]): ConnLoop[] {
  if (!connectors?.length) return [];
  const byId = new Map(objects.map(o => [o.id, o]));
  const edges = connectors.filter(c => byId.has(c.from) && byId.has(c.to) && c.from !== c.to);
  if (edges.length < 3) return [];

  const adj = new Map<string, string[]>();
  const add = (u: string, v: string) => { if (!adj.has(u)) adj.set(u, []); adj.get(u)!.push(v); };
  // Dedupe parallel edges for traversal (a double connector between two nodes isn't a polygon).
  const seenEdge = new Set<string>();
  edges.forEach(e => { const k = undirectedKey(e.from, e.to); if (seenEdge.has(k)) return; seenEdge.add(k); add(e.from, e.to); add(e.to, e.from); });

  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const visited = new Set<string>();
  const treeEdge = new Set<string>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    visited.add(start); parent.set(start, null); depth.set(start, 0);
    const q = [start];
    while (q.length) {
      const u = q.shift()!;
      for (const v of adj.get(u) || []) {
        if (!visited.has(v)) { visited.add(v); parent.set(v, u); depth.set(v, (depth.get(u) || 0) + 1); treeEdge.add(undirectedKey(u, v)); q.push(v); }
      }
    }
  }

  const loops: ConnLoop[] = [];
  const seenCycle = new Set<string>();
  const colorOf = new Map<string, string>();
  edges.forEach(e => colorOf.set(undirectedKey(e.from, e.to), e.color));

  for (const k of seenEdge) {
    if (treeEdge.has(k)) continue; // tree edges don't close a cycle
    const [f, t] = k.split('|');
    // Walk both endpoints up to their common ancestor → the fundamental cycle.
    let a = f, b = t;
    const pathA: string[] = [], pathB: string[] = [];
    let da = depth.get(a) ?? 0, db = depth.get(b) ?? 0;
    while (da > db) { pathA.push(a); a = parent.get(a)!; da--; }
    while (db > da) { pathB.push(b); b = parent.get(b)!; db--; }
    while (a !== b) { pathA.push(a); pathB.push(b); a = parent.get(a)!; b = parent.get(b)!; if (a == null || b == null) break; }
    if (a !== b) continue;
    pathA.push(a); // lca
    const cycle = [...pathA, ...pathB.reverse()];
    if (cycle.length < 3) continue;
    const ck = [...cycle].sort().join(',');
    if (seenCycle.has(ck)) continue;
    seenCycle.add(ck);
    loops.push({ ids: cycle, color: colorOf.get(k) || '#e53935' });
  }
  return loops;
}
