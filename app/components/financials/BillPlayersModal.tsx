import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Search, Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { useToast } from '../../context/ToastContext';
import { billPlayers, type PricingRule } from '../../services/financialService';

/**
 * BillPlayersModal — the club's charge/bill flow. Instead of adding a charge to players
 * one at a time, an admin picks a charge (an existing fee OR a one-off amount), a period,
 * an optional due date, then chooses recipients: a whole squad, a subset of a squad, or
 * hand-picked individuals across squads. Creates one invoice per selected player.
 * Amounts are South African Rand.
 */
const CADENCE_PERIOD = (cadence: string | null) => {
  const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
  if (cadence === 'annual') return String(y);
  if (cadence === 'quarterly') return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  if (cadence === 'once_off') return String(y);
  return `${y}-${m}`;
};
const rand = (n: number) => `R${(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;
const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';
const LABEL = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1';

interface Props {
  open: boolean;
  onClose: () => void;
  clubId: string | null;
  createdBy: string | null;
  fees: PricingRule[];
  squads: { id: string; name: string }[];
  players: { id: string; name: string; squadId: string | null }[];
  initialFee?: PricingRule | null;
  onBilled?: (n: number) => void;
}

export const BillPlayersModal: React.FC<Props> = ({ open, onClose, clubId, createdBy, fees, squads, players, initialFee, onBilled }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [chargeType, setChargeType] = useState<'fee' | 'oneoff'>('fee');
  const [feeId, setFeeId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [squadFilter, setSquadFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const squadName = (id: string | null) => squads.find(s => s.id === id)?.name || 'Unassigned';

  // Seed the form each time the modal opens (from a fee card, or blank for a general charge).
  useEffect(() => {
    if (!open) return;
    if (initialFee) {
      setChargeType('fee'); setFeeId(initialFee.id); setPeriod(CADENCE_PERIOD(initialFee.cadence));
      const sq = initialFee.squadId || 'all'; setSquadFilter(sq);
      // Default to billing the whole squad the fee targets (deselect any you don't want).
      setSelected(new Set(players.filter(p => !initialFee.squadId || p.squadId === initialFee.squadId).map(p => p.id)));
    } else {
      setChargeType(fees.length ? 'fee' : 'oneoff'); setFeeId(fees[0]?.id || ''); setPeriod(CADENCE_PERIOD(null));
      setSquadFilter('all'); setSelected(new Set());
    }
    setName(''); setAmount(''); setDueDate(''); setSearch('');
  }, [open, initialFee]); // eslint-disable-line react-hooks/exhaustive-deps

  const fee = useMemo(() => fees.find(f => f.id === feeId) || null, [fees, feeId]);
  const effAmount = chargeType === 'fee' ? (fee?.amount || 0) : (Number(amount) || 0);
  const effName = chargeType === 'fee' ? (fee?.name || '') : name.trim();

  const visible = useMemo(() => players
    .filter(p => squadFilter === 'all' || (squadFilter === 'none' ? !p.squadId : p.squadId === squadFilter))
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [players, squadFilter, search]);
  const visibleIds = visible.map(p => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => setSelected(s => {
    const n = new Set(s);
    if (allVisibleSelected) visibleIds.forEach(id => n.delete(id)); else visibleIds.forEach(id => n.add(id));
    return n;
  });

  const bill = useMutation({
    mutationFn: () => billPlayers(clubId!, createdBy, {
      ruleId: chargeType === 'fee' ? feeId : null,
      name: effName, category: chargeType === 'fee' ? fee?.category : null,
      amount: effAmount, period: period.trim(), dueDate: dueDate || null,
    }, [...selected]),
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast(n ? `Billed ${n} player${n === 1 ? '' : 's'} · ${rand(effAmount)} each.` : 'Everyone selected was already billed for this period.', n ? 'success' : 'error');
      onBilled?.(n); onClose();
    },
    onError: (e) => showError(e),
  });

  const canBill = !!clubId && effAmount > 0 && !!effName && !!period.trim() && selected.size > 0;
  const submit = () => {
    if (!effName) return showToast(chargeType === 'fee' ? 'Pick a fee.' : 'Enter a charge name.', 'error');
    if (effAmount <= 0) return showToast('Enter an amount greater than zero.', 'error');
    if (!period.trim()) return showToast('Enter a billing period.', 'error');
    if (!selected.size) return showToast('Select at least one player to bill.', 'error');
    bill.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="Bill / charge players" size="xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canBill || bill.isPending} onClick={submit}>
          {bill.isPending ? 'Billing…' : `Bill ${selected.size} player${selected.size === 1 ? '' : 's'}${effAmount > 0 ? ` · ${rand(effAmount * selected.size)}` : ''}`}
        </Button>
      </>}>
      <div className="space-y-4">
        {/* Charge type */}
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden text-sm">
          <button onClick={() => setChargeType('fee')} disabled={!fees.length}
            className={'px-3 py-1.5 font-semibold ' + (chargeType === 'fee' ? 'bg-brand text-[#0D1B2A]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40')}>Existing fee</button>
          <button onClick={() => setChargeType('oneoff')}
            className={'px-3 py-1.5 font-semibold border-l border-slate-200 dark:border-sentinel-border ' + (chargeType === 'oneoff' ? 'bg-brand text-[#0D1B2A]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}>One-off charge</button>
        </div>

        {/* Charge details */}
        <div className="grid grid-cols-2 gap-3">
          {chargeType === 'fee' ? (
            <div className="col-span-2 sm:col-span-1"><label className={LABEL}>Fee</label>
              <Select value={feeId} onChange={e => setFeeId(e.target.value)}>{fees.length ? fees.map(f => <option key={f.id} value={f.id}>{f.name} · {rand(f.amount)}</option>) : <option value="">No fees defined</option>}</Select>
            </div>
          ) : (
            <div className="col-span-2 sm:col-span-1"><label className={LABEL}>Charge name *</label>
              <input className={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tournament levy" autoFocus />
            </div>
          )}
          <div><label className={LABEL}>Amount (R) {chargeType === 'oneoff' && '*'}</label>
            {chargeType === 'fee'
              ? <input className={INPUT + ' opacity-70'} value={fee ? rand(fee.amount) : '—'} readOnly />
              : <input type="number" step="0.01" min="0" className={INPUT} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />}
          </div>
          <div><label className={LABEL}>Billing period *</label><input className={INPUT} value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-03" /></div>
          <div><label className={LABEL}>Due date (optional)</label><DatePicker value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        </div>

        {/* Recipients */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><Users size={13} /> Recipients</label>
            <span className="text-xs font-semibold text-brand">{selected.size} selected</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Select value={squadFilter} onChange={e => setSquadFilter(e.target.value)} className="w-44">
              <option value="all">All squads</option><option value="none">Unassigned</option>
              {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" className={INPUT + ' pl-9'} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden">
            <button onClick={toggleAllVisible} disabled={!visibleIds.length}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40">
              <span className={'w-4 h-4 rounded border flex items-center justify-center ' + (allVisibleSelected ? 'bg-brand border-brand text-[#0D1B2A]' : 'border-slate-300 dark:border-slate-600')}>{allVisibleSelected && <Check size={11} />}</span>
              Select all{squadFilter !== 'all' ? ' in squad' : ''} ({visibleIds.length})
            </button>
            <div className="max-h-56 overflow-y-auto">
              {visible.length === 0 ? <div className="px-3 py-6 text-center text-sm text-slate-400">No players match.</div> : visible.map(p => {
                const on = selected.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-50 dark:border-white/5 last:border-0">
                    <span className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (on ? 'bg-brand border-brand text-[#0D1B2A]' : 'border-slate-300 dark:border-slate-600')}>{on && <Check size={11} />}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100 flex-1 truncate">{p.name}</span>
                    {squadFilter === 'all' && <span className="text-[11px] text-slate-400 shrink-0">{squadName(p.squadId)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">One invoice per selected player{chargeType === 'fee' ? '. Players already billed this fee for this period are skipped.' : '.'}</p>
        </div>
      </div>
    </Modal>
  );
};
