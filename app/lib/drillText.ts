/**
 * Drill-description handling. A drill's description is stored as a JSON "sections" blob —
 * {overview, setup, function, progressions, coaching} (v7-compatible) — each value being
 * lightly-formatted HTML from the rich-text editor. These helpers parse it for editing,
 * render it for display, and flatten it to plain text for PDF.
 */
export interface DrillSection { label: string; text: string }

/** The structured sections, in order, with their editor placeholders (matches v7). */
export const DRILL_SECTIONS: { key: string; label: string; placeholder: string }[] = [
  { key: 'overview', label: 'Overview', placeholder: 'Brief overview of the drill…' },
  { key: 'setup', label: 'Setup', placeholder: 'Pitch dimensions, player positions, equipment needed…' },
  { key: 'function', label: 'Function', placeholder: 'How the drill works, rules, play flow…' },
  { key: 'progressions', label: 'Progressions / Variations', placeholder: 'Progressive challenges and variations…' },
  { key: 'coaching', label: 'Coaching Points', placeholder: 'Key coaching points — in possession, out of possession…' },
];

const SECTION_ORDER: [string, string][] = DRILL_SECTIONS.map(s => [s.key, s.label]);
const ALLOWED_TAGS = /^(B|STRONG|I|EM|U|UL|OL|LI|BR|P|DIV|SPAN)$/;

/** Strip everything except basic formatting tags and drop all attributes (defends share links). */
export function sanitizeDrillHtml(html?: string | null): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild as HTMLElement;
    const walk = (node: Element) => {
      Array.from(node.children).forEach(el => {
        if (!ALLOWED_TAGS.test(el.tagName)) { el.replaceWith(...Array.from(el.childNodes)); return; }
        Array.from(el.attributes).forEach(a => el.removeAttribute(a.name));
        walk(el);
      });
    };
    walk(root);
    return root.innerHTML;
  } catch { return stripHtml(html); }
}

/** HTML → readable plain text (lists / paragraphs / breaks become newlines). */
export function stripHtml(html?: string | null): string {
  if (!html) return '';
  try {
    const prepped = html.replace(/<\/(p|div|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
    const doc = new DOMParser().parseFromString(prepped, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch { return html.replace(/<[^>]+>/g, '').trim(); }
}

/** Parse a description into labelled sections (legacy JSON) or a single plain block. */
export function parseDrillDescription(desc?: string | null): { sections: DrillSection[]; structured: boolean } {
  const trimmed = (desc || '').trim();
  if (!trimmed) return { sections: [], structured: false };
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && SECTION_ORDER.some(([k]) => k in obj)) {
        const sections = SECTION_ORDER
          .filter(([k]) => obj[k] != null && stripHtml(String(obj[k])).trim())
          .map(([k, label]) => ({ label, text: String(obj[k]).trim() }));
        return { sections, structured: true };
      }
    } catch { /* not the sections blob — fall through to plain */ }
  }
  return { sections: [{ label: '', text: trimmed }], structured: false };
}

/** Parse stored description into the editor's section map (legacy plain text → overview). */
export function parseDrillSections(desc?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = (desc || '').trim();
  if (!trimmed) return out;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        DRILL_SECTIONS.forEach(s => { if (obj[s.key] != null) out[s.key] = String(obj[s.key]); });
        return out;
      }
    } catch { /* fall through */ }
  }
  out.overview = trimmed; // legacy single-block description → Overview
  return out;
}

/** Serialize the editor's section map back to the stored JSON blob ('' when all empty). */
export function buildDrillDescription(sections: Record<string, string>): string {
  const obj: Record<string, string> = {};
  DRILL_SECTIONS.forEach(s => {
    const v = (sections[s.key] || '').trim();
    if (v && stripHtml(v).trim()) obj[s.key] = v;
  });
  return Object.keys(obj).length ? JSON.stringify(obj) : '';
}

/** Readable plain text (used by the PDF export). Labels only when multi-section. */
export function flattenDrillDescription(desc?: string | null): string {
  const { sections, structured } = parseDrillDescription(desc);
  if (!sections.length) return '';
  if (!structured || sections.length === 1) return stripHtml(sections[0].text);
  return sections.map(s => `${s.label}: ${stripHtml(s.text)}`).join('\n\n');
}
