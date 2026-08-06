import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi, configureApiAuthentication, type ApiUser, type AuthSession } from './lib/api';
import type { UserRole } from './types';

const SESSION_STORAGE_KEY = 'tribalconnect-session';

export interface SessionState {
  authenticated: boolean;
  initialized: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  familyId: string | null;
  role: UserRole | null;
  name: string;
  mobile: string | null;
  email: string | null;
  avatarUrl: string | null;
}

const anonymousSession: SessionState = {
  authenticated: false,
  initialized: false,
  accessToken: null,
  refreshToken: null,
  userId: null,
  familyId: null,
  role: null,
  name: '',
  mobile: null,
  email: null,
  avatarUrl: null,
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'SUPER_ADMIN' || value === 'DEVELOPMENT_OFFICER' || value === 'FIELD_VOLUNTEER' || value === 'FAMILY';
}

function loadStoredSession(): SessionState {
  if (!canUseStorage()) return anonymousSession;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return anonymousSession;
    const candidate = JSON.parse(raw) as Partial<SessionState>;
    if (
      candidate.authenticated !== true
      || typeof candidate.accessToken !== 'string'
      || typeof candidate.refreshToken !== 'string'
      || typeof candidate.userId !== 'string'
      || typeof candidate.name !== 'string'
      || !isUserRole(candidate.role)
    ) return anonymousSession;

    return {
      ...anonymousSession,
      ...candidate,
      initialized: false,
      familyId: typeof candidate.familyId === 'string' ? candidate.familyId : null,
      mobile: typeof candidate.mobile === 'string' ? candidate.mobile : null,
      email: typeof candidate.email === 'string' ? candidate.email : null,
      avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
    };
  } catch {
    return anonymousSession;
  }
}

function persistSession(session: SessionState) {
  if (!canUseStorage()) return;
  try {
    if (!session.authenticated) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    const { initialized: _initialized, ...persisted } = session;
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // The session remains usable for the current tab when private storage is unavailable.
  }
}

function toSession(user: ApiUser, tokens: Pick<AuthSession, 'accessToken' | 'refreshToken'>): SessionState {
  return {
    authenticated: true,
    initialized: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    userId: user.id,
    familyId: user.familyId,
    role: user.role,
    name: user.fullName,
    mobile: user.mobile,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: loadStoredSession,
  reducers: {
    signIn: (_state, action: PayloadAction<AuthSession>) => toSession(action.payload.user, action.payload),
    refreshSucceeded: (state, action: PayloadAction<AuthSession>) => {
      const next = toSession(action.payload.user, action.payload);
      Object.assign(state, next);
    },
    sessionReady: (state) => {
      state.initialized = true;
    },
    signOut: () => ({ ...anonymousSession, initialized: true }),
  },
});

export const { signIn, refreshSucceeded, sessionReady, signOut } = sessionSlice.actions;
export const store = configureStore({ reducer: { session: sessionSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

store.subscribe(() => persistSession(store.getState().session));

let refreshInFlight: Promise<boolean> | null = null;

/** Refreshes an expired session once, coalescing simultaneous failed requests. */
export function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  const { refreshToken } = store.getState().session;
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight = authApi.refresh(refreshToken)
    .then((next) => {
      store.dispatch(refreshSucceeded(next));
      return true;
    })
    .catch(() => {
      store.dispatch(signOut());
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Revokes the refresh token when possible, then clears this device's session. */
export async function logoutSession() {
  const { refreshToken } = store.getState().session;
  try {
    await authApi.logout(refreshToken ?? undefined);
  } catch {
    // Clearing this device remains important even if the network is unavailable.
  } finally {
    store.dispatch(signOut());
  }
}

/** Validates a persisted login before protected routes become available. */
export async function restoreSession() {
  const session = store.getState().session;
  if (!session.authenticated || !session.refreshToken) {
    store.dispatch(sessionReady());
    return false;
  }
  const refreshed = await refreshSession();
  if (!refreshed) store.dispatch(sessionReady());
  return refreshed;
}

configureApiAuthentication({
  getAccessToken: () => store.getState().session.accessToken,
  refresh: refreshSession,
  onUnauthorized: () => store.dispatch(signOut()),
});
