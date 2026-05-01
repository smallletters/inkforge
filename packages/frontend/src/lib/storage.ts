const inMemory = new Map<string, string>();

function isLocalStorageAvailable(): boolean {
  try {
    const key = '__inkforge_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const hasStorage = isLocalStorageAvailable();

export const storage = {
  get(key: string): string | null {
    if (hasStorage) {
      try { return localStorage.getItem(key); } catch { /* fallback */ }
    }
    return inMemory.get(key) ?? null;
  },
  set(key: string, value: string): void {
    if (hasStorage) {
      try { localStorage.setItem(key, value); return; } catch { /* fallback */ }
    }
    inMemory.set(key, value);
  },
  remove(key: string): void {
    if (hasStorage) {
      try { localStorage.removeItem(key); return; } catch { /* fallback */ }
    }
    inMemory.delete(key);
  },
};
