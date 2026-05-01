import { create } from 'zustand';
import { storage } from './storage';

interface AuthState {
  token: string | null;
  user: { id: string; username: string; subscription_tier: string } | null;
  setAuth: (token: string, user: any) => void;
  updateUsername: (username: string) => void;
  logout: () => void;
}

const getInitialToken = () => { try { return storage.get('token'); } catch { return null; } };
const getInitialUser = () => { try { const u = storage.get('user'); return u ? JSON.parse(u) : null; } catch { return null; } };

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getInitialToken(),
  user: getInitialUser(),
  setAuth: (token, user) => {
    try { storage.set('token', token); storage.set('user', JSON.stringify(user)); } catch { /* noop */ }
    set({ token, user });
  },
  updateUsername: (username) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, username };
      try { storage.set('user', JSON.stringify(updated)); } catch { /* noop */ }
      set({ user: updated });
    }
  },
  logout: () => {
    try { storage.remove('token'); storage.remove('user'); } catch { /* noop */ }
    set({ token: null, user: null });
  },
}));
