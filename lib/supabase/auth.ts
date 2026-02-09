'use client';

import { useEffect, useState } from 'react';
import type { User as SupabaseUser, Session, AuthError, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './client';
import type { UserProfile } from './schema';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

const DEV_MOCK_USER: AuthUser = {
  uid: '00000000-0000-0000-0000-000000000001',
  email: 'dev@test.local',
  displayName: 'Dev Test User',
  photoURL: null,
};

function mapUser(user: SupabaseUser): AuthUser {
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    null;

  return {
    uid: user.id,
    email: user.email ?? null,
    displayName,
    photoURL: (user.user_metadata?.avatar_url as string | undefined) || null,
  };
}

export function isDevAuthBypass(): boolean {
  return DEV_AUTH_BYPASS;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(DEV_AUTH_BYPASS ? DEV_MOCK_USER : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      setUser(DEV_MOCK_USER);
      setLoading(false);
      void upsertDevProfile();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let authEventReceived = false;

    const { data } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      authEventReceived = true;
      const nextUser = session?.user ? mapUser(session.user) : null;
      setUser(nextUser);
      setLoading(false);

      if (session?.user) {
        await upsertProfile(session.user);
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }: { data: { session: Session | null }; error: AuthError | null }) => {
        if (authEventReceived) {
          return;
        }

        if (sessionError) {
          setError(sessionError);
        }
        setUser(data.session?.user ? mapUser(data.session.user) : null);
        setLoading(false);
        if (data.session?.user) {
          await upsertProfile(data.session.user);
        }
      })
      .catch((err: Error) => {
        if (!authEventReceived) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    loading,
    error,
    isDevMode: DEV_AUTH_BYPASS,
  };
}

async function upsertProfile(user: SupabaseUser): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    null;

  await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    display_name: displayName,
    avatar_url: (user.user_metadata?.avatar_url as string | undefined) || null,
  });

  // Backward compatibility for legacy tests/data readers.
  await supabase.from('users').upsert({
    id: user.id,
    uid: user.id,
    email: user.email,
    displayName,
    photoURL: (user.user_metadata?.avatar_url as string | undefined) || null,
    lastLoginAt: Date.now(),
    preferences: {
      defaultModel: 'anthropic',
      autoSaveInterval: 30,
      theme: 'auto',
    },
  });
}

async function upsertDevProfile(): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('profiles').upsert({
      id: DEV_MOCK_USER.uid,
      email: DEV_MOCK_USER.email,
      display_name: DEV_MOCK_USER.displayName,
      avatar_url: DEV_MOCK_USER.photoURL,
    });
  } catch (error) {
    console.error('Error upserting dev profile:', error);
  }
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (DEV_AUTH_BYPASS) return DEV_MOCK_USER;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;

  if (data?.user) {
    await upsertProfile(data.user as SupabaseUser);
    return mapUser(data.user as SupabaseUser);
  }

  const { data: currentUserData } = await supabase.auth.getUser();
  if (currentUserData?.user) {
    await upsertProfile(currentUserData.user as SupabaseUser);
    return mapUser(currentUserData.user as SupabaseUser);
  }

  return {
    uid: '',
    email: null,
    displayName: null,
    photoURL: null,
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  if (DEV_AUTH_BYPASS) return DEV_MOCK_USER;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw error;

  if (data?.user) {
    await upsertProfile(data.user as SupabaseUser);
    return mapUser(data.user as SupabaseUser);
  }

  return {
    uid: '',
    email: null,
    displayName: null,
    photoURL: null,
  };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<AuthUser> {
  if (DEV_AUTH_BYPASS) return DEV_MOCK_USER;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
    },
  });

  if (error) throw error;

  if (data?.user) {
    await upsertProfile(data.user as SupabaseUser);
    return mapUser(data.user as SupabaseUser);
  }

  return {
    uid: '',
    email: null,
    displayName: null,
    photoURL: null,
  };
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (DEV_AUTH_BYPASS) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) throw error;
}

export async function updateUserProfile(displayName?: string, photoURL?: string): Promise<void> {
  if (DEV_AUTH_BYPASS) return;
  const supabase = getSupabaseBrowserClient();
  const { data: currentUserData } = await supabase.auth.getUser();
  if (!currentUserData?.user) {
    throw new Error('No user is currently signed in');
  }

  const updates: Record<string, unknown> = {};

  if (displayName !== undefined) {
    updates.full_name = displayName;
  }
  if (photoURL !== undefined) {
    updates.avatar_url = photoURL;
  }

  const { error } = await supabase.auth.updateUser({ data: updates });
  if (error) throw error;

  const refreshedUser = {
    ...currentUserData.user,
    user_metadata: {
      ...(currentUserData.user.user_metadata || {}),
      ...updates,
    },
  };
  await upsertProfile(refreshedUser as SupabaseUser);
}

export async function signOut() {
  if (DEV_AUTH_BYPASS) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    if (DEV_AUTH_BYPASS && uid === DEV_MOCK_USER.uid) {
      return {
        uid: DEV_MOCK_USER.uid,
        email: DEV_MOCK_USER.email ?? '',
        displayName: DEV_MOCK_USER.displayName,
        photoURL: DEV_MOCK_USER.photoURL,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        preferences: {},
      };
    }

    const supabase = getSupabaseBrowserClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (profile) {
      return {
        uid,
        email: (profile.email as string | null) ?? '',
        displayName: (profile.display_name as string | null) ?? null,
        photoURL: (profile.avatar_url as string | null) ?? null,
        createdAt: profile.created_at ? new Date(profile.created_at as string) : new Date(),
        lastLoginAt: profile.updated_at ? new Date(profile.updated_at as string) : new Date(),
        preferences: {},
      };
    }

    let { data: legacyUser } = await supabase
      .from('users')
      .select('*')
      .eq('uid', uid)
      .maybeSingle();

    if (!legacyUser) {
      const byId = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      legacyUser = byId.data;
    }

    if (!legacyUser) return null;

    return {
      uid: (legacyUser.uid as string | undefined) || (legacyUser.id as string),
      email: (legacyUser.email as string | undefined) || '',
      displayName: (legacyUser.displayName as string | null | undefined) ?? null,
      photoURL: (legacyUser.photoURL as string | null | undefined) ?? null,
      createdAt: legacyUser.createdAt ? new Date(Number(legacyUser.createdAt)) : new Date(),
      lastLoginAt: legacyUser.lastLoginAt ? new Date(Number(legacyUser.lastLoginAt)) : new Date(),
      preferences: (legacyUser.preferences as Record<string, unknown> | undefined) || {},
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: string }).code || '');
    const codeMap: Record<string, string> = {
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password is too weak',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    };

    if (code in codeMap) {
      return codeMap[code];
    }

    if (code) {
      return 'An error occurred. Please try again.';
    }
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message: string }).message);
    if (message.includes('Invalid login credentials')) {
      return 'Incorrect email or password';
    }
    if (message.includes('User already registered')) {
      return 'Email already registered';
    }
    if (message.includes('Password should be')) {
      return 'Password is too weak';
    }
    if (message.includes('Email not confirmed')) {
      return 'Please confirm your email address';
    }
    return 'An unexpected error occurred';
  }

  return 'An unexpected error occurred';
}
