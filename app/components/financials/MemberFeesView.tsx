import React, { useState } from 'react';
import { CheckCircle2, Trash2, ChevronDown } from 'lucide-react';
import { memberStatus, type MemberAgg, type SquadFeeGroup } from '../../lib/financeAgg';
import type { Invoice } from '../../services/financialService';

/**
 * MemberFeesView — the club "collections" lens on the Invoices tab. Invoices are
 * aggregated per PLAYER, grouped by SQUAD (using each player's current squad), so a
 * treasurer can see, per squad: total billed / collected / outstanding + who is in
 * arrears — then expand a player to see and settle their individual invoices.
 *
 * It receives invoices already scoped by the parent's squad/status/period filters, so
 * the period control (overall / season / custom) flows straight through.
 */
const rand = (n: number) => `R${(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;
const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
const INV_STATUS: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  sent: 'bg-sky-500/15 text-sky-500', draft: 'bg-slate-500/20 text-slate-400', overdue: 'bg-rose-500/15 text-rose-500',
};

const memberStatusStyle = (p: MemberAgg) => p.overdue ? 'bg-rose-500/15 text-rose-500' : p.outstanding > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';

interface Props {
  groups: SquadFeeGroup[];
  onRecordPay: (v: Invoice) => void;
  onDelete: (id: string) => void;
}

export const MemberFeesView: React.FC<Props> = ({ groups, onRecordPay, onDelete }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!groups.length) return <div className={`${card} p-12 text-center text-slate-400`}>No invoices match this period or filter.</div>;

  const th = 'px-3 py-2 text-left text-[11px] uppercase tracking-wider text-slate-400 font-semibold';
  const td = 'px-3 py-2.5';

  return (
    <div className="space-y-4">
      {groups.map(g => {
        const rate = g.billed > 0 ? Math.round(g.paid / g.billed * 100) : 0;
        return (
          <div key={g.squadId || 'none'} className={`${card} overflow-hidden`}>
            {/* Squad summary header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-sentinel-border flex flex-wrap items-center gap-x-6 gap-y-1.5 bg-slate-50 dark:bg-sentinel-bg">
              <div className="font-bold text-slate-900 dark:text-white">{g.name} <span className="text-slate-400 font-normal text-sm">· {g.players.length} player{g.players.length === 1 ? '' : 's'}</span></div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm ml-auto">
                <span className="text-slate-500 dark:text-slate-400">Billed <b className="text-slate-900 dark:text-white tabular-nums">{rand(g.billed)}</b></span>
                <span className="text-slate-500 dark:text-slate-400">Collected <b className="text-emerald-600 dark:text-emerald-400 tabular-nums">{rand(g.paid)}</b></span>
                <span className="text-slate-500 dark:text-slate-400">Outstanding <b className={'tabular-nums ' + (g.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')}>{rand(g.outstanding)}</b></span>
                <span className={'text-xs font-semibold rounded-full px-2 py-0.5 ' + (rate >= 90 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : rate >= 60 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-rose-500/15 text-rose-500')}>{rate}% collected</span>
                {g.arrears > 0 && <span className="text-xs font-semibold text-rose-500">{g.arrears} in arrears</span>}
              </div>
            </div>
            {/* Player rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 dark:border-white/5"><th className={th}>Player</th><th className={th + ' text-center'}>Invoices</th><th className={th + ' text-right'}>Billed</th><th className={th + ' text-right'}>Paid</th><th className={th + ' text-right'}>Outstanding</th><th className={th}>Status</th><th className={th}>Last payment</th><th className="px-2"></th></tr></thead>
                <tbody>
                  {g.players.map(p => (
                    <React.Fragment key={p.id}>
                      <tr onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer">
                        <td className={td}><div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-brand/15 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">{initials(p.name)}</span><span className="font-medium text-slate-900 dark:text-white">{p.name}</span></div></td>
                        <td className={td + ' text-center text-slate-500 dark:text-slate-400'}>{p.invoices.length}</td>
                        <td className={td + ' text-right tabular-nums text-slate-700 dark:text-slate-200'}>{rand(p.billed)}</td>
                        <td className={td + ' text-right tabular-nums text-emerald-600 dark:text-emerald-400'}>{rand(p.paid)}</td>
                        <td className={td + ' text-right tabular-nums font-semibold ' + (p.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')}>{p.outstanding > 0 ? rand(p.outstanding) : '—'}</td>
                        <td className={td}><span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 ' + memberStatusStyle(p)}>{memberStatus(p)}</span></td>
                        <td className={td + ' text-slate-500 dark:text-slate-400 whitespace-nowrap'}>{fmtDate(p.lastPaidAt)}</td>
                        <td className="px-2 text-right"><ChevronDown size={15} className={'text-slate-400 transition-transform inline ' + (expanded === p.id ? 'rotate-180' : '')} /></td>
                      </tr>
                      {expanded === p.id && (
                        <tr className="bg-slate-50/60 dark:bg-white/5"><td colSpan={8} className="px-3 py-2">
                          <div className="space-y-1">
                            {[...p.invoices].sort((a, b) => (b.month || '').localeCompare(a.month || '')).map(v => (
                              <div key={v.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-white dark:hover:bg-white/5">
                                <span className="text-slate-500 dark:text-slate-400 w-20 shrink-0">{v.month || '—'}</span>
                                <span className={'font-semibold rounded-full px-2 py-0.5 capitalize ' + (INV_STATUS[v.status] || INV_STATUS.draft)}>{v.status}</span>
                                <span className="tabular-nums text-slate-700 dark:text-slate-200">{rand(v.total)}</span>
                                <span className="tabular-nums text-slate-400">paid {rand(v.paidAmount)}</span>
                                <span className="ml-auto flex items-center gap-1">
                                  {v.status !== 'paid' && <button onClick={e => { e.stopPropagation(); onRecordPay(v); }} title="Record payment" className="p-1.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10"><CheckCircle2 size={14} /></button>}
                                  <button onClick={e => { e.stopPropagation(); onDelete(v.id); }} title="Delete invoice" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={13} /></button>
                                </span>
                              </div>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};
