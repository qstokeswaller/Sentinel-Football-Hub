import { jsPDF } from 'jspdf';

/** Session reflection report → vector PDF. Mirrors dossierPdf's brand styling. */
const BRAND: [number, number, number] = [0, 196, 154];
const NAVY: [number, number, number] = [13, 27, 42];
const SLATE: [number, number, number] = [100, 116, 139];

const fmtDate = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function downloadReportPdf(report: any, clubName = 'Sentinel Football Hub'): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;

  const ensure = (n: number) => { if (y + n > H - M) { doc.addPage(); y = M; } };
  const section = (t: string) => {
    ensure(12); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(226, 232, 240); doc.line(M, y + 1.5, W - M, y + 1.5); y += 7;
  };

  // Header band
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 26, 'F');
  doc.setFillColor(...BRAND); doc.circle(M + 1, 13, 1.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('Sentinel Football Hub', M + 5, 11.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text('SESSION REPORT', M + 5, 16.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
  doc.text(clubName, W - M, 13, { align: 'right' });
  y = 36;

  // Title + date
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text(report.sessionTitle || 'General Report', M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...SLATE);
  doc.text(fmtDate(report.date), M, y); y += 4;

  // Summary boxes
  const present = report.attendanceCount ?? 0, total = report.attendanceTotal ?? 0;
  const boxes: [string, string][] = [
    ['Attendance', total ? `${present}/${total}` : '—'],
    ['Intensity', report.intensity || 'Normal'],
    ['Rating', report.rating > 0 ? `${report.rating}/5` : '—'],
    ['Absent', String((report.absentPlayerIds || []).length || 0)],
  ];
  section('Summary');
  const bw = (W - 2 * M - 3 * 4) / 4;
  ensure(20);
  boxes.forEach((b, i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(226, 232, 240); doc.roundedRect(x, y, bw, 16, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    doc.text(b[1], x + bw / 2, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text(b[0].toUpperCase(), x + bw / 2, y + 13, { align: 'center' });
  });
  y += 20;

  // Notes
  if (report.notes?.trim()) {
    section('Notes');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY);
    (doc.splitTextToSize(report.notes.trim(), W - 2 * M) as string[]).forEach(l => { ensure(6); doc.text(l, M, y); y += 5.5; });
    y += 2;
  }

  // Drill notes
  const drillNotes = report.drillNotes && typeof report.drillNotes === 'object' ? Object.entries(report.drillNotes) : [];
  if (drillNotes.length) {
    section('Drill Notes');
    drillNotes.forEach(([k, v]) => {
      ensure(10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(String(k), M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...SLATE);
      (doc.splitTextToSize(String(v), W - 2 * M) as string[]).forEach(l => { ensure(5); doc.text(l, M, y); y += 5; });
      y += 2;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    doc.text('Powered by Sentinel Football Hub', M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const safe = (report.sessionTitle || 'report').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`Report_${safe}_${(report.date || new Date().toISOString().slice(0, 10))}.pdf`);
}
