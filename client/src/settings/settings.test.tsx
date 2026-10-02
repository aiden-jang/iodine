// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS,
  SETTING_KEYS,
  SettingsProvider,
  getDefaultSettings,
  isValidSettingValue,
  localStorageSettingsStorage,
  useSetting,
  useSettings,
  type SettingsStorage,
} from './index';

const STORAGE_KEY = 'iodine-settings';

function memoryStorage(initial: Record<string, unknown> = {}) {
  let data = { ...initial };
  const storage: SettingsStorage & { data: () => Record<string, unknown> } = {
    load: () => ({ ...data }),
    save: overrides => { data = { ...overrides }; },
    data: () => data,
  };
  return storage;
}

const wrapperWith = (storage?: SettingsStorage) =>
  ({ children }: { children: ReactNode }) => <SettingsProvider storage={storage}>{children}</SettingsProvider>;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('settings schema', () => {
  it('derives defaults from every registered setting', () => {
    const defaults = getDefaultSettings();
    for (const key of SETTING_KEYS) expect(defaults[key]).toBe(SETTINGS[key].default);
    expect(defaults['editor.vimMode']).toBe(false);
  });

  it('validates values by setting type', () => {
    expect(isValidSettingValue({ type: 'boolean', section: 'editor', label: 'b', default: false }, true)).toBe(true);
    expect(isValidSettingValue({ type: 'boolean', section: 'editor', label: 'b', default: false }, 'true')).toBe(false);
    expect(isValidSettingValue({ type: 'number', section: 'editor', label: 'n', default: 1 }, NaN)).toBe(false);
    const select = { type: 'select' as const, section: 'editor' as const, label: 's', default: 'a', options: [{ value: 'a', label: 'A' }] };
    expect(isValidSettingValue(select, 'a')).toBe(true);
    expect(isValidSettingValue(select, 'z')).toBe(false);
  });
});

describe('localStorageSettingsStorage', () => {
  it('returns {} when nothing is stored or the JSON is corrupt', () => {
    expect(localStorageSettingsStorage.load()).toEqual({});
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(localStorageSettingsStorage.load()).toEqual({});
    localStorage.setItem(STORAGE_KEY, '[1,2]');
    expect(localStorageSettingsStorage.load()).toEqual({});
  });

  it('round-trips saved overrides', () => {
    localStorageSettingsStorage.save({ 'editor.vimMode': true });
    expect(localStorageSettingsStorage.load()).toEqual({ 'editor.vimMode': true });
  });
});

describe('SettingsProvider', () => {
  it('uses defaults when nothing is persisted', () => {
    const { result } = renderHook(() => useSetting('editor.vimMode'), { wrapper: wrapperWith(memoryStorage()) });
    expect(result.current[0]).toBe(false);
  });

  it('hydrates valid persisted values and ignores invalid or unknown ones', () => {
    const valid = renderHook(() => useSetting('editor.vimMode'), {
      wrapper: wrapperWith(memoryStorage({ 'editor.vimMode': true, 'unknown.key': 1 })),
    });
    expect(valid.result.current[0]).toBe(true);

    const invalid = renderHook(() => useSetting('editor.vimMode'), {
      wrapper: wrapperWith(memoryStorage({ 'editor.vimMode': 'yes' })),
    });
    expect(invalid.result.current[0]).toBe(false);
  });

  it('persists only values that differ from defaults', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useSettings(), { wrapper: wrapperWith(storage) });

    act(() => result.current.setSetting('editor.vimMode', true));
    expect(result.current.values['editor.vimMode']).toBe(true);
    expect(result.current.isModified('editor.vimMode')).toBe(true);
    expect(storage.data()).toEqual({ 'editor.vimMode': true });

    act(() => result.current.resetSetting('editor.vimMode'));
    expect(result.current.isModified('editor.vimMode')).toBe(false);
    expect(storage.data()).toEqual({});
  });

  it('writes to localStorage by default', () => {
    const { result } = renderHook(() => useSetting('editor.vimMode'), { wrapper: wrapperWith() });
    act(() => result.current[1](true));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ 'editor.vimMode': true });
  });

  it('throws a helpful error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSettings())).toThrow(/SettingsProvider/);
    spy.mockRestore();
  });
});
