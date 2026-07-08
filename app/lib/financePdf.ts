import { jsPDF } from 'jspdf';
import { memberStatus, type SquadFeeGroup } from './financeAgg';

/**
 * Fee-collections statement → branded vector PDF. Per squad: a summary line + a player
 * table (billed / paid / outstanding / status). Mirrors reportPdf/dossierPdf styling.
 * All amounts are South African Rand.
 */
const BRAND: [number, number, number] = [0, 196, 154];
const NAVY: [number, number, number] = [13, 27, 42];
const SLATE: [number, number, number] = [100, 116, 139];
const rand = (n: number) => `R${(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;

export function downloadCollectionsPdf(clubName: string, groups: SquadFeeGroup[], periodLabel: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;
  const ensure = (n: number) => { if (y + n > H - M) { doc.addPage(); y = M; } };

  // Header band
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...BRAND); doc.circle(M + 1, 13, 1.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('Sentinel Football Hub', M + 5, 11.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text('FEE COLLECTIONS STATEMENT', M + 5, 16.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text(clubName, W - M, 13, { align: 'right' });
  y = 34;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text('Fee Collections', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...SLATE);
  doc.text(`${periodLabel} · generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, M, y); y += 8;

  // Club totals
  const tot = groups.reduce((a, g) => ({ billed: a.billed + g.billed, paid: a.paid + g.paid, outstanding: a.outstanding + g.outstanding }), { billed: 0, paid: 0, outstanding: 0 });
  const rate = tot.billed > 0 ? Math.round(tot.paid / tot.billed * 100) : 0;
  doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252); doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'FD');
  const cell = (x: number, label: string, val: string, color: [number, number, number] = NAVY) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(label.toUpperCase(), x, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...color); doc.text(val, x, y + 11);
  };
  const cw = (W - 2 * M) / 4;
  cell(M + 4, 'Billed', rand(tot.billed));
  cell(M + 4 + cw, 'Collected', rand(tot.paid), BRAND as [number, number, number]);
  cell(M + 4 + cw * 2, 'Outstanding', rand(tot.outstanding), [217, 119, 6]);
  cell(M + 4 + cw * 3, 'Collection', `${rate}%`);
  y += 20;

  // Columns for the player tables
  const cols = [
    { x: M, w: W - 2 * M - 108, align: 'left' as const },   // player
    { x: W - M - 108, w: 28, align: 'right' as const },     // billed
    { x: W - M - 80, w: 28, align: 'right' as const },      // paid
    { x: W - M - 52, w: 28, align: 'right' as const },      // outstanding
    { x: W - M - 22, w: 22, align: 'left' as const },       // status
  ];
  const cellText = (i: number, text: string) => {
    const c = cols[i];
    doc.text(text, c.align === 'right' ? c.x + c.w : c.x, y, { align: c.align });
  };

  groups.forEach(g => {
    ensure(24);
    // Squad header
    const grate = g.billed > 0 ? Math.round(g.paid / g.billed * 100) : 0;
    doc.setFillColor(...NAVY); doc.roundedRect(M, y, W - 2 * M, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
    doc.text(`${g.name}  ·  ${g.players.length} player${g.players.length === 1 ? '' : 's'}`, M + 3, y + 5.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 210, 220);
    doc.text(`Billed ${rand(g.billed)}   Collected ${rand(g.paid)}   Outstanding ${rand(g.outstanding)}   ${grate}%${g.arrears ? `   ${g.arrears} in arrears` : ''}`, W - M - 3, y + 5.4, { align: 'right' });
    y += 12;

    // Column heads
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    cellText(0, 'PLAYER'); cellText(1, 'BILLED'); cellText(2, 'PAID'); cellText(3, 'OUTSTANDING'); cellText(4, 'STATUS');
    y += 1.5; doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 4.5;

    g.players.forEach(p => {
      ensure(7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
      cellText(0, p.name);
      doc.setTextColor(...SLATE); cellText(1, rand(p.billed));
      doc.setTextColor(...BRAND); cellText(2, rand(p.paid));
      doc.setTextColor(p.outstanding > 0 ? 217 : 148, p.outstanding > 0 ? 119 : 163, p.outstanding > 0 ? 6 : 184); cellText(3, p.outstanding > 0 ? rand(p.outstanding) : '—');
      const st = memberStatus(p);
      doc.setTextColor(st === 'Overdue' ? 239 : st === 'Owing' ? 217 : 22, st === 'Overdue' ? 68 : st === 'Owing' ? 119 : 163, st === 'Overdue' ? 68 : st === 'Owing' ? 6 : 74);
      doc.setFont('helvetica', 'bold'); cellText(4, st);
      y += 3; doc.setDrawColor(241, 245, 249); doc.line(M, y, W - M, y); y += 3.5;
    });
    y += 4;
  });

  doc.save(`fee-collections-${new Date().toISOString().slice(0, 10)}.pdf`);
}
