/**
 * Parse a players CSV into camelCase player rows. Header mapping ported verbatim
 * from squad-players-ui.js CSV import (case-insensitive, aliases supported).
 */
export interface CsvParseResult { players: Record<string, any>[]; error?: string; }

export function parseCsvPlayers(text: string, defaultSquadId: string | null): CsvParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { players: [], error: 'CSV must have a header row and at least one player.' };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const nameIdx = headers.findIndex(h => ['name', 'player_name', 'fullname', 'full_name'].includes(h));
  if (nameIdx < 0) return { players: [], error: 'CSV must have a "Name" column.' };

  const players: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name = cols[nameIdx];
    if (!name) continue;
    const field = (...keys: string[]) => {
      for (const k of keys) { const idx = headers.indexOf(k); if (idx >= 0 && cols[idx]?.trim()) return cols[idx].trim(); }
      return '';
    };
    const dob = field('dob', 'date_of_birth', 'dateofbirth', 'birthday');
    const ageCol = field('age', 'year', 'birth_year');
    const age = ageCol ? Number(ageCol) : (dob ? (new Date().getFullYear() - new Date(dob).getFullYear()) : null);
    const jersey = field('jersey', 'jersey_number', 'number', 'shirt');
    players.push({
      name,
      age: Number.isFinite(age as number) ? age : null,
      dateOfBirth: dob || null,
      position: field('position', 'pos'),
      squadId: defaultSquadId || null,
      height: field('height', 'height_cm'),
      weight: field('weight', 'weight_kg'),
      foot: field('foot', 'preferred_foot') || 'Right',
      jerseyNumber: jersey ? Number(jersey) : null,
      nationality: field('nationality', 'nation'),
      parentName: field('parent', 'parent_name', 'guardian'),
      parentPhone: field('parent_phone', 'guardian_phone'),
      parentEmail: field('parent_email', 'guardian_email'),
      emergencyContactName: field('emergency_name', 'emergency_contact'),
      emergencyContactPhone: field('emergency_phone'),
      school: field('school'),
    });
  }
  return { players };
}
