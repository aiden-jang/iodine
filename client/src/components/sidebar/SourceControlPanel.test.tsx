// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitChange } from '../../hooks/useSourceControl';

const pull = vi.fn();
let scState: Record<string, unknown>;

vi.mock('../../hooks/useSourceControl', () => ({
  useSourceControl: () => scState,
}));

import { SourceControlPanel } from './SourceControlPanel';

const change = { path: '/project/a.ts', relPath: 'a.ts', status: 'M' } as unknown as GitChange;

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    branch: 'main', loaded: true, loading: false,
    staged: [], unstaged: [], localBranches: [], remoteBranches: [], commits: [],
    commitMessage: '', setCommitMessage: vi.fn(),
    pushStatus: 'idle', pushError: null, push: vi.fn(),
    pullStatus: 'idle', pullError: null, pull,
    confirmDialog: { type: null },
    commit: vi.fn(), stage: vi.fn(), unstage: vi.fn(), stageAllChanges: vi.fn(),
    discard: vi.fn(), checkout: vi.fn(), checkoutCommit: vi.fn(),
    ...overrides,
  };
}

const renderPanel = () => render(<SourceControlPanel workspacePath="/project" onFileOpen={vi.fn()} />);
const openMenu = () => fireEvent.click(screen.getByTitle('Pull / fetch from remote'));
const menuItem = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

beforeEach(() => { pull.mockReset(); scState = makeState(); });
afterEach(cleanup);

describe('SourceControlPanel pull menu', () => {
  it('opens the menu and runs pull', () => {
    renderPanel();
    expect(screen.queryByText('Pull (rebase)')).toBeNull();
    openMenu();
    fireEvent.click(menuItem('Pull (rebase)'));
    expect(pull).toHaveBeenCalledWith('pull');
    expect(screen.queryByText('Pull (rebase)')).toBeNull();
  });

  it('runs fetch tags', () => {
    renderPanel();
    openMenu();
    fireEvent.click(menuItem('Fetch tags'));
    expect(pull).toHaveBeenCalledWith('fetchTags');
  });

  it('disables pull but not fetch tags when the workspace is dirty', () => {
    scState = makeState({ unstaged: [change] });
    renderPanel();
    openMenu();
    expect(menuItem('Pull (rebase)').disabled).toBe(true);
    expect(screen.getByText('Workspace must be clean')).toBeTruthy();
    expect(menuItem('Fetch tags').disabled).toBe(false);
  });

  it('shows the error in the button tooltip', () => {
    scState = makeState({ pullStatus: 'error', pullError: 'boom' });
    renderPanel();
    expect(screen.getByTitle('Failed: boom')).toBeTruthy();
  });
});
