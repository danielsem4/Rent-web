import "@testing-library/jest-dom/vitest";

// jsdom (v28) exposes a `localStorage` object without working methods under the
// default opaque origin, which breaks any module that reads persisted state at
// import time (e.g. i18n init). Provide a minimal in-memory Storage so component
// tests can render real screens. Also covers sessionStorage.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const current = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
  if (!current || typeof current.getItem !== "function") {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
    });
  }
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
