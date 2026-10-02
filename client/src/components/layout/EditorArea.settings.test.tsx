// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenFile } from '../../types';
import { SETTINGS_TAB_PATH, SettingsProvider, type SettingsStorage } from '../../settings';

// Monaco can't run in happy-dom; expose the vimMode prop so tests can assert it.
vi.mock('../editor/MonacoEditor', () => ({
  MonacoEditor: ({ file, vimMode }: { file: OpenFile; vimMode?: boolean }) => (
    <div data-testid="monaco" data-path={file.path} data-vim={String(!!vimMode)} />
  ),
}));
vi.mock('../settings/SettingsPage', () => ({ SettingsPage: () => <div data-testid="settings-page" /> }));
// Heavy renderers (react-syntax-highlighter is CJS/ESM-incompatible under Vitest) — not under test here.
vi.mock('../editor/MarkdownRenderer', () => ({ MarkdownRenderer: () => null }));
vi.mock('../editor/MergeConflictView', () => ({ default: () => null }));
vi.mock('../editor/CommitDiffView', () => ({ CommitDiffView: () => null }));
vi.mock('../editor/LiveMeetingCard', () => ({ LiveMeetingCard: () => null }));
vi.mock('../../hooks/useFileDiff', () => ({ useFileDiff: () => ({ diff: null, refreshDiff: vi.fn() }) }));
vi.mock('../../hooks/useSummary', () => ({
  useSummary: () => ({
    summaryContent: '', summaryLoading: false, summaryError: null,
    hasCachedSummary: false, cachedSummaryObsolete: false, summaryObsolete: false,
    handleSwitchToSummary: vi.fn(), handleRegenerateSummary: vi.fn(),
  }),
}));

import { EditorArea } from './EditorArea';

const file = (path: string, extra: Partial<OpenFile> = {}): OpenFile => ({
  path, name: path.split('/').pop() ?? path, content: 'x', savedContent: 'x',
  isDirty: false, language: 'typescript', ...extra,
});
const settingsTab = file(SETTINGS_TAB_PATH, { name: 'Settings', content: '', savedContent: '', language: 'plaintext', isSettings: true });

function renderArea(openFiles: OpenFile[], activeFilePath: string, persisted: Record<string, unknown> = {}) {
  const storage: SettingsStorage = { load: () => persisted, save: () => {} };
  const props = {
    openFiles, onTabClick: vi.fn(), onTabClose: vi.fn(), onContentChange: vi.fn(),
    workspacePath: null, provider: 'anthropic', model: 'test',
  } as unknown as React.ComponentProps<typeof EditorArea>;
  const ui = (active: string) => (
    <SettingsProvider storage={storage}><EditorArea {...props} activeFilePath={active} /></SettingsProvider>
  );
  const utils = render(ui(activeFilePath));
  return { ...utils, switchTo: (p: string) => utils.rerender(ui(p)) };
}

const monaco = () => screen.getByTestId('monaco');

afterEach(cleanup);

describe('EditorArea settings integration', () => {
  it('renders SettingsPage (not Monaco) for the Settings tab, with no file toolbar', () => {
    renderArea([settingsTab], SETTINGS_TAB_PATH);
    expect(screen.getByTestId('settings-page')).toBeTruthy();
    expect(screen.queryByTestId('monaco')).toBeNull();
    expect(screen.queryByText(/Enable Vim|Disable Vim/)).toBeNull();
  });

  it('follows the global Vim setting by default', () => {
    renderArea([file('/p/a.ts')], '/p/a.ts', { 'editor.vimMode': true });
    expect(monaco().dataset.vim).toBe('true');
    expect(screen.getByText('Disable Vim')).toBeTruthy();
  });

  it('lets the per-tab toggle override the global setting for that tab only', () => {
    const { switchTo } = renderArea([file('/p/a.ts'), file('/p/b.ts')], '/p/a.ts', { 'editor.vimMode': true });

    fireEvent.click(screen.getByText('Disable Vim'));
    expect(monaco().dataset.vim).toBe('false');

    switchTo('/p/b.ts');
    expect(monaco().dataset.vim).toBe('true');

    switchTo('/p/a.ts');
    expect(monaco().dataset.vim).toBe('false');
  });
});
