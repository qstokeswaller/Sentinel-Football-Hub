/** Tiny CSV export — serialise rows (arrays of cells) with a header and trigger a download. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const lines = [headers, ...rows].map(r => r.map(cell).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
