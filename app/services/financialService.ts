import { supabase } from '../lib/supabase';

/**
 * Financials data — ported from src/js/financials-ui.js. Pricing rules + invoices.
 * Attendance-based invoice generation (Generate tab) is a follow-on increment.
 */
export interface PricingRule {
  id: string; name: string; type: string; amount: number; description: string | null;
  isActive: boolean; sortOrder: number;
  cadence: string | null; category: string | null; squadId: string | null;
}
export interface Invoice {
  id: string; playerId: string | null; month: string | null; status: string;
  subtotal: number; discount: number; penalties: number; total: number;
  notes: string | null; lineItems: any[]; createdAt: string; playerName: string;
  paidAmount: number; paidAt: string | null; method: string | null; pricingRuleId: string | null; playerSquadId: string | null;
}
export const FEE_CADENCES = ['once_off', 'monthly', 'quarterly', 'annual'];
export const FEE_CATEGORIES = ['Membership', 'Kit', 'Registration', 'Tour', 'Match fees', 'Other'];

export async function fetchPricingRules(clubId: string | null): Promise<PricingRule[]> {
  let q = supabase.from('pricing_rules').select('*').order('sort_order', { ascending: true }).limit(200);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id, name: r.name, type: r.type, amount: Number(r.amount) || 0, description: r.description,
    isActive: r.is_active !== false, sortOrder: r.sort_order || 0,
    cadence: r.cadence || null, category: r.category || null, squadId: r.squad_id || null,
  }));
}

export async function addPricingRule(clubId: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('pricing_rules').insert({
    club_id: clubId, name: data.name, type: data.type, amount: data.amount,
    description: data.description || null, is_active: data.isActive !== false,
    cadence: data.cadence || null, category: data.category || null, squad_id: data.squadId || null,
  });
  if (error) throw error;
}
export async function updatePricingRule(id: string, data: Record<string, any>): Promise<void> {
  const row: Record<string, any> = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.type !== undefined) row.type = data.type;
  if (data.amount !== undefined) row.amount = data.amount;
  if (data.description !== undefined) row.description = data.description || null;
  if (data.isActive !== undefined) row.is_active = data.isActive;
  if (data.cadence !== undefined) row.cadence = data.cadence || null;
  if (data.category !== undefined) row.category = data.category || null;
  if (data.squadId !== undefined) row.squad_id = data.squadId || null;
  const { error } = await supabase.from('pricing_rules').update(row).eq('id', id);
  if (error) throw error;
}

// ── Club fee billing → per-player invoices, and payment tracking ──
export async function generateFeeInvoices(clubId: string, createdBy: string | null, fee: PricingRule, period: string, players: { id: string }[], dueDate: string | null): Promise<number> {
  const { data: existing } = await supabase.from('invoices').select('player_id').eq('club_id', clubId).eq('pricing_rule_id', fee.id).eq('month', period).limit(5000);
  const done = new Set((existing || []).map((i: any) => i.player_id));
  const rows = players.filter(p => !done.has(p.id)).map(p => ({
    club_id: clubId, player_id: p.id, pricing_rule_id: fee.id, month: period, status: 'sent',
    subtotal: fee.amount, discount: 0, penalties: 0, total: fee.amount,
    line_items: [{ description: `${fee.category ? fee.category + ' — ' : ''}${fee.name}`, amount: fee.amount }],
    due_date: dueDate || null, created_by: createdBy,
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('invoices').insert(rows);
  if (error) throw error;
  return rows.length;
}

/**
 * Flexible billing — create one invoice per selected player for either an existing fee
 * (rule) or a one-off charge (ruleId null). This is the "select a squad → whole squad,
 * a subset, or individual players → charge them" flow, so admins never add a charge one
 * player at a time. For fee-based charges we skip players already billed for that rule +
 * period (idempotent re-bill); one-off charges have no natural dedup key so each run inserts.
 */
export async function billPlayers(
  clubId: string, createdBy: string | null,
  charge: { ruleId: string | null; name: string; category?: string | null; amount: number; period: string; dueDate: string | null },
  playerIds: string[],
): Promise<number> {
  let targets = playerIds;
  if (charge.ruleId) {
    const { data: existing } = await supabase.from('invoices').select('player_id').eq('club_id', clubId).eq('pricing_rule_id', charge.ruleId).eq('month', charge.period).limit(5000);
    const done = new Set((existing || []).map((i: any) => i.player_id));
    targets = playerIds.filter(id => !done.has(id));
  }
  if (!targets.length) return 0;
  const desc = `${charge.category ? charge.category + ' — ' : ''}${charge.name}`;
  const rows = targets.map(id => ({
    club_id: clubId, player_id: id, pricing_rule_id: charge.ruleId, month: charge.period, status: 'sent',
    subtotal: charge.amount, discount: 0, penalties: 0, total: charge.amount,
    line_items: [{ description: desc, amount: charge.amount }],
    due_date: charge.dueDate || null, created_by: createdBy,
  }));
  const { error } = await supabase.from('invoices').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function setInvoicePayment(id: string, status: string, paidAmount: number, method: string | null): Promise<void> {
  const row: Record<string, any> = { status, paid_amount: paidAmount, method: method || null };
  row.paid_at = status === 'paid' ? new Date().toISOString() : null;
  const { error } = await supabase.from('invoices').update(row).eq('id', id);
  if (error) throw error;
}
export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}
export async function deletePricingRule(id: string): Promise<void> {
  const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
  if (error) throw error;
}

// ── Invoice generation (attendance → draft invoices) ──
export interface InvoicePreview {
  playerId: string; name: string; attended: number; lineItems: any[];
  subtotal: number; total: number; alreadyInvoiced: boolean;
}

interface MonthData { sessions: any[]; absentBySession: Record<string, Set<string>>; recorded: Set<string>; existingPlayerIds: Set<string>; }

export async function fetchMonthGenerationData(clubId: string, month: string): Promise<MonthData> {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

  const [sessRes, exRes] = await Promise.all([
    supabase.from('sessions').select('id, title, date, player_ids').eq('club_id', clubId).gte('date', start).lte('date', end).order('date').limit(500),
    supabase.from('invoices').select('player_id').eq('club_id', clubId).eq('month', month).limit(5000),
  ]);
  const sessions = sessRes.data || [];

  let attendance: any[] = [];
  if (sessions.length) {
    const { data } = await supabase.from('training_attendance').select('session_id, absent_player_ids').in('session_id', sessions.map((s: any) => s.id));
    attendance = data || [];
  }
  const absentBySession: Record<string, Set<string>> = {};
  const recorded = new Set<string>();
  attendance.forEach((a: any) => { recorded.add(a.session_id); absentBySession[a.session_id] = new Set(Array.isArray(a.absent_player_ids) ? a.absent_player_ids : []); });

  return { sessions, absentBySession, recorded, existingPlayerIds: new Set((exRes.data || []).map((i: any) => i.player_id)) };
}

/** Pure compute: per-player attended sessions × pricing → preview invoices. */
export function computeInvoicePreviews(players: { id: string; name: string }[], data: MonthData, rules: PricingRule[]): InvoicePreview[] {
  const monthly = rules.find(r => r.isActive && (r.type === 'monthly' || r.type === 'tier'));
  const perSession = rules.find(r => r.isActive && r.type === 'per_session');
  const perRate = perSession?.amount || 350;

  return players.map(p => {
    const attendedSessions = data.sessions.filter((s: any) => {
      if (!data.recorded.has(s.id)) return false;                       // register completed
      const planned = Array.isArray(s.player_ids) ? s.player_ids : [];
      if (planned.length && !planned.includes(p.id)) return false;      // player rostered
      return !(data.absentBySession[s.id]?.has(p.id));                  // not absent
    });
    const attended = attendedSessions.length;
    const lineItems: any[] = [];
    let total = 0;
    if (attended > 0) {
      if (monthly) {
        total = monthly.amount;
        lineItems.push({ description: `${monthly.name} (${attended} sessions)`, amount: monthly.amount });
      } else {
        total = attended * perRate;
        attendedSessions.forEach((s: any) => lineItems.push({ date: s.date, description: `Session — ${s.title || 'Training'}`, amount: perRate }));
      }
    }
    return { playerId: p.id, name: p.name, attended, lineItems, subtotal: total, total, alreadyInvoiced: data.existingPlayerIds.has(p.id) };
  });
}

export async function insertGeneratedInvoices(clubId: string, createdBy: string | null, month: string, previews: InvoicePreview[]): Promise<number> {
  const rows = previews.filter(p => p.attended > 0 && !p.alreadyInvoiced).map(p => ({
    club_id: clubId, player_id: p.playerId, month, status: 'draft',
    subtotal: p.subtotal, discount: 0, penalties: 0, total: p.total, line_items: p.lineItems, created_by: createdBy,
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from('invoices').insert(rows);
  if (error) throw error;
  return rows.length;
}

// ── Club ledger (transactions) — general income + expenses beyond player invoices ──
export interface Transaction {
  id: string; kind: 'income' | 'expense'; category: string | null; description: string | null;
  amount: number; date: string | null; squadId: string | null; seasonId: string | null; method: string | null; createdAt: string;
}
export const INCOME_CATEGORIES = ['Membership fees', 'Match fees', 'Sponsorship', 'Fundraising', 'Kit sales', 'Grants', 'Other income'];
export const EXPENSE_CATEGORIES = ['Kit & equipment', 'Venue hire', 'Referees', 'Travel', 'Registration', 'Coaching', 'Medical', 'Admin', 'Other'];

export async function fetchTransactions(clubId: string | null): Promise<Transaction[]> {
  let q = supabase.from('transactions').select('*').order('date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(3000);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((t: any) => ({
    id: t.id, kind: t.kind, category: t.category, description: t.description, amount: Number(t.amount) || 0,
    date: t.date, squadId: t.squad_id, seasonId: t.season_id, method: t.method, createdAt: t.created_at,
  }));
}
export async function addTransaction(clubId: string, createdBy: string | null, d: { kind: string; category: string; description: string; amount: string; date: string; squadId: string; method: string; seasonId?: string | null }): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    club_id: clubId, created_by: createdBy, kind: d.kind, category: d.category || null, description: d.description || null,
    amount: Number(d.amount) || 0, date: d.date || null, squad_id: d.squadId || null, season_id: d.seasonId || null, method: d.method || null,
  });
  if (error) throw error;
}
export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchInvoices(clubId: string | null): Promise<Invoice[]> {
  let iq = supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(500);
  if (clubId) iq = iq.eq('club_id', clubId);
  let pq = supabase.from('players').select('id, name, squad_id');
  if (clubId) pq = pq.eq('club_id', clubId);
  const [{ data: invoices, error }, { data: players }] = await Promise.all([iq, pq]);
  if (error) throw error;
  const names: Record<string, string> = Object.fromEntries((players || []).map((p: any) => [p.id, p.name]));
  const psquad: Record<string, string | null> = Object.fromEntries((players || []).map((p: any) => [p.id, p.squad_id]));
  return (invoices || []).map((v: any) => ({
    id: v.id, playerId: v.player_id, month: v.month, status: v.status || 'draft',
    subtotal: Number(v.subtotal) || 0, discount: Number(v.discount) || 0, penalties: Number(v.penalties) || 0,
    total: Number(v.total) || 0, notes: v.notes, lineItems: v.line_items || [], createdAt: v.created_at,
    playerName: v.player_id ? (names[v.player_id] || 'Unknown') : '—',
    paidAmount: Number(v.paid_amount) || 0, paidAt: v.paid_at || null, method: v.method || null,
    pricingRuleId: v.pricing_rule_id || null, playerSquadId: v.player_id ? (psquad[v.player_id] || null) : null,
  }));
}
