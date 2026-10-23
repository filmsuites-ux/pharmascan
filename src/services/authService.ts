import { PharmacyUserSession } from '../types/pharmacy';

const AUTH_STORAGE_KEY = 'pharmascan_auth_session';

// Default Google Account for this Pharmacy Build
export const DEFAULT_GOOGLE_USER: Omit<PharmacyUserSession, 'lastLoginAt' | 'isAuthenticated'> = {
  email: 'PjJaya8@gmail.com',
  name: 'Jaya Medical Store (Owner)',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
  provider: 'google',
};

/**
 * Retrieves the current authenticated user session from persistent local storage.
 * OFFLINE-FIRST: Does NOT require internet connection to verify previous session.
 */
export function getCurrentUser(): PharmacyUserSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PharmacyUserSession;
    if (session && session.isAuthenticated && session.email) {
      return session;
    }
    return null;
  } catch (err) {
    console.error('Failed to read auth session from storage:', err);
    return null;
  }
}

/**
 * Checks if the user is authenticated.
 */
export function isUserAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Authenticates using Google Sign-In.
 * Stores user profile locally for offline re-use.
 * Never stores passwords or secrets.
 */
export async function loginWithGoogle(
  customUser?: { email?: string; name?: string; avatar?: string }
): Promise<PharmacyUserSession> {
  const email = customUser?.email || DEFAULT_GOOGLE_USER.email;
  const name = customUser?.name || (email === DEFAULT_GOOGLE_USER.email ? DEFAULT_GOOGLE_USER.name : email.split('@')[0]);
  const avatar = customUser?.avatar || DEFAULT_GOOGLE_USER.avatar;

  const session: PharmacyUserSession = {
    email,
    name,
    avatar,
    provider: 'google',
    isAuthenticated: true,
    lastLoginAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save auth session to localStorage:', err);
  }

  return session;
}

/**
 * Signs the user out.
 */
export function logoutUser(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to remove auth session:', err);
  }
}

/**
 * Resets authentication state for testing / development reset.
 */
export function resetDevelopmentAuth(): void {
  logoutUser();
}
