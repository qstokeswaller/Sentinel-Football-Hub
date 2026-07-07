/**
 * Session equipment: parse/serialise a structured item+quantity list to and from
 * the single `sessions.equipment` text column.
 *
 * We deliberately keep the STORED form a human-readable string — e.g.
 *   "Cones ×20, Bibs ×14, Balls ×12"
 * so every existing consumer (share page, PDF export, library cards, the collapsed
 * Session Details summary) keeps working untouched, and legacy free-text values still
 * render as-is. The planner UI parses this back into editable pills and re-serialises
 * on every change, so the stored string is always the single source of truth.
 */
export interface EquipmentItem {
  /** Display name, e.g. "Cones". */
  item: string;
  /** Optional count. Undefined = count-less (legacy free-text, or "just bring some"). */
  qty?: number;
}

/** Seed catalogue shown to coaches who have no equipment history yet. */
export const DEFAULT_EQUIPMENT = [
  'Balls', 'Cones', 'Bibs', 'Mannequins', 'Poles', 'Goals', 'Ladders', 'Hurdles',
];

const QTY_RE = /^(.*?)\s*[×x]\s*(\d+)\s*$/i; // "Cones ×20" / "cones x20"

/** "Cones ×20, Bibs, Balls x12" → [{item:'Cones',qty:20},{item:'Bibs'},{item:'Balls',qty:12}] */
export function parseEquipment(value: string | null | undefined): EquipmentItem[] {
  if (!value) return [];
  return value.split(',').map(raw => raw.trim()).filter(Boolean).map(tok => {
    const m = tok.match(QTY_RE);
    if (m && m[1].trim()) return { item: m[1].trim(), qty: Number(m[2]) };
    return { item: tok }; // no "×N" → count-less pill (also covers all legacy free-text)
  });
}

/** Round-trips parseEquipment. Drops blank names; qty omitted when unset or < 1. */
export function serializeEquipment(items: EquipmentItem[]): string {
  return items
    .map(i => ({ item: i.item.trim(), qty: i.qty }))
    .filter(i => i.item)
    .map(i => (i.qty && i.qty > 0 ? `${i.item} ×${i.qty}` : i.item))
    .join(', ');
}
