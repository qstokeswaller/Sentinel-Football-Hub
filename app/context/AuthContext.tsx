import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  needsPasswordUpdate: boolean;
  clearPasswordUpdate: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  needsPasswordUpdate: false,
  clearPasswordUpdate: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordUpdate, setNeedsPasswordUpdate] = useState(false);

  const clearPasswordUpdate = () => setNeedsPasswordUpdate(false);

  useEffect(() => {
    // Fallback: detect a recovery token in the URL hash in case the event fires
    // before the listener registers or the page is refreshed mid-flow.
    if (window.location.hash.includes('type=recovery')) {
      setNeedsPasswordUpdate(true);
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Refresh first — catches stale refresh tokens getSession() can't detect
        // (local JWT looks valid but the server rejects it).
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          console.warn('Session refresh failed — signing out:', refreshError?.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        setSession(refreshed.session);
        setUser(refreshed.session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordUpdate(true);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // 'local' scope so the session clears even if the network request fails.
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setUser(null);
    setNeedsPasswordUpdate(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, needsPasswordUpdate, clearPasswordUpdate, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
