import { jsPDF } from 'jspdf';
import { renderDrillThumbnail } from '../components/pitch/drillRenderer';
import { pitchAspect } from '../components/pitch/pitchGeometry';
import { flattenDrillDescription } from './drillText';
import type { PitchObject, PitchDrawing } from '../components/pitch/PitchCanvas';
import type { PitchType, PitchOrientation, GridType } from '../components/pitch/pitchGeometry';

const BRAND: [number, number, number] = [0, 196, 154];
const NAVY: [number, number, number] = [13, 27, 42];
const SLATE: [number, number, number] = [100, 116, 139];

interface RenderableDrill { pitchType?: PitchType; orientation?: PitchOrientation; objects?: PitchObject[]; drawings?: PitchDrawing[]; flip?: boolean; grid?: GridType; gridColor?: string }
const toUrl = (d: RenderableDrill, w = 520) => renderDrillThumbnail({ pitchType: d.pitchType || 'full', orientation: d.orientation || 'landscape', objects: d.objects || [], drawings: d.drawings || [], flip: d.flip, grid: d.grid, gridColor: d.gridColor }, w);

/** Download a single drill's pitch as a PNG. */
export function downloadDrillPng(d: RenderableDrill, title = 'drill'): void {
  const a = document.createElement('a');
  a.href = toUrl(d, 1040); a.download = `Drill_${title.replace(/[^a-z0-9]+/gi, '_')}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}

interface ExportSession { title?: string; team?: string; date?: string; duration?: string; purpose?: string; venue?: string; author?: string }
interface ExportDrill extends RenderableDrill { title?: string; description?: string; animated?: boolean }

/** Full session plan PDF — session meta + every drill (title, description, pitch image).
 *  Animated drills render their first frame plus a "view online to play" note. */
export function downloadSessionPdf(session: ExportSession, drills: ExportDrill[], clubName = 'Sentinel Football Hub'): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;
  const ensure = (n: number) => { if (y + n > H - M) { doc.addPage(); y = M; } };

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...BRAND); doc.circle(M + 1, 13, 1.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('Sentinel Football Hub', M + 5, 11.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text('SESSION PLAN', M + 5, 16.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text(clubName, W - M, 13, { align: 'right' });
  y = 36;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text(session.title || 'Training Session', M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SLATE);
  const dur = session.duration ? (/[a-z]/i.test(String(session.duration)) ? String(session.duration) : `${session.duration} min`) : '';
  const meta = [session.date, session.team, dur, session.venue, session.author].filter(Boolean).join('  ·  ');
  if (meta) { doc.text(meta, M, y); y += 5; }
  if (session.purpose?.trim()) {
    doc.setFontSize(9.5); doc.setTextColor(...NAVY);
    (doc.splitTextToSize(`Purpose: ${session.purpose.trim()}`, W - 2 * M) as string[]).forEach(l => { ensure(5); doc.text(l, M, y); y += 5; });
  }
  y += 3;
  doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 6;

  if (!drills.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(...SLATE);
    doc.text('No drills in this session.', M, y);
  }

  drills.forEach((d, i) => {
    const portrait = d.orientation === 'portrait';
    // Match the PDF image box to the pitch's real aspect (so half/third aren't squished),
    // but fit it inside a max box so tall sections don't overflow the page.
    const ar = pitchAspect(d.pitchType || 'full', d.orientation || 'landscape'); // W/H
    const maxW = portrait ? 84 : 120, maxH = portrait ? 150 : 96;
    let imgW = maxW, imgH = imgW / ar;
    if (imgH > maxH) { imgH = maxH; imgW = imgH * ar; }
    ensure(12 + imgH + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text(`${i + 1}. ${d.title || `Drill ${i + 1}`}${d.animated ? '  (animated)' : ''}`, M, y); y += 6;
    const desc = flattenDrillDescription(d.description).trim() + (d.animated ? '\n▶ Animated drill — open the share link to play it.' : '');
    if (desc.trim()) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...SLATE);
      (doc.splitTextToSize(desc.trim(), W - 2 * M) as string[]).forEach(l => { ensure(5); doc.text(l, M, y); y += 5; });
      y += 1;
    }
    try { const img = toUrl(d, 520); if (img) { ensure(imgH + 4); doc.addImage(img, 'PNG', M, y, imgW, imgH); y += imgH + 8; } } catch { y += 4; }
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    doc.text('Powered by Sentinel Football Hub', M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const safe = (session.title || 'session').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`Session_${safe}_${(session.date || new Date().toISOString().slice(0, 10))}.pdf`);
}
