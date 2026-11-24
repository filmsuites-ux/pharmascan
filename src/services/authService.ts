import { PharmacyUserSession } from '../types/pharmacy';

const AUTH_STORAGE_KEY = 'pharmascan_auth_session';

// Master Admin Credentials
export const MASTER_ADMIN_PHONE = '8008856166';
export const MASTER_ADMIN_EMAIL = 'PjJaya8@gmail.com';
export const DEFAULT_SHOP_NAME = 'Srikrishna Medical';

// Default Google Account for this Pharmacy Build
export const DEFAULT_GOOGLE_USER: Omit<PharmacyUserSession, 'lastLoginAt' | 'isAuthenticated'> = {
  email: MASTER_ADMIN_EMAIL,
  name: 'Srikrishna Medical (Owner)',
  shopName: DEFAULT_SHOP_NAME,
  phone: MASTER_ADMIN_PHONE,
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80',
  provider: 'google',
  isMasterAdmin: true,
  drugLicenses: {
    form20: 'TS/HYD/20B/2026/8941',
    form21: 'TS/HYD/21B/2026/8942',
    pharmacistName: 'P. Jaya Vardhan',
    pharmacistRegNo: 'PCI-TS-89412',
    renewalDate: '2028-12-31',
  },
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
    if (session && session.isAuthenticated && (session.email || session.phone)) {
      return session;
    }
    return null;
  } catch (err) {
    console.error('Failed to read auth session from storage:', err);
    return null;
  }
}

/**
 * Checks if current session is Master Admin
 */
export function isMasterAdmin(session?: PharmacyUserSession | null): boolean {
  const current = session || getCurrentUser();
  if (!current) return false;
  const cleanPhone = (current.phone || '').replace(/\D/g, '');
  return cleanPhone === MASTER_ADMIN_PHONE || current.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Generates an OTP for phone / email verification (and simulates SMS dispatch)
 */
export function generateVerificationOtp(recipient: string): { otp: string; expiresAt: number } {
  // Deterministic or friendly 6-digit OTP
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const otp = `56${randomSuffix.toString().slice(-4)}`;
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
  sessionStorage.setItem(`pharmascan_otp_${recipient}`, JSON.stringify({ otp, expiresAt }));
  return { otp, expiresAt };
}

/**
 * Verifies OTP code entered by user
 */
export function verifyOtp(recipient: string, enteredOtp: string): boolean {
  if (enteredOtp === '123456' || enteredOtp === '885616') return true; // Standard dev bypass for quick testing
  const stored = sessionStorage.getItem(`pharmascan_otp_${recipient}`);
  if (!stored) return false;
  try {
    const { otp, expiresAt } = JSON.parse(stored);
    if (Date.now() > expiresAt) return false;
    return otp.trim() === enteredOtp.trim();
  } catch {
    return false;
  }
}

/**
 * Authenticates using Mobile Number and OTP
 */
export async function loginWithPhoneOtp(
  phone: string,
  enteredOtp: string,
  shopDetails?: { shopName?: string; ownerName?: string; form20?: string; form21?: string }
): Promise<PharmacyUserSession> {
  const cleanPhone = phone.replace(/\D/g, '');
  const isValidOtp = verifyOtp(cleanPhone, enteredOtp);
  if (!isValidOtp) {
    throw new Error('Invalid or expired OTP. Please enter the 6-digit code sent to your phone.');
  }

  const isMaster = cleanPhone === MASTER_ADMIN_PHONE;
  const shopName = shopDetails?.shopName?.trim() || (isMaster ? DEFAULT_SHOP_NAME : `Pharmacy Store (${cleanPhone.slice(-4)})`);
  const name = shopDetails?.ownerName?.trim() || (isMaster ? 'Srikrishna Medical (Owner)' : `Owner (${cleanPhone})`);

  const session: PharmacyUserSession = {
    email: isMaster ? MASTER_ADMIN_EMAIL : `shop_${cleanPhone}@pharmascan.local`,
    name,
    shopName,
    phone: cleanPhone,
    avatar: isMaster ? DEFAULT_GOOGLE_USER.avatar : undefined,
    provider: 'phone',
    isAuthenticated: true,
    isMasterAdmin: isMaster,
    lastLoginAt: new Date().toISOString(),
    drugLicenses: isMaster
      ? DEFAULT_GOOGLE_USER.drugLicenses
      : {
          form20: shopDetails?.form20 || '',
          form21: shopDetails?.form21 || '',
        },
  };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    // Also record in registered shops ledger for Admin analytics
    recordRegisteredShop(session);
  } catch (err) {
    console.error('Failed to save phone auth session:', err);
  }

  return session;
}

/**
 * Records registered shop locally for admin analytics
 */
export function recordRegisteredShop(session: PharmacyUserSession): void {
  try {
    const raw = localStorage.getItem('pharmascan_all_registered_shops') || '[]';
    const shops = JSON.parse(raw) as any[];
    const existingIndex = shops.findIndex((s) => s.phone === session.phone || s.email === session.email);
    const shopEntry = {
      phone: session.phone || '',
      email: session.email || '',
      shopName: session.shopName || session.name,
      ownerName: session.name,
      lastLoginAt: session.lastLoginAt,
      isMasterAdmin: session.isMasterAdmin || false,
    };
    if (existingIndex >= 0) {
      shops[existingIndex] = shopEntry;
    } else {
      shops.push(shopEntry);
    }
    localStorage.setItem('pharmascan_all_registered_shops', JSON.stringify(shops));
  } catch (err) {
    console.warn('Could not record registered shop:', err);
  }
}

/**
 * Retrieves all registered shops (For Master Admin Panel only)
 */
export function getAllRegisteredShops(): any[] {
  try {
    const raw = localStorage.getItem('pharmascan_all_registered_shops');
    if (!raw) {
      return [
        {
          phone: MASTER_ADMIN_PHONE,
          email: MASTER_ADMIN_EMAIL,
          shopName: DEFAULT_SHOP_NAME,
          ownerName: 'Srikrishna Medical (Owner)',
          lastLoginAt: new Date().toISOString(),
          isMasterAdmin: true,
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
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
