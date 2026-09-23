import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  isRole: (role: UserRole) => boolean;
  isRoleAtLeast: (minRole: UserRole) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const ROLE_LEVEL: Record<UserRole, number> = {
  user: 0,
  health_worker: 1,
  admin: 2,
  super_admin: 3,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch profile:', error);
      return null;
    }
    return data as Profile | null;
  }, []);

  // Loads the profile for a user and tracks that it is in flight, so route
  // guards can tell "still loading" apart from "signed out".
  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const p = await fetchProfile(userId);
      setProfile(p);
      return p;
    } finally {
      setProfileLoading(false);
    }
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    if (p) setProfile(p);
  }, [user, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    // Ensure the profile (created by the DB trigger) is loaded before the
    // caller navigates, so route guards don't bounce the new user to /login.
    if (data.user?.id) {
      await loadProfile(data.user.id);
    }
  };

  const signIn = async (email: string, password: string): Promise<Profile | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Load the profile before resolving so navigation to the dashboard
    // finds an authenticated user with a profile already in place, and so the
    // caller can compare the actual role against the one selected at login.
    if (data.user?.id) {
      return await loadProfile(data.user.id);
    }
    return null;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
    setSession(null);
    setProfileLoading(false);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
    await refreshProfile();
  };

  const isRole = (role: UserRole) => profile?.role === role;
  const isRoleAtLeast = (minRole: UserRole) => {
    if (!profile) return false;
    return ROLE_LEVEL[profile.role] >= ROLE_LEVEL[minRole];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        profileLoading,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
        updateProfile,
        isRole,
        isRoleAtLeast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
