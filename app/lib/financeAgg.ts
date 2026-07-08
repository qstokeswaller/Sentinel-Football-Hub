import type { Invoice } from '../services/financialService';

/**
 * Shared fee-collection aggregation: roll a flat list of invoices up per PLAYER, grouped
 * by SQUAD (each player's current squad). One source of truth for the Invoices "By member"
 * view, its CSV, and the branded PDF statement — so the screen and the exports always agree.
 */
export interface MemberAgg {
  id: string; name: string; squadId: string | null; invoices: Invoice[];
  billed: number; paid: number; outstanding: number; overdue: boolean; lastPaidAt: string | null;
}
export interface SquadFeeGroup {
  squadId: string | null; name: string; players: MemberAgg[];
  billed: number; paid: number; outstanding: number; arrears: number;
}

export function aggregateMemberFees(invoices: Invoice[], squadName: (id: string | null) => string): SquadFeeGroup[] {
  const pmap = new Map<string, MemberAgg>();
  invoices.forEach(v => {
    const key = v.playerId || v.playerName || v.id;
    let p = pmap.get(key);
    if (!p) { p = { id: key, name: v.playerName || '—', squadId: v.playerSquadId, invoices: [], billed: 0, paid: 0, outstanding: 0, overdue: false, lastPaidAt: null }; pmap.set(key, p); }
    p.invoices.push(v);
    p.billed += v.total || 0; p.paid += v.paidAmount || 0; p.outstanding += Math.max(0, (v.total || 0) - (v.paidAmount || 0));
    if (v.status === 'overdue') p.overdue = true;
    if (v.paidAt && (!p.lastPaidAt || v.paidAt > p.lastPaidAt)) p.lastPaidAt = v.paidAt;
  });
  const gmap = new Map<string, MemberAgg[]>();
  [...pmap.values()].forEach(p => { const k = p.squadId || 'none'; if (!gmap.has(k)) gmap.set(k, []); gmap.get(k)!.push(p); });
  return [...gmap.entries()].map(([sid, ps]) => ({
    squadId: sid === 'none' ? null : sid,
    name: sid === 'none' ? 'No squad / unassigned' : squadName(sid),
    players: ps.sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name)),
    billed: ps.reduce((n, p) => n + p.billed, 0), paid: ps.reduce((n, p) => n + p.paid, 0), outstanding: ps.reduce((n, p) => n + p.outstanding, 0),
    arrears: ps.filter(p => p.outstanding > 0).length,
  })).sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}

export const memberStatus = (p: MemberAgg) => p.overdue ? 'Overdue' : p.outstanding > 0 ? 'Owing' : p.billed > 0 ? 'Paid up' : '—';
