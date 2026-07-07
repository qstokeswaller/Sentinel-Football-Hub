import { jsPDF } from 'jspdf';

/**
 * Player-dossier PDF — a crisp, vector (text-based) export built from the dossier
 * snapshot. No html2canvas/screenshotting; lays out the same data the share page shows.
 */
const BRAND: [number, number, number] = [0, 196, 154];
const NAVY: [number, number, number] = [13, 27, 42];
const SLATE: [number, number, number] = [100, 116, 139];

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const PILLARS: [string, string][] = [['tactical', 'Tactical'], ['technical', 'Technical'], ['physical', 'Physical'], ['psychological', 'Psychological']];
const isGKPos = (p?: string | null) => { const s = (p || '').toUpperCase(); return s.includes('GK') || s.includes('GOAL'); };
const avgOf = (obj: any): number | null => { if (!obj || typeof obj !== 'object') return typeof obj === 'number' && obj > 0 ? obj : null; const nums = Object.values(obj).filter(v => typeof v === 'number' && (v as number) > 0) as number[]; return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null; };
const parseRatings = (r: any) => { if (typeof r === 'string') { try { return JSON.parse(r); } catch { return {}; } } return r || {}; };

export function downloadPlayerDossierPdf(data: any): void {
  const { player, squad, club, match_stats } = data;
  const stats = (match_stats || []) as any[];
  const assessments = (data.assessments || (data.latest_assessment ? [data.latest_assessment] : [])) as any[];
  const seasonMatches = data.season_matches || 0;
  const media = data.media || { gallery: [], highlights: [] };
  const gk = isGKPos(player.position);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;

  const clubName = club?.display_name || club?.name || 'Sentinel Football Hub';
  const squadLabel = [squad?.name, squad?.age_group].filter(Boolean).join(' · ');

  const ensure = (need: number) => { if (y + need > H - M) { doc.addPage(); y = M; } };
  const sectionTitle = (t: string) => {
    ensure(12); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(226, 232, 240); doc.line(M, y + 1.5, W - M, y + 1.5);
    y += 7;
  };

  // ── Brand header band ──
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...BRAND); doc.circle(M + 1, 13, 1.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('Sentinel Football Hub', M + 5, 11.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text('PLAYER DOSSIER', M + 5, 16.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text(clubName, W - M, 13, { align: 'right' });
  y = 36;

  // ── Player identity ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NAVY);
  const jersey = player.jersey_number ? `#${player.jersey_number}  ` : '';
  doc.text(`${jersey}${player.name}`, M, y);
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SLATE);
  doc.text([player.position, squadLabel].filter(Boolean).join('  ·  ') || '—', M, y);
  y += 4;

  // ── Player info ──
  const age = (() => { const dob = player.date_of_birth; if (!dob) return player.age; const d = new Date(dob); const t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; })();
  const info: [string, string][] = [
    ['Date of Birth', player.date_of_birth ? fmtDate(player.date_of_birth) + (age ? ` (${age})` : '') : ''],
    ['Nationality', player.nationality || ''], ['Preferred Foot', player.foot || ''],
    ['Height', player.height || ''], ['Weight', player.weight || ''], ['Status', player.player_status || 'active'],
  ].filter(([, v]) => v) as [string, string][];
  if (info.length) {
    sectionTitle('Player Information');
    const colW = (W - 2 * M) / 3;
    info.forEach((kv, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = M + col * colW; const ry = y + row * 12;
      ensure(row * 12 + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
      doc.text(kv[0].toUpperCase(), x, ry);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
      doc.text(String(kv[1]), x, ry + 5);
    });
    y += Math.ceil(info.length / 3) * 12 + 2;
  }

  // ── Season stats (position-aware + % minutes) ──
  if (stats.length) {
    const rated = stats.filter(s => s.rating > 0);
    const minutes = stats.reduce((n, s) => n + (s.minutes_played || 0), 0);
    const avgRating = rated.length ? (rated.reduce((n, s) => n + s.rating, 0) / rated.length).toFixed(1) : '—';
    const seasonMinutes = seasonMatches * 90;
    const pct = seasonMinutes ? `${Math.round(minutes / seasonMinutes * 100)}%` : '—';
    const common: [string, string][] = [
      ['Apps', String(stats.length)], ['Started', String(stats.filter(s => s.started).length)],
      ['Minutes', String(minutes)], ['% Min', pct],
    ];
    const mid: [string, string][] = gk
      ? [['Clean Sheets', String(stats.filter(s => s.clean_sheet).length)], ['Saves', String(stats.reduce((n, s) => n + (s.saves || 0), 0))]]
      : [['Goals', String(stats.reduce((n, s) => n + (s.goals || 0), 0))], ['Assists', String(stats.reduce((n, s) => n + (s.assists || 0), 0))]];
    const boxes: [string, string][] = [...common, ...mid, ['MOTM', String(stats.filter(s => s.motm).length)], ['Avg Rating', avgRating]];
    sectionTitle('Season Stats');
    const n = boxes.length; const gap = 3; const bw = (W - 2 * M - (n - 1) * gap) / n;
    ensure(20);
    boxes.forEach((b, i) => {
      const x = M + i * (bw + gap);
      doc.setDrawColor(226, 232, 240); doc.roundedRect(x, y, bw, 16, 2, 2, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...(b[0] === 'Avg Rating' ? [245, 158, 11] : NAVY) as [number, number, number]);
      doc.text(b[1], x + bw / 2, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...SLATE);
      doc.text(b[0].toUpperCase(), x + bw / 2, y + 13, { align: 'center' });
    });
    y += 20;

    // Recent appearances table (position-aware columns)
    const recent = stats.slice(0, 8);
    if (recent.length) {
      sectionTitle(`Last ${recent.length} Appearances`);
      const c1 = gk ? 'CS' : 'G', c2 = gk ? 'Sv' : 'A';
      const cols = [{ t: 'Date', x: M }, { t: 'Opponent', x: M + 34 }, { t: c1, x: M + 110 }, { t: c2, x: M + 128 }, { t: 'Rating', x: M + 150 }];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
      cols.forEach(c => doc.text(c.t.toUpperCase(), c.x, y));
      y += 1.5; doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
      recent.forEach(s => {
        ensure(7);
        doc.setTextColor(...SLATE); doc.text(fmtDate(s.date) || '—', cols[0].x, y);
        doc.setTextColor(...NAVY); doc.text(String(s.opponent || '—').slice(0, 34), cols[1].x, y);
        doc.text(gk ? (s.clean_sheet ? 'Yes' : '—') : String(s.goals ?? '—'), cols[2].x, y);
        doc.text(gk ? String(s.saves ?? '—') : String(s.assists ?? '—'), cols[3].x, y);
        doc.setFont('helvetica', 'bold'); doc.text((s.rating ? String(s.rating) : '—') + (s.motm ? '  MOTM' : ''), cols[4].x, y); doc.setFont('helvetica', 'normal');
        y += 6;
      });
      y += 2;
    }
  }

  // ── Performance ratings — lifetime average (across all assessments) ──
  const pAgg: Record<string, { s: number; c: number }> = {}; PILLARS.forEach(([k]) => pAgg[k] = { s: 0, c: 0 });
  const overall: number[] = [];
  assessments.forEach(a => {
    const r = parseRatings(a.ratings); const per: number[] = [];
    PILLARS.forEach(([k]) => { const v = avgOf(r?.[k]); if (v != null) { pAgg[k].s += v; pAgg[k].c++; per.push(v); } });
    if (per.length) overall.push(per.reduce((x, z) => x + z, 0) / per.length);
  });
  const lifetimeAvg = overall.length ? +(overall.reduce((a, b) => a + b, 0) / overall.length).toFixed(1) : null;
  if (lifetimeAvg != null) {
    sectionTitle('Performance Ratings — Lifetime Average');
    ensure(9);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...BRAND);
    doc.text(`${lifetimeAvg} / 5`, M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
    doc.text(`across ${assessments.length} assessment${assessments.length === 1 ? '' : 's'}`, M + 22, y);
    y += 7;
    const colW = (W - 2 * M) / 4;
    PILLARS.forEach(([k, l], i) => {
      const v = pAgg[k].c ? +(pAgg[k].s / pAgg[k].c).toFixed(1) : null;
      const x = M + i * colW;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SLATE);
      doc.text(l, x, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
      doc.text(v != null ? `${v}/5` : '—', x, y + 5);
    });
    y += 10;
  }

  // ── Recent assessments ──
  if (assessments.length) {
    sectionTitle('Recent Assessments');
    assessments.slice(0, 4).forEach(a => {
      ensure(10);
      const r = parseRatings(a.ratings);
      const per = PILLARS.map(([k]) => avgOf(r?.[k])).filter((v): v is number => v != null);
      const g = per.length ? +(per.reduce((x, z) => x + z, 0) / per.length).toFixed(1) : null;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
      doc.text([fmtDate(a.date || a.created_at), a.author && `Coach: ${a.author}`, a.type].filter(Boolean).join('  ·  ') || 'Assessment', M, y);
      if (g != null) { doc.setTextColor(...BRAND); doc.text(`${g}/5`, W - M, y, { align: 'right' }); }
      y += 4.5;
      const pills = PILLARS.map(([k, l]) => { const v = avgOf(r?.[k]); return v != null ? `${l} ${v}` : null; }).filter(Boolean).join('    ');
      if (pills) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(pills, M, y); y += 4.5; }
      if (a.notes?.trim()) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
        const lines = doc.splitTextToSize(a.notes.trim(), W - 2 * M) as string[];
        lines.slice(0, 6).forEach(l => { ensure(5); doc.text(l, M, y); y += 4.5; });
      }
      y += 2;
    });
  }

  // ── Media & Highlights (video can't embed in a PDF — linked instead) ──
  const highlights = (media.highlights || []) as any[];
  const gallery = (media.gallery || []) as any[];
  if (highlights.length || gallery.length) {
    sectionTitle('Media & Highlights');
    highlights.forEach(h => {
      const url = typeof h === 'string' ? h : (h?.url || h?.link || '');
      const title = typeof h === 'string' ? 'Highlight' : (h?.title || h?.name || 'Highlight');
      if (url) { ensure(6); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...BRAND); doc.textWithLink(`• ${title}`, M, y, { url }); y += 6; }
    });
    if (gallery.length) { ensure(6); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SLATE); doc.text(`${gallery.length} photo${gallery.length === 1 ? '' : 's'} in gallery — view on the share link`, M, y); y += 6; }
  }

  // ── Bio ──
  if (player.bio?.trim()) {
    sectionTitle('About');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
    const lines = doc.splitTextToSize(player.bio.trim(), W - 2 * M) as string[];
    lines.forEach(l => { ensure(6); doc.text(l, M, y); y += 5; });
    y += 2;
  }

  // ── Previous clubs ──
  if (player.previous_clubs?.trim()) {
    sectionTitle('Previous Clubs');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
    const lines = doc.splitTextToSize(player.previous_clubs.split(/[,\n]+/).map((c: string) => c.trim()).filter(Boolean).join(', '), W - 2 * M) as string[];
    lines.forEach(l => { ensure(6); doc.text(l, M, y); y += 5; });
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    doc.text('Powered by Sentinel Football Hub', M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const safe = (player.name || 'player').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`Dossier_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadSquadDossierPdf(data: any): void {
  const { squad, club, players } = data;
  const list = (players || []) as any[];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;
  const clubName = (typeof club === 'string' ? club : (club?.display_name || club?.name)) || 'Sentinel Football Hub';

  // Header band
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...BRAND); doc.circle(M + 1, 13, 1.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('Sentinel Football Hub', M + 5, 11.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text('SQUAD DOSSIER', M + 5, 16.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text(clubName, W - M, 13, { align: 'right' });
  y = 36;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NAVY);
  doc.text(squad.name || 'Squad', M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SLATE);
  doc.text([squad.age_group, `${list.length} player${list.length !== 1 ? 's' : ''}`].filter(Boolean).join('  ·  '), M, y);
  y += 8;

  // Roster table
  const cols = [{ t: '#', x: M, w: 14 }, { t: 'Player', x: M + 14, w: 90 }, { t: 'Position', x: M + 110, w: 40 }, { t: 'Status', x: M + 155, w: 25 }];
  doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
  cols.forEach(c => doc.text(c.t.toUpperCase(), c.x, y));
  y += 1.5; doc.line(M, y, W - M, y); y += 5;

  list.forEach(p => {
    if (y + 7 > H - M) { doc.addPage(); y = M; }
    const name = p.full_name || p.name || 'Player';
    const position = p.position_primary || p.position || '—';
    const status = p.player_status || 'active';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...BRAND);
    doc.text(p.jersey_number ? String(p.jersey_number) : '—', cols[0].x, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY);
    doc.text(String(name).slice(0, 42), cols[1].x, y);
    doc.setTextColor(...SLATE); doc.text(String(position).slice(0, 20), cols[2].x, y);
    doc.setTextColor(...NAVY); doc.text(String(status).charAt(0).toUpperCase() + String(status).slice(1), cols[3].x, y);
    doc.setDrawColor(241, 245, 249); doc.line(M, y + 2, W - M, y + 2);
    y += 7;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    doc.text('Powered by Sentinel Football Hub', M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const safe = (squad.name || 'squad').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`Squad_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
