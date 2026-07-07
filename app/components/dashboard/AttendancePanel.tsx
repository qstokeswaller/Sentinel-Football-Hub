import React, { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, X, UserCheck, Save } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { useSquads, usePlayers } from '../../hooks/useSquads';
import { fetchAttendance, saveAttendance, positionOrder } from '../../services/attendanceService';
import type { CalSession } from '../../services/calendarService';

/**
 * Mark training attendance for a session — ported from training-register-ui.js.
 * Resolves the squad from session.team, applies archetype defaults (academy =
 * present, private_coaching = absent), loads any existing record, saves to
 * training_attendance. Reused by the Dashboard Attendance tab.
 */

const initials = (n: string) => (n || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);

export const AttendancePanel: React.FC<{ session: CalSession; onSaved?: () => void; onClose?: () => void }> = ({ session, onSaved, onClose }) => {
  const { archetype, effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const { data: squads } = useSquads();
  const { data: players } = usePlayers();
  const isPrivate = archetype === 'private_coaching';

  // Resolve squad from the session's team name(s)
  const { squadId, squadName } = useMemo(() => {
    const teamNames = (session.team || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const matched = (squads || []).find(s => teamNames.includes(s.name.trim().toLowerCase()));
    const sq = matched || (squads || [])[0];
    return { squadId: sq?.id || '', squadName: sq?.name || '' };
  }, [session.team, squads]);

  const planned = useMemo(() => new Set(session.playerIds || []), [session.playerIds]);

  // Roster: for private+planned show only the planned players; otherwise the whole squad.
  const roster = useMemo(() => {
    let list = (players || []).filter(p => p.squadId === squadId);
    if (isPrivate && planned.size) list = list.filter(p => planned.has(p.id));
    return [...list].sort((a, b) => (positionOrder(a.position) - positionOrder(b.position)) || a.name.localeCompare(b.name));
  }, [players, squadId, isPrivate, planned]);

  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing record / apply archetype defaults whenever the session or roster changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rec = squadId ? await fetchAttendance(session.id, squadId) : null;
      if (cancelled) return;
      if (rec) {
        setAbsent(new Set(rec.absentPlayerIds));
        setNotes(rec.notes);
        setSaved(true);
      } else {
        const ids = roster.map(p => p.id);
        let init: string[] = [];
        if (isPrivate) init = planned.size ? [] : ids;                 // private: planned present, else all absent
        else init = planned.size ? ids.filter(id => !planned.has(id)) : []; // academy: non-planned absent, else all present
        setAbsent(new Set(init));
        setNotes('');
        setSaved(false);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, squadId, roster.length]);

  const toggle = (id: string) => {
    setAbsent(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setSaved(false);
  };

  const present = roster.length - absent.size;

  const mutation = useMutation({
    mutationFn: () => saveAttendance({
      clubId: effectiveClubId!, sessionId: session.id, squadId, date: session.date,
      absentPlayerIds: [...absent], present, total: roster.length, notes: notes.trim(),
    }),
    onSuccess: () => { setSaved(true); showToast(`Attendance saved — ${present}/${roster.length} present`, 'success'); onSaved?.(); },
    onError: (e) => showError(e),
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5 mt-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserCheck size={18} className="text-brand" /> Mark Attendance — {session.title || 'Session'}
        </h3>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1"><Check size={13} /> Saved</span>}
          {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={16} /></button>}
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        {session.date} {squadName && `· ${squadName}`} · click a player to mark them {isPrivate ? 'present' : 'absent'}.
      </p>

      {loading ? (
        <div className="py-8 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
      ) : !squadId ? (
        <div className="py-8 text-center text-slate-400">No squad matched this session's team.</div>
      ) : !roster.length ? (
        <div className="py-8 text-center text-slate-400">No players in this squad.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {roster.map(p => {
              const isAbsent = absent.has(p.id);
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={'flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm transition-colors ' +
                    (isAbsent
                      ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300'
                      : 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
                  <span className="w-6 h-6 rounded-full bg-white/70 dark:bg-black/20 flex items-center justify-center text-[10px] font-bold">{initials(p.name)}</span>
                  <span className="font-medium">{p.name}</span>
                  <span className="opacity-60 text-xs">{p.position || ''}</span>
                  {isAbsent ? <X size={13} /> : <Check size={13} />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-sm mb-4">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{present} Present</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">{absent.size} Absent</span>
            <span className="text-slate-500">{roster.length} Total</span>
          </div>

          <textarea value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }} placeholder="Notes (optional) — e.g. pitch waterlogged, moved indoors…"
            className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand resize-none h-16 mb-3" />

          <div className="flex justify-end">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors disabled:opacity-50">
              <Save size={15} /> {mutation.isPending ? 'Saving…' : 'Save Attendance'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
