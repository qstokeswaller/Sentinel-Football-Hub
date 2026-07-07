import React from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { CalendarItems } from '../../services/calendarService';
import { dayItems, CalBubble, type CalClickItem } from './calendarShared';

/** "+N more" / full-day list — every item for a day, time-ordered, each click-through to detail. */
export const DayItemsPopup: React.FC<{
  items: CalendarItems; dateStr: string | null; onClose: () => void; onItemClick: (i: CalClickItem) => void; onAdd?: (dateStr: string) => void;
}> = ({ items, dateStr, onClose, onItemClick, onAdd }) => {
  if (!dateStr) return null;
  const list = dayItems(items, dateStr);
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Modal open onClose={onClose} title={label} size="sm">
      <div className="space-y-1.5">
        {list.length ? list.map(b => (
          <CalBubble key={b.key} item={b} onClick={() => onItemClick(b.payload)} />
        )) : <div className="py-6 text-center text-sm text-slate-400">Nothing scheduled.</div>}
      </div>
      {onAdd && (
        <button type="button" onClick={() => onAdd(dateStr)}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-500 hover:border-brand hover:text-brand transition-colors">
          <Plus size={15} /> Add to this day
        </button>
      )}
    </Modal>
  );
};
