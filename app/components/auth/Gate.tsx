import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
import type { Role } from '../../lib/roles';

interface GateProps {
  /** Minimum role required (super_admin > admin > scout = coach > viewer). */
  min: Role;
  children: React.ReactNode;
  /** 'hide' (default) renders nothing when blocked; 'disable' greys it out + toasts on click. */
  mode?: 'hide' | 'disable';
  fallback?: React.ReactNode;
}

/**
 * Role-based render gate — the React form of rbac.js's data-min-role grey-out.
 * RLS on the backend remains the real enforcement.
 */
export const Gate: React.FC<GateProps> = ({ min, children, mode = 'hide', fallback = null }) => {
  const { atLeast } = usePermissions();
  const { showToast } = useToast();

  if (atLeast(min)) return <>{children}</>;
  if (mode === 'hide') return <>{fallback}</>;

  return (
    <span
      className="opacity-40 pointer-events-none select-none"
      aria-disabled="true"
      title="You don't have permission to do this"
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showToast("You don't have permission to do this", 'info');
      }}
    >
      {children}
    </span>
  );
};
