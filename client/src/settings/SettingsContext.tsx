import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SETTINGS,
  SETTING_KEYS,
  getDefaultSettings,
  isValidSettingValue,
  type SettingKey,
  type SettingValue,
  type SettingsValues,
} from './schema';
import { localStorageSettingsStorage, type SettingsStorage } from './storage';

interface SettingsContextValue {
  values: SettingsValues;
  setSetting: <K extends SettingKey>(key: K, value: SettingValue<K>) => void;
  resetSetting: (key: SettingKey) => void;
  isModified: (key: SettingKey) => boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Merge persisted values over defaults, dropping unknown keys and invalid values. */
function hydrate(raw: Record<string, unknown>): SettingsValues {
  const values = getDefaultSettings() as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    if (key in raw && isValidSettingValue(SETTINGS[key], raw[key])) values[key] = raw[key];
  }
  return values as SettingsValues;
}

function toOverrides(values: SettingsValues): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    if (values[key] !== SETTINGS[key].default) overrides[key] = values[key];
  }
  return overrides;
}

interface SettingsProviderProps {
  children: ReactNode;
  /** Swap in a different backend (e.g. file storage, or an in-memory stub for tests). */
  storage?: SettingsStorage;
}

export function SettingsProvider({ children, storage = localStorageSettingsStorage }: SettingsProviderProps) {
  const [values, setValues] = useState<SettingsValues>(() => hydrate(storage.load()));

  useEffect(() => {
    storage.save(toOverrides(values));
  }, [values, storage]);

  const setSetting = useCallback(<K extends SettingKey>(key: K, value: SettingValue<K>) => {
    setValues(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const resetSetting = useCallback((key: SettingKey) => {
    setValues(prev => ({ ...prev, [key]: SETTINGS[key].default }));
  }, []);

  const isModified = useCallback((key: SettingKey) => values[key] !== SETTINGS[key].default, [values]);

  const ctx = useMemo(() => ({ values, setSetting, resetSetting, isModified }), [values, setSetting, resetSetting, isModified]);

  return <SettingsContext.Provider value={ctx}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within <SettingsProvider>');
  return ctx;
}

/** Typed accessor for a single setting: `const [vim, setVim] = useSetting('editor.vimMode')`. */
export function useSetting<K extends SettingKey>(key: K): [SettingValue<K>, (value: SettingValue<K>) => void] {
  const { values, setSetting } = useSettings();
  const set = useCallback((value: SettingValue<K>) => setSetting(key, value), [key, setSetting]);
  return [values[key], set];
}
