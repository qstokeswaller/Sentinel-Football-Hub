import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';

/**
 * "Viewing as: <club>" banner shown while a super_admin impersonates a club.
 * Ported from the early-banner logic in src/auth.js — now reactive.
 */
export const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, impersonatingClubName, stopImpersonation } = useAppState();
  const navigate = useNavigate();
  if (!isImpersonating) return null;

  return (
    <div className="h-10 shrink-0 flex items-center justify-center gap-3 px-6 text-sm font-semibold text-white bg-gradient-to-r from-[#c8902e] to-[#e6a940]">
      <Eye size={14} />
      <span>Viewing as: <strong>{impersonatingClubName || 'Unknown Club'}</strong></span>
      <button
        onClick={() => { stopImpersonation(); navigate('/dashboard'); }}
        className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        <LogOut size={12} /> Exit
      </button>
    </div>
  );
};
