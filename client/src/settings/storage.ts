/**
 * Persistence backends for settings. The provider only talks to the
 * SettingsStorage interface, so a file-backed / exportable implementation
 * can replace localStorage later without touching the UI.
 *
 * Only values that differ from their defaults are persisted, so changing a
 * default in the schema reaches users who never touched that setting.
 */

export interface SettingsStorage {
  load(): Record<string, unknown>;
  save(overrides: Record<string, unknown>): void;
}

const STORAGE_KEY = 'iodine-settings';

export const localStorageSettingsStorage: SettingsStorage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      // Unavailable storage or corrupt JSON — fall back to defaults.
      return {};
    }
  },
  save(overrides) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Settings still apply for the current session when storage is unavailable.
    }
  },
};
