import { ASSESS_MATRICES } from './assessmentMatrices';
import { REPORT_SECTIONS } from './reportSections';

/**
 * Player-profile report helpers. Assessments store NESTED ratings { category: { attr: 1-5 } }.
 * The two report kinds use different taxonomies for their categories:
 *   • Assessment   → ASSESS_MATRICES (Tactical / Technical / Physical / Psychological)
 *   • Player Report → REPORT_SECTIONS (Technical-Attacking … Psychological)
 * These helpers roll a report (or many) up to per-category averages, labelled + coloured via
 * the right taxonomy, for the radar axes + category bars.
 */
export const PLAYER_REPORT = 'Player Report';
export const ASSESSMENT = 'Assessment';

export type NestedRatings = Record<string, Record<string, number> | any>;
export interface CategoryAvg { key: string; label: string; short: string; color: string; avg: number; }

const prettify = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()).trim();

/** A compact axis label for the radar (long section names crowd a small chart). */
const shorten = (label: string) => label
  .replace(/Technical/gi, 'Tech').replace(/Tactical/gi, 'Tac')
  .replace(/Attacking/gi, 'Att').replace(/Defending/gi, 'Def')
  .replace(/Psychological/gi, 'Psych').replace(/\s*-\s*/g, ' ').trim();

const metaFor = (type: string | null | undefined): Record<string, { label: string; color: string }> => {
  const taxo = type === PLAYER_REPORT ? REPORT_SECTIONS : ASSESS_MATRICES;
  const m: Record<string, { label: string; color: string }> = {};
  taxo.forEach((s: any) => { m[s.key] = { label: s.label, color: s.color }; });
  return m;
};

const catInfo = (meta: Record<string, { label: string; color: string }>, cat: string) => {
  const info = meta[cat] || { label: prettify(cat), color: '#00C49A' };
  return { ...info, short: shorten(info.label) };
};

/** Mean of every rated attribute across nested ratings (a single report). */
export function reportAverage(ratings: NestedRatings): number | null {
  const vals: number[] = [];
  Object.entries(ratings || {}).forEach(([k, cat]) => { if (k !== '__comments' && cat && typeof cat === 'object') Object.values(cat).forEach((v: any) => { if (typeof v === 'number' && v > 0) vals.push(v); }); });
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
}

/** Per-category averages for a single nested report, labelled/coloured via its type's taxonomy. */
export function reportCategoryAverages(ratings: NestedRatings, type: string | null | undefined): CategoryAvg[] {
  const meta = metaFor(type);
  return Object.entries(ratings || {}).filter(([k]) => k !== '__comments').map(([cat, attrs]) => {
    const vals = attrs && typeof attrs === 'object' ? (Object.values(attrs).filter(v => typeof v === 'number' && (v as number) > 0) as number[]) : [];
    const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
    return { key: cat, ...catInfo(meta, cat), avg };
  }).filter(c => c.avg > 0);
}

/** Aggregate per-category averages across MANY reports of the same type (the "overall history"). */
export function aggregateCategoryAverages(reports: { ratings: NestedRatings }[], type: string | null | undefined): CategoryAvg[] {
  const sums: Record<string, { s: number; n: number }> = {};
  reports.forEach(r => Object.entries(r.ratings || {}).filter(([k]) => k !== '__comments').forEach(([cat, attrs]) => {
    if (!attrs || typeof attrs !== 'object') return;
    Object.values(attrs).forEach((v: any) => { if (typeof v === 'number' && v > 0) { (sums[cat] ||= { s: 0, n: 0 }); sums[cat].s += v; sums[cat].n++; } });
  }));
  const meta = metaFor(type);
  return Object.entries(sums).map(([cat, { s, n }]) => ({ key: cat, ...catInfo(meta, cat), avg: Math.round((s / n) * 100) / 100 })).filter(c => c.avg > 0);
}

/** Overall mean across many reports (mean of each report's average). */
export function overallAverage(reports: { ratings: NestedRatings }[]): number | null {
  const vals = reports.map(r => reportAverage(r.ratings)).filter((n): n is number => n != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
}
