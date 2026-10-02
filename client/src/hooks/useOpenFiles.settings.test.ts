// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SETTINGS_TAB_PATH } from '../settings/constants';
import { useOpenFiles } from './useOpenFiles';

describe('useOpenFiles.openSettings', () => {
  it('creates a Settings tab and makes it active', () => {
    const { result } = renderHook(() => useOpenFiles());

    act(() => result.current.openSettings());

    const tabs = result.current.openFiles.filter(f => f.path === SETTINGS_TAB_PATH);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ name: 'Settings', isSettings: true, isDirty: false });
    expect(result.current.activeFilePath).toBe(SETTINGS_TAB_PATH);
  });

  it('reuses the existing tab instead of opening a duplicate', () => {
    const { result } = renderHook(() => useOpenFiles());

    act(() => result.current.openSettings());
    act(() => result.current.openSettings());

    expect(result.current.openFiles.filter(f => f.path === SETTINGS_TAB_PATH)).toHaveLength(1);
    expect(result.current.activeFilePath).toBe(SETTINGS_TAB_PATH);
  });
});
