import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Copy, Trash2, UserPlus, Mail } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useAppState } from '../../context/AppStateContext';
import { fetchClubMembers, updateMemberRole } from '../../services/settingsService';
import { fetchClubInvites, createClubInvite, revokeClubInvite, inviteLink, type ClubInvite } from '../../services/platformAdminService';
import { ROLE_LABELS } from '../../lib/roles';

/**
 * Platform-admin member management for any club — same capability club admins get in
 * Settings → Staff: see/change member roles, and invite new members (token link). RLS
 * (platform_admins_* policies on club_invites) lets a platform admin manage any club.
 * Email auto-send via Resend/Supabase SMTP is coming; for now the invite link is copied.
 */
const INVITE_ROLES = ['admin', 'coach', 'scout', 'viewer'];

export const ClubMembersModal: React.FC<{ club: { id: string; name: string } | null; onClose: () => void }> = ({ club, onClose }) => {
  const { user } = useAuth();
  const { profile } = useAppState();
  const { showToast, showError } = useToast();
  const qc = useQueryClient();
  const clubId = club?.id;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('coach');
  const [revoke, setRevoke] = useState<ClubInvite | null>(null);

  const members = useQuery({ queryKey: ['club-members', clubId], queryFn: () => fetchClubMembers(clubId!), enabled: !!clubId });
  const invites = useQuery({ queryKey: ['club-invites', clubId], queryFn: () => fetchClubInvites(clubId!), enabled: !!clubId });

  const copy = (token: string) => { navigator.clipboard?.writeText(inviteLink(token)); showToast('Invite link copied — send it to the new member.', 'success'); };
  const roleMut = useMutation({ mutationFn: ({ id, r }: { id: string; r: string }) => updateMemberRole(id, r), onSuccess: () => { qc.invalidateQueries({ queryKey: ['club-members', clubId] }); showToast('Role updated.', 'success'); }, onError: (e) => showError(e) });
  const create = useMutation({
    mutationFn: async () => {
      const to = email.trim();
      const token = await createClubInvite(clubId!, user?.id ?? '', to, role);
      // Auto-send the branded invite email (Resend). If it isn't configured yet, we fall
      // back to copying the link — the invite row + token are valid either way.
      let emailed = false;
      try {
        const res = await fetch('/api/send-org-invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to, role: role === 'admin' ? 'admin' : 'member',
            acceptUrl: inviteLink(token), orgName: club?.name || '',
            inviterName: profile?.full_name || 'Sentinel Football Hub',
          }),
        });
        emailed = res.ok;
      } catch { emailed = false; }
      return { token, emailed, to };
    },
    onSuccess: ({ token, emailed, to }) => {
      qc.invalidateQueries({ queryKey: ['club-invites', clubId] });
      setEmail('');
      if (emailed) showToast(`Invite emailed to ${to}.`, 'success');
      else copy(token);
    },
    onError: (e) => showError(e),
  });
  const revokeMut = useMutation({ mutationFn: (i: ClubInvite) => revokeClubInvite(i.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['club-invites', clubId] }); showToast('Invite revoked.', 'success'); setRevoke(null); }, onError: (e) => showError(e) });

  if (!club) return null;
  const heading = 'text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5';
  const row = 'flex items-center gap-2 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2';

  return (
    <>
      <Modal open={!!club} onClose={onClose} title={`Members · ${club.name}`} size="xl">
        <div className="space-y-5">
          {/* Invite */}
          <div className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg p-3">
            <div className={heading}><UserPlus size={13} /> Invite a member</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@club.com" className="flex-1" />
              <Select value={role} onChange={e => setRole(e.target.value)} className="sm:w-36 shrink-0">{INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}</Select>
              <Button variant="primary" disabled={create.isPending || !email.trim()} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Invite'}</Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5"><Mail size={12} className="shrink-0" /> The invite is emailed automatically once email is configured; until then the link is copied to your clipboard to share.</p>
          </div>

          {/* Pending invites */}
          {!!invites.data?.length && (
            <div>
              <div className={heading}>Pending invites ({invites.data.length})</div>
              <div className="space-y-1.5">
                {invites.data.map(i => (
                  <div key={i.id} className={row + ' text-sm'}>
                    <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">{i.email || 'Anyone with the link'}</span>
                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-brand/10 text-brand">{ROLE_LABELS[i.role] || i.role}</span>
                    <button onClick={() => copy(i.token)} title="Copy invite link" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Copy size={14} /></button>
                    <button onClick={() => setRevoke(i)} title="Revoke invite" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members */}
          <div>
            <div className={heading}><Users size={13} /> Members {members.data ? `(${members.data.length})` : ''}</div>
            {members.isLoading ? <div className="py-4 text-center text-slate-400 text-sm"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
              : !members.data?.length ? <p className="text-sm text-slate-400">No members yet — invite the first one above.</p>
                : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {members.data.map(m => (
                      <div key={m.id} className={row + ' gap-3'}>
                        <div className="w-8 h-8 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold shrink-0">{(m.fullName || '?').slice(0, 2).toUpperCase()}</div>
                        <span className="flex-1 min-w-0 truncate text-sm text-slate-900 dark:text-white">{m.fullName}</span>
                        {m.role === 'super_admin'
                          ? <span className="text-xs font-semibold text-violet-400 shrink-0">Super Admin</span>
                          : <Select value={m.role} onChange={e => roleMut.mutate({ id: m.id, r: e.target.value })} className="w-32 shrink-0">{INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}</Select>}
                      </div>
                    ))}
                  </div>
                )}
          </div>
        </div>
      </Modal>
      {revoke && <ConfirmModal open onClose={() => setRevoke(null)} onConfirm={() => revokeMut.mutate(revoke)} title="Revoke this invite?" message={`The invite link for ${revoke.email || 'this club'} will stop working.`} confirmLabel="Revoke" busyLabel="Revoking…" busy={revokeMut.isPending} />}
    </>
  );
};
