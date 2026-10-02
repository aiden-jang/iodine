// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsProvider, type SettingsStorage } from '../../settings';
import { SettingsPage } from './SettingsPage';

let saved: Record<string, unknown>;
const storage: SettingsStorage = {
  load: () => ({}),
  save: overrides => { saved = overrides; },
};

const renderPage = () => render(<SettingsProvider storage={storage}><SettingsPage /></SettingsProvider>);
const vimCheckbox = () => screen.getByRole('checkbox', { name: /vim/i }) as HTMLInputElement;

beforeEach(() => { saved = {}; });
afterEach(cleanup);

describe('SettingsPage', () => {
  it('renders sections and settings from the schema', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeTruthy();
    expect(screen.getByText('editor.vimMode')).toBeTruthy();
    expect(vimCheckbox().checked).toBe(false);
  });

  it('toggles a boolean setting and offers a reset', () => {
    renderPage();
    fireEvent.click(vimCheckbox());
    expect(vimCheckbox().checked).toBe(true);
    expect(saved).toEqual({ 'editor.vimMode': true });

    fireEvent.click(screen.getByTitle('Reset to default'));
    expect(vimCheckbox().checked).toBe(false);
    expect(saved).toEqual({});
  });

  it('filters settings by search query', () => {
    renderPage();
    const search = screen.getByPlaceholderText('Search settings');
    fireEvent.change(search, { target: { value: 'vim' } });
    expect(screen.getByText('Search results (1)')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzz-nothing' } });
    expect(screen.getByText('No settings found.')).toBeTruthy();
  });
});
