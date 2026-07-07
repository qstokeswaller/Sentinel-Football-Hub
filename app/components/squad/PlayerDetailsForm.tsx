import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Save, Trash2, ArrowLeftRight, Plus, X } from 'lucide-react';
import { updatePlayer, type Player, type Squad } from '../../services/squadService';
import { uploadAvatar } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { POSITION_GROUPS, FOOT_OPTIONS, birthYears, joinYears } from '../../lib/positions';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { Button } from '../ui/Button';

/** Details tab — full editable player form (mirrors the old player-profile Details tab). */
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

const SectionCard: React.FC<{ icon: string; iconColor: string; title: string; children: React.ReactNode }> = ({ icon, iconColor, title, children }) => (
  <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5 mb-4">
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2"><i className={`fas ${icon}`} style={{ color: iconColor }} />{title}</div>
    {children}
  </div>
);
const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;

const PositionSelect: React.FC<{ value: string; onChange: (v: string) => void; allowNone?: boolean }> = ({ value, onChange, allowNone }) => (
  <Select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">{allowNone ? '— None —' : 'Select…'}</option>
    {POSITION_GROUPS.map(g => <optgroup key={g.label} label={g.label}>{g.positions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>)}
  </Select>
);

export const PlayerDetailsForm: React.FC<{
  player: Player; squads: Squad[]; canEdit: boolean; isAdmin: boolean; onDelete: () => void; onAssign: () => void;
}> = ({ player, canEdit, isAdmin, onDelete, onAssign }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const posParts = (player.position || '').split(',').map(s => s.trim());
  const [f, setF] = useState({
    pos1: posParts[0] || '', pos2: posParts[1] || '', pos3: posParts[2] || '',
    height: player.height || '', weight: player.weight || '', foot: player.foot || 'Right', jersey: String(player.jerseyNumber ?? ''),
    age: player.age ? String(player.age) : '', nationality: player.nationality || '', phone: player.phone || '', email: player.email || '',
    school: player.school || '', newToClub: player.newToClub ? 'true' : 'false', yearJoined: player.yearJoined ? String(player.yearJoined) : '',
    parentName: player.parentName || '', parentPhone: player.parentPhone || '', parentEmail: player.parentEmail || '',
    emergencyContactName: player.emergencyContactName || '', emergencyContactPhone: player.emergencyContactPhone || '', medicalInfo: player.medicalInfo || '',
  });
  const [clubs, setClubs] = useState<string[]>(() => (player.previousClubs || '').split(',').map(s => s.trim()).filter(Boolean));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(player.profileImageUrl || '');
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      let profileImageUrl = player.profileImageUrl || '';
      if (photoFile) profileImageUrl = await uploadAvatar(photoFile);
      const position = [f.pos1, f.pos2, f.pos3].filter(Boolean).join(', ');
      await updatePlayer(player.id, {
        position, height: f.height, weight: f.weight, foot: f.foot,
        jerseyNumber: f.jersey === '' ? null : Number(f.jersey),
        age: f.age === '' ? null : Number(f.age), nationality: f.nationality, phone: f.phone, email: f.email,
        school: f.school, newToClub: f.newToClub === 'true', yearJoined: f.yearJoined === '' ? null : Number(f.yearJoined),
        parentName: f.parentName, parentPhone: f.parentPhone, parentEmail: f.parentEmail,
        emergencyContactName: f.emergencyContactName, emergencyContactPhone: f.emergencyContactPhone, medicalInfo: f.medicalInfo,
        previousClubs: clubs.filter(Boolean).join(', '),
        ...(profileImageUrl ? { profileImageUrl } : {}),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['player', player.id] }); queryClient.invalidateQueries({ queryKey: ['players'] }); showToast('Details saved.', 'success'); },
    onError: (e) => showError(e),
  });

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); };
  const ro = !canEdit;

  return (
    <div>
      {/* Profile photo */}
      <SectionCard icon="fa-camera" iconColor="#2563eb" title="Profile Photo">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xl font-bold overflow-hidden shrink-0">
            {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> : initials(player.name)}
          </div>
          {canEdit && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Camera size={14} /> Upload Photo</Button>
              <p className="text-[11px] text-slate-400 mt-1.5">JPG, PNG or WebP · Max 2MB</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
            </div>
          )}
        </div>
      </SectionCard>

      {/* Football details */}
      <SectionCard icon="fa-futbol" iconColor="#00C49A" title="Football Details">
        <Grid>
          <div><Label>Primary Position</Label>{ro ? <Static v={f.pos1} /> : <PositionSelect value={f.pos1} onChange={v => set('pos1', v)} />}</div>
          <div><Label>Secondary Position <span className="text-slate-400">(optional)</span></Label>{ro ? <Static v={f.pos2} /> : <PositionSelect value={f.pos2} onChange={v => set('pos2', v)} allowNone />}</div>
          <div><Label>Third Position <span className="text-slate-400">(optional)</span></Label>{ro ? <Static v={f.pos3} /> : <PositionSelect value={f.pos3} onChange={v => set('pos3', v)} allowNone />}</div>
          <div><Label>Height (cm)</Label><Input type="number" disabled={ro} value={f.height} onChange={e => set('height', e.target.value)} placeholder="e.g. 175" /></div>
          <div><Label>Weight (kg)</Label><Input type="number" disabled={ro} value={f.weight} onChange={e => set('weight', e.target.value)} placeholder="e.g. 70" /></div>
          <div><Label>Preferred Foot</Label><Select value={f.foot} disabled={ro} onChange={e => set('foot', e.target.value)}>{FOOT_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}</Select></div>
          <div><Label>Jersey Number</Label><Input disabled={ro} value={f.jersey} onChange={e => set('jersey', e.target.value)} placeholder="e.g. 10" /></div>
        </Grid>
      </SectionCard>

      {/* Personal info */}
      <SectionCard icon="fa-user" iconColor="#2563eb" title="Personal Info">
        <Grid>
          <div><Label>Year of Birth</Label><Select value={f.age} disabled={ro} onChange={e => set('age', e.target.value)}><option value="">Select Year</option>{birthYears().map(y => <option key={y} value={y}>{y}</option>)}</Select></div>
          <div><Label>Nationality</Label><Input disabled={ro} value={f.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. South African" /></div>
          <div><Label>Phone Number</Label><Input disabled={ro} value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. 082 123 4567" /></div>
          <div><Label>Email Address</Label><Input type="email" disabled={ro} value={f.email} onChange={e => set('email', e.target.value)} placeholder="e.g. player@email.com" /></div>
          <div><Label>School</Label><Select value={f.school} disabled={ro} onChange={e => set('school', e.target.value)}><option value="">Not Specified</option><option value="TSHS">TSHS</option><option value="External">External</option></Select></div>
          <div><Label>New to Club?</Label><Select value={f.newToClub} disabled={ro} onChange={e => set('newToClub', e.target.value)}><option value="false">No</option><option value="true">Yes</option></Select></div>
          <div><Label>Year Joined Club</Label><Select value={f.yearJoined} disabled={ro} onChange={e => set('yearJoined', e.target.value)}><option value="">Select Year</option>{joinYears().map(y => <option key={y} value={y}>{y}</option>)}</Select></div>
        </Grid>
      </SectionCard>

      {/* Parent / guardian */}
      <SectionCard icon="fa-user-friends" iconColor="#00C49A" title="Parent / Guardian">
        <Grid>
          <div><Label>Parent/Guardian Name</Label><Input disabled={ro} value={f.parentName} onChange={e => set('parentName', e.target.value)} placeholder="e.g. Jane Doe" /></div>
          <div><Label>Parent Phone</Label><Input disabled={ro} value={f.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="e.g. 082 123 4567" /></div>
          <div><Label>Parent Email</Label><Input type="email" disabled={ro} value={f.parentEmail} onChange={e => set('parentEmail', e.target.value)} placeholder="e.g. parent@email.com" /></div>
        </Grid>
      </SectionCard>

      {/* Emergency & medical */}
      <SectionCard icon="fa-first-aid" iconColor="#ef4444" title="Emergency & Medical">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>Emergency Contact Name</Label><Input disabled={ro} value={f.emergencyContactName} onChange={e => set('emergencyContactName', e.target.value)} placeholder="e.g. John Doe Sr." /></div>
          <div><Label>Emergency Contact Phone</Label><Input disabled={ro} value={f.emergencyContactPhone} onChange={e => set('emergencyContactPhone', e.target.value)} placeholder="e.g. 082 987 6543" /></div>
          <div className="sm:col-span-2"><Label>Medical Info <span className="text-slate-400">(allergies, conditions, medications)</span></Label><Textarea rows={2} disabled={ro} value={f.medicalInfo} onChange={e => set('medicalInfo', e.target.value)} placeholder="e.g. Asthmatic — uses inhaler before exercise" /></div>
        </div>
      </SectionCard>

      {/* Club history */}
      <SectionCard icon="fa-history" iconColor="#00C49A" title="Club History">
        <Label>Previous Clubs</Label>
        <div className="space-y-2">
          {(clubs.length ? clubs : ['']).map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input disabled={ro} value={c} onChange={e => setClubs(prev => { const next = prev.length ? [...prev] : ['']; next[i] = e.target.value; return next; })} placeholder="e.g. SuperSport Academy" />
              {canEdit && <button onClick={() => setClubs(prev => prev.filter((_, j) => j !== i))} className="shrink-0 px-2 rounded-lg border border-slate-200 dark:border-sentinel-border text-slate-400 hover:text-rose-500"><X size={15} /></button>}
            </div>
          ))}
        </div>
        {canEdit && <button onClick={() => setClubs(prev => [...prev, ''])} className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand hover:underline"><Plus size={14} /> Add Club</button>}
      </SectionCard>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && <Button variant="ghost" onClick={onDelete} className="text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /> Delete Player</Button>}
            <Button variant="secondary" onClick={onAssign}><ArrowLeftRight size={15} /> Assign Squad</Button>
          </div>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={15} /> {save.isPending ? 'Saving…' : 'Save Details'}</Button>
        </div>
      )}
    </div>
  );
};

const Static: React.FC<{ v: string }> = ({ v }) => <div className="text-sm text-slate-900 dark:text-slate-100 py-2">{v || '—'}</div>;
