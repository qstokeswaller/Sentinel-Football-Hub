import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Coins, FileText, Wand2, TrendingUp, TrendingDown, Wallet, AlertCircle, Lock, Receipt, CheckCircle2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';
import { GridSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { usePricingRules, useInvoices, useTransactions } from '../hooks/useFinancials';
import { useSeasons } from '../hooks/useSeasons';
import { isInSeason } from '../services/seasonsService';
import { MemberFeesView } from '../components/financials/MemberFeesView';
import { usePlayers, useSquads } from '../hooks/useSquads';
import { addPricingRule, updatePricingRule, deletePricingRule, fetchMonthGenerationData, computeInvoicePreviews, insertGeneratedInvoices, addTransaction, deleteTransaction, setInvoicePayment, deleteInvoice, INCOME_CATEGORIES, EXPENSE_CATEGORIES, FEE_CADENCES, FEE_CATEGORIES, type PricingRule, type InvoicePreview, type Invoice } from '../services/financialService';
import { BillPlayersModal } from '../components/financials/BillPlayersModal';
import { aggregateMemberFees } from '../lib/financeAgg';
import { downloadCollectionsPdf } from '../lib/financePdf';
import { TierGate } from '../components/tier/TierGate';
import { downloadCsv } from '../lib/csv';

/**
 * Financials — Group G (business). Pricing rules CRUD + invoice history. The
 * attendance-based invoice Generate flow is a follow-on. Gated to the financials
 * feature (elite) — typically private_coaching clubs.
 */
const TYPES = ['monthly', 'per_session', 'discount', 'penalty', 'other'];
const rand = (n: number) => `R${n.toLocaleString('en-ZA')}`;

type Tab = 'overview' | 'ledger' | 'fees' | 'invoices' | 'pricing' | 'generate';
const TXN_BLANK = { kind: 'expense', category: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10), squadId: '', method: '' };
const FEE_BLANK = { name: '', category: 'Membership', cadence: 'monthly', amount: '', squadId: '', description: '', isActive: true };
const rand2 = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const CADENCE_LABEL: Record<string, string> = { once_off: 'Once-off', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
const INV_STATUS_STYLE: Record<string, string> = { paid: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', sent: 'bg-sky-500/15 text-sky-500', draft: 'bg-slate-500/20 text-slate-400', overdue: 'bg-rose-500/15 text-rose-500' };
// A representative ISO date for an invoice's billing period ("2026-03" → 2026-03-01,
// "2026-Q2" → 2026-04-01, "2026" → 2026-01-01), falling back to when it was created —
// used to place an invoice inside a season or a custom date range.
const invoiceDate = (v: { month: string | null; createdAt: string }): string => {
  const m = v.month || '';
  let x = m.match(/^(\d{4})-(\d{2})$/); if (x) return `${x[1]}-${x[2]}-01`;
  x = m.match(/^(\d{4})-Q([1-4])$/); if (x) return `${x[1]}-${String((+x[2] - 1) * 3 + 1).padStart(2, '0')}-01`;
  x = m.match(/^(\d{4})$/); if (x) return `${x[1]}-01-01`;
  return (v.createdAt || '').slice(0, 10);
};

const FinancialsInner: React.FC = () => {
  const { effectiveClubId, club } = useAppState();
  const { showToast, showError } = useToast();
  const { canManage } = usePermissions();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const { user } = useAuth();
  const { data: players } = usePlayers();
  const { data: squads } = useSquads();
  const { data: rules, isLoading: rLoading } = usePricingRules();
  const { data: invoices, isLoading: iLoading } = useInvoices(tab === 'invoices' || tab === 'overview');
  const { data: transactions } = useTransactions(tab === 'overview' || tab === 'ledger');
  const { data: seasons } = useSeasons();

  // Club ledger — income + expenses.
  const [txnOpen, setTxnOpen] = useState(false);
  const [txn, setTxn] = useState(TXN_BLANK);
  const openTxn = (kind: 'income' | 'expense') => { setTxn({ ...TXN_BLANK, kind }); setTxnOpen(true); };
  const saveTxn = useMutation({
    mutationFn: () => addTransaction(effectiveClubId!, user?.id ?? null, txn),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); showToast(`${txn.kind === 'income' ? 'Income' : 'Expense'} recorded.`, 'success'); setTxnOpen(false); },
    onError: (e) => showError(e),
  });
  const delTxn = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); showToast('Entry removed.', 'success'); },
    onError: (e) => showError(e),
  });
  const squadName = (id: string | null) => squads?.find(s => s.id === id)?.name || '—';

  // Club fees + billing + payments.
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [editFee, setEditFee] = useState<PricingRule | null>(null);
  const [feeForm, setFeeForm] = useState(FEE_BLANK);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billInitialFee, setBillInitialFee] = useState<PricingRule | null>(null);
  const [invSquad, setInvSquad] = useState('all');
  const [invStatus, setInvStatus] = useState('all');
  const [invType, setInvType] = useState('all'); // fee category (Membership / Kit / …) — "outstanding by type"
  // Invoices tab: collections view (by member/squad) vs the raw invoice list, + a period lens.
  const [invView, setInvView] = useState<'member' | 'invoice'>('member');
  const [invPeriodMode, setInvPeriodMode] = useState<'all' | 'season' | 'custom'>('all');
  const [invSeasonId, setInvSeasonId] = useState('');
  const [invFrom, setInvFrom] = useState('');
  const [invTo, setInvTo] = useState('');
  const [payInv, setPayInv] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payStatus, setPayStatus] = useState('paid');

  const fees = useMemo(() => (rules || []).filter(r => r.type === 'fee'), [rules]);
  const orionRules = useMemo(() => (rules || []).filter(r => r.type !== 'fee'), [rules]);
  const feePlayers = (fee: PricingRule) => (players || []).filter(p => !fee.squadId || p.squadId === fee.squadId);

  const openFeeAdd = () => { setEditFee(null); setFeeForm(FEE_BLANK); setFeeModalOpen(true); };
  const openFeeEdit = (r: PricingRule) => { setEditFee(r); setFeeForm({ name: r.name, category: r.category || 'Membership', cadence: r.cadence || 'monthly', amount: String(r.amount), squadId: r.squadId || '', description: r.description || '', isActive: r.isActive }); setFeeModalOpen(true); };
  const openBill = (r: PricingRule | null) => { setBillInitialFee(r); setBillModalOpen(true); };
  const openPay = (v: Invoice) => { setPayInv(v); setPayAmount(String(v.total)); setPayMethod(v.method || ''); setPayStatus('paid'); };

  const saveFee = useMutation({
    mutationFn: async () => {
      const payload = { name: feeForm.name.trim(), type: 'fee', category: feeForm.category, cadence: feeForm.cadence, amount: Number(feeForm.amount) || 0, squadId: feeForm.squadId || null, description: feeForm.description, isActive: feeForm.isActive };
      if (editFee) await updatePricingRule(editFee.id, payload); else await addPricingRule(effectiveClubId!, payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pricing-rules'] }); showToast(editFee ? 'Fee updated.' : 'Fee added.', 'success'); setFeeModalOpen(false); },
    onError: (e) => showError(e),
  });
  const delFee = useMutation({ mutationFn: (r: PricingRule) => deletePricingRule(r.id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pricing-rules'] }); showToast('Fee removed.', 'success'); }, onError: (e) => showError(e) });
  const markPay = useMutation({
    mutationFn: () => setInvoicePayment(payInv!.id, payStatus, Number(payAmount) || 0, payMethod || null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); showToast('Payment recorded.', 'success'); setPayInv(null); },
    onError: (e) => showError(e),
  });
  const delInv = useMutation({ mutationFn: (id: string) => deleteInvoice(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); showToast('Invoice deleted.', 'success'); }, onError: (e) => showError(e) });

  const invSeason = useMemo(() => (seasons || []).find(s => s.id === invSeasonId) || null, [seasons, invSeasonId]);
  // Map each invoice to a payment TYPE via its pricing rule's category (one-off/unknown → "Other").
  const ruleCat = useMemo(() => Object.fromEntries((rules || []).map(r => [r.id, r.category || 'Other'])), [rules]);
  const invTypeOf = (v: Invoice) => (v.pricingRuleId ? (ruleCat[v.pricingRuleId] || 'Other') : 'Other');
  const invTypes = useMemo(() => [...new Set((invoices || []).map(invTypeOf))].sort(), [invoices, ruleCat]);
  const inInvPeriod = (v: Invoice) => {
    if (invPeriodMode === 'all') return true;
    const d = invoiceDate(v);
    if (invPeriodMode === 'season') return isInSeason(null, d, invSeason);
    if (invFrom && d < invFrom) return false;
    if (invTo && d > invTo) return false;
    return true;
  };
  const filteredInvoices = useMemo(() => (invoices || []).filter(v =>
    (invSquad === 'all' || v.playerSquadId === invSquad) && (invStatus === 'all' || v.status === invStatus) &&
    (invType === 'all' || invTypeOf(v) === invType) && inInvPeriod(v)
  ), [invoices, invSquad, invStatus, invType, invPeriodMode, invSeasonId, invFrom, invTo, seasons, ruleCat]);
  const memberGroups = useMemo(() => aggregateMemberFees(filteredInvoices, squadName), [filteredInvoices]); // eslint-disable-line react-hooks/exhaustive-deps
  const invPeriodLabel = invPeriodMode === 'season' ? (invSeason?.name || 'Season') : invPeriodMode === 'custom' ? `${invFrom || '…'} – ${invTo || '…'}` : 'All-time';

  const summary = useMemo(() => {
    const txs = transactions || [];
    const ledgerIncome = txs.filter(t => t.kind === 'income').reduce((n, t) => n + t.amount, 0);
    const expenses = txs.filter(t => t.kind === 'expense').reduce((n, t) => n + t.amount, 0);
    const collected = (invoices || []).reduce((n, v) => n + (v.paidAmount || 0), 0);
    const outstanding = (invoices || []).filter(v => v.status !== 'paid').reduce((n, v) => n + Math.max(0, v.total - (v.paidAmount || 0)), 0);
    const income = ledgerIncome + collected;
    const byCat: Record<string, { income: number; expense: number }> = {};
    txs.forEach(t => { const c = t.category || 'Uncategorised'; const b = byCat[c] || (byCat[c] = { income: 0, expense: 0 }); b[t.kind] += t.amount; });
    const cats = Object.entries(byCat).map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
    return { income, collected, expenses, net: income - expenses, outstanding, cats };
  }, [transactions, invoices]);

  // Per-team financial breakdown (ledger + collected/outstanding fees), like the analytics team view.
  const byTeam = useMemo(() => {
    const map: Record<string, { income: number; expense: number; collected: number; outstanding: number }> = {};
    const get = (k: string) => map[k] || (map[k] = { income: 0, expense: 0, collected: 0, outstanding: 0 });
    (transactions || []).forEach(t => { get(t.squadId || 'none')[t.kind] += t.amount; });
    (invoices || []).forEach(v => { const m = get(v.playerSquadId || 'none'); m.collected += v.paidAmount || 0; if (v.status !== 'paid') m.outstanding += Math.max(0, v.total - (v.paidAmount || 0)); });
    return Object.entries(map).map(([sid, m]) => ({ squadId: sid === 'none' ? null : sid, name: sid === 'none' ? 'Whole club / unassigned' : squadName(sid), ...m, net: m.income + m.collected - m.expense }))
      .sort((a, b) => b.net - a.net);
  }, [transactions, invoices, squads]);

  // Ledger filters (general + specific — mirrors the analytics filter model).
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');
  const [ledgerSquad, setLedgerSquad] = useState('all');
  const [ledgerKind, setLedgerKind] = useState('all');
  const [ledgerCat, setLedgerCat] = useState('all');
  const ledgerCats = useMemo(() => [...new Set((transactions || []).map(t => t.category).filter(Boolean))] as string[], [transactions]);
  const ledgerRows = useMemo(() => (transactions || []).filter(t =>
    (!ledgerFrom || (t.date || '') >= ledgerFrom) && (!ledgerTo || (t.date || '') <= ledgerTo) &&
    (ledgerSquad === 'all' || (ledgerSquad === 'none' ? !t.squadId : t.squadId === ledgerSquad)) &&
    (ledgerKind === 'all' || t.kind === ledgerKind) &&
    (ledgerCat === 'all' || (t.category || '') === ledgerCat)
  ), [transactions, ledgerFrom, ledgerTo, ledgerSquad, ledgerKind, ledgerCat]);
  const ledgerHasFilter = !!(ledgerFrom || ledgerTo || ledgerSquad !== 'all' || ledgerKind !== 'all' || ledgerCat !== 'all');

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [previews, setPreviews] = useState<InvoicePreview[] | null>(null);
  const [loadingGen, setLoadingGen] = useState(false);
  const loadMonth = async () => {
    if (!month) return showToast('Pick a month.', 'error');
    setLoadingGen(true);
    try {
      const data = await fetchMonthGenerationData(effectiveClubId!, month);
      setPreviews(computeInvoicePreviews((players || []).map(p => ({ id: p.id, name: p.name })), data, rules || []));
    } catch (e) { showError(e); } finally { setLoadingGen(false); }
  };
  const generate = useMutation({
    mutationFn: () => insertGeneratedInvoices(effectiveClubId!, user?.id ?? null, month, previews || []),
    onSuccess: (n) => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); showToast(`Generated ${n} invoice${n === 1 ? '' : 's'}.`, 'success'); setPreviews(null); setTab('invoices'); },
    onError: (e) => showError(e),
  });

  const [editRule, setEditRule] = useState<PricingRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'monthly', amount: '', description: '', isActive: true });

  const openAdd = () => { setEditRule(null); setForm({ name: '', type: 'monthly', amount: '', description: '', isActive: true }); setModalOpen(true); };
  const openEdit = (r: PricingRule) => { setEditRule(r); setForm({ name: r.name, type: r.type, amount: String(r.amount), description: r.description || '', isActive: r.isActive }); setModalOpen(true); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), type: form.type, amount: Number(form.amount) || 0, description: form.description, isActive: form.isActive };
      if (editRule) await updatePricingRule(editRule.id, payload);
      else await addPricingRule(effectiveClubId!, payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pricing-rules'] }); showToast(editRule ? 'Rule updated.' : 'Rule added.', 'success'); setModalOpen(false); },
    onError: (e) => showError(e),
  });
  const delMutation = useMutation({
    mutationFn: (r: PricingRule) => deletePricingRule(r.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pricing-rules'] }); showToast('Rule deleted.', 'success'); },
    onError: (e) => showError(e),
  });

  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
  const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';
  const LABEL = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1';

  // Finances are admin-only.
  if (!canManage) return (
    <div className={`${card} p-10 text-center max-w-md mx-auto mt-10`}>
      <Lock size={28} className="mx-auto mb-3 text-slate-400" />
      <div className="font-bold text-slate-900 dark:text-white mb-1">Financials are admin-only</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">Only club admins can view and manage finances.</p>
    </div>
  );

  return (
    <div>
      <PageToolbar
        title="Financials"
        description="Club income, expenses, fees & invoicing."
        dataTour="financials-main"
        left={<div className="overflow-x-auto min-w-0 max-w-full"><PillTabs value={tab} onChange={id => setTab(id as Tab)} tabs={[
          { id: 'overview', label: 'Overview' }, { id: 'ledger', label: 'Ledger' }, { id: 'fees', label: 'Fees' },
          { id: 'invoices', label: 'Invoices' }, { id: 'pricing', label: 'Pricing' }, { id: 'generate', label: 'Generate' },
        ]} /></div>}
      />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`${card} p-5`}><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><TrendingUp size={14} className="text-emerald-500" /> Income</div><div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{rand2(summary.income)}</div>{summary.collected > 0 && <div className="text-[11px] text-slate-400 mt-0.5">incl. {rand2(summary.collected)} collected fees</div>}</div>
            <div className={`${card} p-5`}><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><TrendingDown size={14} className="text-rose-500" /> Expenses</div><div className="text-2xl font-bold text-rose-500 mt-1">{rand2(summary.expenses)}</div></div>
            <div className={`${card} p-5`}><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><Wallet size={14} className="text-brand" /> Net Balance</div><div className={'text-2xl font-bold mt-1 ' + (summary.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500')}>{rand2(summary.net)}</div></div>
            <div className={`${card} p-5`}><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400"><AlertCircle size={14} className="text-amber-500" /> Outstanding Fees</div><div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{rand2(summary.outstanding)}</div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">By Category</h3>
              {summary.cats.length === 0 ? <div className="py-6 text-center text-slate-400 text-sm">No income or expenses recorded yet — add them on the Ledger tab.</div> : (
                <div className="space-y-2">
                  {summary.cats.map(c => (
                    <div key={c.name} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0">
                      <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                      <span className="flex items-center gap-4">{c.income > 0 && <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{rand2(c.income)}</span>}{c.expense > 0 && <span className="text-rose-500 tabular-nums">−{rand2(c.expense)}</span>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">By Team</h3>
                {byTeam.length > 0 && <button onClick={() => downloadCsv('finances-by-team', ['Team', 'Ledger income', 'Collected fees', 'Expenses', 'Outstanding', 'Net'], byTeam.map(t => [t.name, t.income, t.collected, t.expense, t.outstanding, t.net]))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"><i className="fas fa-file-csv" /> CSV</button>}
              </div>
              {byTeam.length === 0 ? <div className="py-6 text-center text-slate-400 text-sm">No team-linked income, expenses or fees yet.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className="py-2 pr-2 font-semibold">Team</th><th className="px-2 text-right font-semibold">In</th><th className="px-2 text-right font-semibold">Out</th><th className="px-2 text-right font-semibold">Owed</th><th className="px-2 text-right font-semibold">Net</th></tr></thead>
                    <tbody>
                      {byTeam.map(t => (
                        <tr key={t.squadId || 'none'} onClick={() => { setInvView('member'); setInvSquad(t.squadId || 'all'); setTab('invoices'); }}
                          title="View this squad's member fees" className="border-b border-slate-100 dark:border-white/5 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">{t.name}</td>
                          <td className="px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{rand2(t.income + t.collected)}</td>
                          <td className="px-2 text-right tabular-nums text-rose-500">{rand2(t.expense)}</td>
                          <td className="px-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{t.outstanding ? rand2(t.outstanding) : '—'}</td>
                          <td className={'px-2 text-right tabular-nums font-semibold ' + (t.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500')}>{rand2(t.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>From</span><DatePicker value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)} className="w-40" /></label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>To</span><DatePicker value={ledgerTo} onChange={e => setLedgerTo(e.target.value)} className="w-40" /></label>
            <Select value={ledgerKind} onChange={e => setLedgerKind(e.target.value)} className="w-32"><option value="all">All types</option><option value="income">Income</option><option value="expense">Expenses</option></Select>
            <Select value={ledgerSquad} onChange={e => setLedgerSquad(e.target.value)} className="w-44"><option value="all">All squads</option><option value="none">Whole club</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            {ledgerCats.length > 0 && <Select value={ledgerCat} onChange={e => setLedgerCat(e.target.value)} className="w-40"><option value="all">All categories</option>{ledgerCats.map(c => <option key={c} value={c}>{c}</option>)}</Select>}
            {ledgerHasFilter && <button onClick={() => { setLedgerFrom(''); setLedgerTo(''); setLedgerSquad('all'); setLedgerKind('all'); setLedgerCat('all'); }} className="text-xs text-slate-400 hover:text-brand">Clear</button>}
            <div className="ml-auto flex items-center gap-2">
              {ledgerRows.length > 0 && <button onClick={() => downloadCsv('club-ledger', ['Date', 'Type', 'Category', 'Description', 'Squad', 'Method', 'Amount'], ledgerRows.map(t => [t.date, t.kind, t.category || '', t.description || '', t.squadId ? squadName(t.squadId) : 'Whole club', t.method || '', t.amount]))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"><i className="fas fa-file-csv" /> CSV</button>}
              <Button variant="secondary" onClick={() => openTxn('income')}><TrendingUp size={15} /> Income</Button>
              <Button variant="primary" onClick={() => openTxn('expense')}><TrendingDown size={15} /> Expense</Button>
            </div>
          </div>
          {!transactions?.length ? <div className={`${card} p-12 text-center text-slate-400`}><Wallet size={26} className="mx-auto mb-3 opacity-60" />No income or expenses recorded yet.</div>
            : !ledgerRows.length ? <div className={`${card} p-12 text-center text-slate-400`}>No entries match your filter.</div> : (
            <div className={`${card} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                    <th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Description</th><th className="px-4 py-3 font-semibold">Squad</th><th className="px-4 py-3 font-semibold text-right">Amount</th><th className="px-2"></th>
                  </tr></thead>
                  <tbody>
                    {ledgerRows.map(t => (
                      <tr key={t.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{t.date || '—'}</td>
                        <td className="px-4 py-2.5"><span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 ' + (t.kind === 'income' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-500')}>{t.category || (t.kind === 'income' ? 'Income' : 'Expense')}</span></td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{t.description || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{t.squadId ? squadName(t.squadId) : '—'}</td>
                        <td className={'px-4 py-2.5 text-right font-semibold tabular-nums ' + (t.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>{t.kind === 'income' ? '+' : '−'}{rand2(t.amount)}</td>
                        <td className="px-2 text-right"><button onClick={() => delTxn.mutate(t.id)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'fees' && (
        <>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <p className="text-sm text-slate-500 dark:text-slate-400">Membership, kit &amp; registration fees — set them up, then bill a squad, a subset, or individuals.</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => openBill(null)}><Receipt size={15} /> Bill / charge players</Button>
              <Button variant="primary" onClick={openFeeAdd}><Plus size={16} /> Add Fee</Button>
            </div>
          </div>
          {!fees.length ? <div className={`${card} p-12 text-center text-slate-400`}><Receipt size={26} className="mx-auto mb-3 opacity-60" />No fees yet. Add a membership or kit fee to start billing.</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fees.map(r => (
                <div key={r.id} className={`${card} p-5`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{r.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {r.category && <span className="text-[11px] font-semibold rounded bg-brand/10 text-brand px-1.5 py-0.5">{r.category}</span>}
                        <span className="text-[11px] font-semibold rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 px-1.5 py-0.5">{CADENCE_LABEL[r.cadence || ''] || r.cadence}</span>
                        {!r.isActive && <span className="text-[11px] text-slate-400">Inactive</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openFeeEdit(r)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Pencil size={14} /></button>
                      <button onClick={() => delFee.mutate(r)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{rand(r.amount)}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.squadId ? squadName(r.squadId) : 'Whole club'} · {feePlayers(r).length} player{feePlayers(r).length === 1 ? '' : 's'}</div>
                  {r.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.description}</p>}
                  <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => openBill(r)}><Receipt size={14} /> Bill this fee</Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'pricing' && (
        <>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <p className="text-sm text-slate-500 dark:text-slate-400">Attendance-based pricing (per-session / monthly) for coaching invoicing.</p>
            <Button variant="primary" onClick={openAdd}><Plus size={16} /> Add Rule</Button>
          </div>
          {rLoading ? <GridSkeleton count={3} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
            : !orionRules.length ? <div className="py-12 text-center text-slate-400"><Coins size={26} className="mx-auto mb-3 opacity-60" />No pricing rules yet.</div>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {orionRules.map(r => (
                  <div key={r.id} className={`${card} p-5`}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{r.name}</div>
                        <span className="text-[11px] font-semibold rounded bg-brand/10 text-brand px-1.5 py-0.5 inline-block mt-1 capitalize">{r.type.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Pencil size={14} /></button>
                        <button onClick={() => delMutation.mutate(r)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{rand(r.amount)}</div>
                    {r.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.description}</p>}
                    {!r.isActive && <span className="mt-2 inline-block text-[11px] text-slate-400">Inactive</span>}
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {tab === 'invoices' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* By member = the collections view (squad → player standing); By invoice = the raw list. */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden shrink-0">
              <button onClick={() => setInvView('member')} className={'px-3 py-1.5 text-xs font-semibold ' + (invView === 'member' ? 'bg-brand text-[#0D1B2A]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>By member</button>
              <button onClick={() => setInvView('invoice')} className={'px-3 py-1.5 text-xs font-semibold border-l border-slate-200 dark:border-sentinel-border ' + (invView === 'invoice' ? 'bg-brand text-[#0D1B2A]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>By invoice</button>
            </div>
            <Select value={invSquad} onChange={e => setInvSquad(e.target.value)} className="w-44"><option value="all">All squads</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select value={invStatus} onChange={e => setInvStatus(e.target.value)} className="w-40"><option value="all">All statuses</option><option value="sent">Sent (unpaid)</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="draft">Draft</option></Select>
            {invTypes.length > 1 && <Select value={invType} onChange={e => setInvType(e.target.value)} className="w-40"><option value="all">All types</option>{invTypes.map(t => <option key={t} value={t}>{t}</option>)}</Select>}
            <Select value={invPeriodMode} onChange={e => setInvPeriodMode(e.target.value as 'all' | 'season' | 'custom')} className="w-36"><option value="all">All-time</option>{(seasons || []).length > 0 && <option value="season">By season</option>}<option value="custom">Custom range</option></Select>
            {invPeriodMode === 'season' && <Select value={invSeasonId} onChange={e => setInvSeasonId(e.target.value)} className="w-44"><option value="">Select season…</option>{(seasons || []).map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}</Select>}
            {invPeriodMode === 'custom' && <>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>From</span><DatePicker value={invFrom} onChange={e => setInvFrom(e.target.value)} className="w-36" /></label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>To</span><DatePicker value={invTo} onChange={e => setInvTo(e.target.value)} className="w-36" /></label>
            </>}
            {(invSquad !== 'all' || invStatus !== 'all' || invType !== 'all' || invPeriodMode !== 'all') && <button onClick={() => { setInvSquad('all'); setInvStatus('all'); setInvType('all'); setInvPeriodMode('all'); setInvSeasonId(''); setInvFrom(''); setInvTo(''); }} className="text-xs text-slate-400 hover:text-brand">Clear</button>}
            {filteredInvoices.length > 0 && <div className="ml-auto flex items-center gap-2">
              {invView === 'member' && <button onClick={() => downloadCollectionsPdf(club?.name || 'Sentinel Football Hub', memberGroups, invPeriodLabel)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"><i className="fas fa-file-pdf" /> PDF</button>}
              <button onClick={() => downloadCsv('invoices', ['Player', 'Squad', 'Type', 'Period', 'Total', 'Paid', 'Outstanding', 'Status', 'Method'], filteredInvoices.map(v => [v.playerName, squadName(v.playerSquadId), invTypeOf(v), v.month || '', v.total, v.paidAmount, Math.max(0, v.total - (v.paidAmount || 0)), v.status, v.method || '']))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"><i className="fas fa-file-csv" /> CSV</button>
            </div>}
          </div>
          {iLoading ? <TableSkeleton rows={6} cols={6} />
            : invView === 'member' ? (
              (invoices?.length ? <MemberFeesView groups={memberGroups} onRecordPay={openPay} onDelete={(id) => delInv.mutate(id)} />
                : <div className={`${card} p-12 text-center text-slate-400`}><FileText size={26} className="mx-auto mb-3 opacity-60" />No invoices yet — bill a fee to create them.</div>)
            ) : !filteredInvoices.length ? <div className={`${card} p-12 text-center text-slate-400`}><FileText size={26} className="mx-auto mb-3 opacity-60" />{invoices?.length ? 'No invoices match your filter.' : 'No invoices yet — bill a fee to create them.'}</div>
            : (
              <div className={`${card} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                      <th className="px-4 py-3 font-semibold">Player</th><th className="px-4 py-3 font-semibold">Squad</th><th className="px-4 py-3 font-semibold">Period</th><th className="px-4 py-3 font-semibold text-right">Total</th><th className="px-4 py-3 font-semibold text-right">Paid</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-2"></th>
                    </tr></thead>
                    <tbody>
                      {filteredInvoices.map(v => (
                        <tr key={v.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">{v.playerName}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{v.playerSquadId ? squadName(v.playerSquadId) : '—'}</td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{v.month || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white tabular-nums">{rand(v.total)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{v.paidAmount ? rand(v.paidAmount) : '—'}</td>
                          <td className="px-4 py-2.5"><span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 capitalize ' + (INV_STATUS_STYLE[v.status] || INV_STATUS_STYLE.draft)}>{v.status}</span></td>
                          <td className="px-2 text-right whitespace-nowrap">
                            {v.status !== 'paid' && <button onClick={() => openPay(v)} title="Record payment" className="p-1.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10"><CheckCircle2 size={15} /></button>}
                            <button onClick={() => delInv.mutate(v.id)} title="Delete invoice" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      )}

      {tab === 'generate' && (
        <div>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div><label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Month</label><input type="month" value={month} onChange={e => { setMonth(e.target.value); setPreviews(null); }} className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand" /></div>
            <Button variant="secondary" onClick={loadMonth} disabled={loadingGen}><Wand2 size={15} /> {loadingGen ? 'Loading…' : 'Load Month'}</Button>
            {previews && previews.some(p => p.attended > 0 && !p.alreadyInvoiced) && (
              <Button variant="primary" className="ml-auto" onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? 'Generating…' : `Generate ${previews.filter(p => p.attended > 0 && !p.alreadyInvoiced).length} invoices`}</Button>
            )}
          </div>
          {!previews ? (
            <div className={`${card} p-10 text-center text-slate-400`}><Wand2 size={26} className="mx-auto mb-3 opacity-60" />Pick a month and load attendance to preview invoices.</div>
          ) : !previews.some(p => p.attended > 0) ? (
            <div className={`${card} p-10 text-center text-slate-400`}>No attended sessions found for this month. Make sure sessions have a completed register.</div>
          ) : (
            <div className={`${card} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                  <th className="px-4 py-3 font-semibold">Player</th><th className="px-4 py-3 text-center font-semibold">Sessions</th><th className="px-4 py-3 font-semibold">Total</th><th className="px-4 py-3 font-semibold">Status</th>
                </tr></thead>
                <tbody>
                  {previews.filter(p => p.attended > 0).map(p => (
                    <tr key={p.playerId} className="border-b border-slate-100 dark:border-white/5">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                      <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{p.attended}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{rand(p.total)}</td>
                      <td className="px-4 py-3">{p.alreadyInvoiced ? <span className="text-[11px] text-slate-400">Already invoiced</span> : <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-brand/15 text-brand">Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRule ? 'Edit Pricing Rule' : 'Add Pricing Rule'} size="md"
          footer={<>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={saveMutation.isPending} onClick={() => { if (!form.name.trim()) return showToast('Name is required.', 'error'); saveMutation.mutate(); }}>{saveMutation.isPending ? 'Saving…' : (editRule ? 'Save' : 'Add Rule')}</Button>
          </>}>
          <form onSubmit={e => { e.preventDefault(); if (!form.name.trim()) return showToast('Name is required.', 'error'); saveMutation.mutate(); }} className="space-y-4">
            <div><label className={LABEL}>Name *</label><input className={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Subscription" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Type</label><Select className="capitalize" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</Select></div>
              <div><label className={LABEL}>Amount (R)</label><input type="number" step="0.01" className={INPUT} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            </div>
            <div><label className={LABEL}>Description</label><textarea className={INPUT + ' resize-none h-16'} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /> Active</label>
            <button type="submit" className="hidden" />
          </form>
        </Modal>
      )}

      {txnOpen && (
        <Modal open onClose={() => setTxnOpen(false)} title={txn.kind === 'income' ? 'Add Income' : 'Add Expense'} size="md"
          footer={<>
            <Button variant="ghost" onClick={() => setTxnOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={saveTxn.isPending} onClick={() => { if (!txn.amount || Number(txn.amount) <= 0) return showToast('Enter an amount.', 'error'); saveTxn.mutate(); }}>{saveTxn.isPending ? 'Saving…' : 'Save'}</Button>
          </>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Type</label><Select value={txn.kind} onChange={e => setTxn(t => ({ ...t, kind: e.target.value, category: '' }))}><option value="expense">Expense</option><option value="income">Income</option></Select></div>
              <div><label className={LABEL}>Amount (R) *</label><input type="number" step="0.01" className={INPUT} value={txn.amount} onChange={e => setTxn(t => ({ ...t, amount: e.target.value }))} autoFocus /></div>
              <div><label className={LABEL}>Category</label><Select value={txn.category} onChange={e => setTxn(t => ({ ...t, category: e.target.value }))}><option value="">— Select —</option>{(txn.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div><label className={LABEL}>Date</label><DatePicker value={txn.date} onChange={e => setTxn(t => ({ ...t, date: e.target.value }))} /></div>
              <div><label className={LABEL}>Squad (optional)</label><Select value={txn.squadId} onChange={e => setTxn(t => ({ ...t, squadId: e.target.value }))}><option value="">Whole club</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
              <div><label className={LABEL}>Method (optional)</label><input className={INPUT} value={txn.method} onChange={e => setTxn(t => ({ ...t, method: e.target.value }))} placeholder="Cash, EFT, ref…" /></div>
            </div>
            <div><label className={LABEL}>Description</label><textarea className={INPUT + ' resize-none h-16'} value={txn.description} onChange={e => setTxn(t => ({ ...t, description: e.target.value }))} placeholder="e.g. Home kit order (20 shirts)" /></div>
          </div>
        </Modal>
      )}

      {feeModalOpen && (
        <Modal open onClose={() => setFeeModalOpen(false)} title={editFee ? 'Edit Fee' : 'Add Fee'} size="md"
          footer={<>
            <Button variant="ghost" onClick={() => setFeeModalOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={saveFee.isPending} onClick={() => { if (!feeForm.name.trim()) return showToast('Name is required.', 'error'); saveFee.mutate(); }}>{saveFee.isPending ? 'Saving…' : (editFee ? 'Save' : 'Add Fee')}</Button>
          </>}>
          <div className="space-y-4">
            <div><label className={LABEL}>Name *</label><input className={INPUT} value={feeForm.name} onChange={e => setFeeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly membership" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Category</label><Select value={feeForm.category} onChange={e => setFeeForm(f => ({ ...f, category: e.target.value }))}>{FEE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div><label className={LABEL}>Cadence</label><Select value={feeForm.cadence} onChange={e => setFeeForm(f => ({ ...f, cadence: e.target.value }))}>{FEE_CADENCES.map(c => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}</Select></div>
              <div><label className={LABEL}>Amount (R) *</label><input type="number" step="0.01" className={INPUT} value={feeForm.amount} onChange={e => setFeeForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label className={LABEL}>Applies to</label><Select value={feeForm.squadId} onChange={e => setFeeForm(f => ({ ...f, squadId: e.target.value }))}><option value="">Whole club</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
            </div>
            <div><label className={LABEL}>Description</label><textarea className={INPUT + ' resize-none h-14'} value={feeForm.description} onChange={e => setFeeForm(f => ({ ...f, description: e.target.value }))} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={feeForm.isActive} onChange={e => setFeeForm(f => ({ ...f, isActive: e.target.checked }))} /> Active</label>
          </div>
        </Modal>
      )}

      <BillPlayersModal open={billModalOpen} onClose={() => setBillModalOpen(false)}
        clubId={effectiveClubId} createdBy={user?.id ?? null} fees={fees} squads={squads || []} players={players || []}
        initialFee={billInitialFee} onBilled={(n) => { if (n) setTab('invoices'); }} />

      {payInv && (
        <Modal open onClose={() => setPayInv(null)} title={`Record payment — ${payInv.playerName}`} size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setPayInv(null)}>Cancel</Button>
            <Button variant="primary" disabled={markPay.isPending} onClick={() => markPay.mutate()}>{markPay.isPending ? 'Saving…' : 'Record'}</Button>
          </>}>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Invoice total: <b>{rand(payInv.total)}</b>{payInv.month ? ` · ${payInv.month}` : ''}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Status</label><Select value={payStatus} onChange={e => setPayStatus(e.target.value)}><option value="paid">Paid in full</option><option value="partial">Partial</option></Select></div>
            <div><label className={LABEL}>Amount received (R)</label><input type="number" step="0.01" className={INPUT} value={payAmount} onChange={e => setPayAmount(e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL}>Method / reference</label><input className={INPUT} value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="Cash, EFT ref…" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const FinancialsPage: React.FC = () => (
  <TierGate feature="financials" label="Financials" description="Invoicing is available on the Elite plan for private-coaching clubs.">
    <FinancialsInner />
  </TierGate>
);
