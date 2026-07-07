import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, FileText, User, Tag, MapPin, Shield } from 'lucide-react';
import { buildSuggestions, type Suggestion, type SuggestionKind } from '../../lib/fuzzy';

/**
 * Search-as-you-type box with a ranked suggestion dropdown. Typo-tolerant via
 * lib/fuzzy. Keyboard: ↑/↓ to move, Enter to pick, Esc to close. Picking a
 * suggestion commits it as the search term. Reused across every page search bar.
 */
const KIND_ICON: Record<SuggestionKind, React.ElementType> = {
  title: FileText, name: User, coach: User, category: Tag, position: MapPin, club: Shield, tag: Tag,
};
const KIND_LABEL: Record<SuggestionKind, string> = {
  title: '', name: '', coach: 'Coach', category: 'Category', position: 'Position', club: 'Club', tag: '',
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  corpus: { value: string; kind: Suggestion['kind'] }[];
  placeholder?: string;
}

export const SmartSearch: React.FC<Props> = ({ value, onChange, corpus, placeholder = 'Search…' }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => (open ? buildSuggestions(value, corpus, 7) : []), [open, value, corpus]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => { setActive(-1); }, [value]);

  const commit = (v: string) => { onChange(v); setOpen(false); setActive(-1); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); commit(suggestions[active].value); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[200px] max-w-sm">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg pl-9 pr-8 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand"
      />
      {value && (
        <button onClick={() => commit('')} title="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X size={14} />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-lg py-1">
          {suggestions.map((s, i) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li key={s.kind + s.value}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => { e.preventDefault(); commit(s.value); }}
                  className={'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ' +
                    (i === active ? 'bg-brand/10 text-brand' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5')}>
                  <Icon size={14} className="shrink-0 text-slate-400" />
                  <span className="truncate flex-1">{s.value}</span>
                  {KIND_LABEL[s.kind] && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">{KIND_LABEL[s.kind]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
