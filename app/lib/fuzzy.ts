/**
 * Tiny, dependency-free fuzzy matching for the Library smart search.
 *
 * Goals (no fuse.js): typo tolerance, out-of-order word matching, prefix/substring
 * boosts, and ranked suggestions — the "search-as-you-type" feel you get from
 * modern search boxes, but small enough to run on every keystroke client-side.
 */

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Minimum edits to turn `token` into ANY prefix of `word` (capped at `max`).
 * This is what powers autocomplete typo tolerance: "deff" → "defending",
 * "posesion" → "possession", "deffend" → "defend(ing)" all resolve cheaply
 * because we only pay for aligning the typed part, not the rest of the word.
 */
function prefixEditDistance(token: string, word: string, max: number): number {
  const n = token.length, m = word.length;
  if (n === 0) return 0;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j; // edits to build word[0:j] from ''
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = token[i - 1] === word[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // early-out: nothing in this row can win
    prev = cur;
  }
  let best = max + 1;
  for (let j = 0; j <= m; j++) if (prev[j] < best) best = prev[j]; // best prefix alignment
  return best;
}

/**
 * Score a single query token against a single target word. Returns 0..1 (0 = no match).
 * Exact > prefix > substring > fuzzy (typo). Short tokens tolerate fewer typos.
 */
function tokenWordScore(token: string, word: string): number {
  if (!token || !word) return 0;
  if (word === token) return 1;
  if (word.startsWith(token)) return 0.93;
  if (word.includes(token)) return 0.8;
  // Typo tolerance scales with length: 3 chars or fewer → exact only; 4-6 → 1 edit; 7+ → 2.
  const maxEdits = token.length <= 3 ? 0 : token.length <= 6 ? 1 : 2;
  if (maxEdits === 0) return 0;
  const d = prefixEditDistance(token, word, maxEdits);
  if (d <= maxEdits) return 0.85 - d * 0.15; // d=1 → .70, d=2 → .55
  return 0;
}

/**
 * Match a whole query (possibly multiple words) against a target string.
 * Every query token must find *some* word it matches (AND semantics); the score
 * is the average of the best per-token matches, with a strong whole-string boost.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = norm(query);
  const t = norm(target);
  if (!q) return 1;
  if (!t) return 0;
  if (t.includes(q)) return 0.95 + Math.min(0.05, (q.length / t.length) * 0.05); // whole-query substring
  const tokens = q.split(/\s+/).filter(Boolean);
  const words = t.split(/[\s/\-_,.]+/).filter(Boolean);
  if (!words.length) return 0;
  let sum = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const w of words) { const s = tokenWordScore(tok, w); if (s > best) best = s; }
    if (best === 0) return 0; // a token matched nothing → overall miss
    sum += best;
  }
  return sum / tokens.length;
}

/**
 * Typo-tolerant list filter. `fields(item)` returns the searchable strings, the
 * first being the "primary" field (e.g. a name/title) which gets full weight;
 * the rest are matched as a combined haystack at 0.9 weight. Results are filtered
 * by `threshold` and sorted best-first. Empty query → original list unchanged.
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  fields: (item: T) => (string | number | null | undefined)[],
  threshold = 0.5,
): T[] {
  const q = query.trim();
  if (!q) return items;
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const fs = fields(item).filter(v => v != null && v !== '').map(String);
    if (!fs.length) continue;
    const primary = fs[0];
    const hay = fs.join('  ');
    const score = Math.max(fuzzyScore(q, primary), fuzzyScore(q, hay) * 0.9);
    if (score >= threshold) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(x => x.item);
}

export type SuggestionKind = 'title' | 'coach' | 'category' | 'name' | 'position' | 'club' | 'tag';
export interface Suggestion { value: string; kind: SuggestionKind; score: number }

/**
 * Build ranked autocomplete suggestions from a corpus of labelled strings.
 * Dedupes case-insensitively, keeps the best score per value, returns top `limit`.
 */
export function buildSuggestions(
  query: string,
  corpus: { value: string; kind: Suggestion['kind'] }[],
  limit = 7,
): Suggestion[] {
  const q = norm(query);
  if (!q) return [];
  const best = new Map<string, Suggestion>();
  for (const { value, kind } of corpus) {
    if (!value) continue;
    const score = fuzzyScore(query, value);
    if (score < 0.5) continue;
    const key = kind + '::' + norm(value);
    const existing = best.get(key);
    if (!existing || score > existing.score) best.set(key, { value, kind, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.value.length - b.value.length).slice(0, limit);
}
