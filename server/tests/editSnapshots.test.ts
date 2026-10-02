import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revertEdit, saveSnapshot } from '../src/services/editSnapshots';

let home: string;
let ws: string;

beforeEach(async () => {
  home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iodine-home-'));
  ws = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iodine-ws-'));
  // snapshotDir() calls os.homedir() on every call, so this redirects snapshot storage.
  vi.spyOn(os, 'homedir').mockReturnValue(home);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.promises.rm(home, { recursive: true, force: true });
  await fs.promises.rm(ws, { recursive: true, force: true });
});

const file = (name: string) => path.join(ws, name);
const read = (p: string) => fs.promises.readFile(p, 'utf-8');
const write = (p: string, text: string) => fs.promises.writeFile(p, text, 'utf-8');
const exists = (p: string) => fs.promises.access(p).then(() => true, () => false);

async function listSnapshots(): Promise<string[]> {
  const root = path.join(home, '.iodine');
  if (!(await exists(root))) return [];
  const [wsHash] = await fs.promises.readdir(root);
  return fs.promises.readdir(path.join(root, wsHash, 'edits'));
}

async function readOnlySnapshot() {
  const root = path.join(home, '.iodine');
  const [wsHash] = await fs.promises.readdir(root);
  const [name] = await listSnapshots();
  return JSON.parse(await read(path.join(root, wsHash, 'edits', name)));
}

/** Simulates an agent edit: snapshot first, then write — same order the tools use. */
async function agentWrite(id: string, p: string, next: string) {
  await saveSnapshot(ws, id, p, next, 'write_file');
  await write(p, next);
}

describe('saveSnapshot', () => {
  it('records original content for an existing file', async () => {
    await write(file('a.ts'), 'original');
    await saveSnapshot(ws, 'c1', file('a.ts'), 'next', 'edit_file');
    const snap = await readOnlySnapshot();
    expect(snap).toMatchObject({ path: file('a.ts'), existed: true, before: 'original', tool: 'edit_file' });
  });

  it('records existed:false for a file the agent is creating', async () => {
    await saveSnapshot(ws, 'c1', file('new.ts'), 'hello', 'write_file');
    const snap = await readOnlySnapshot();
    expect(snap).toMatchObject({ existed: false, before: '' });
  });

  it('saves nothing on a non-ENOENT read error (never mark an existing path as new)', async () => {
    await fs.promises.mkdir(file('dir'));
    await saveSnapshot(ws, 'c1', file('dir'), 'x', 'write_file'); // readFile → EISDIR
    expect(await listSnapshots()).toEqual([]);
  });

  it('saves nothing when the original exceeds 1 MB', async () => {
    await write(file('big.txt'), 'a'.repeat(1024 * 1024 + 1));
    await saveSnapshot(ws, 'c1', file('big.txt'), 'small', 'write_file');
    expect(await listSnapshots()).toEqual([]);
  });
});

describe('revertEdit', () => {
  it('restores original content and removes the snapshot', async () => {
    await write(file('a.ts'), 'original');
    await agentWrite('c1', file('a.ts'), 'agent');
    const r = await revertEdit(ws, 'c1', false);
    expect(r).toEqual({ outcome: 'reverted', path: file('a.ts') });
    expect(await read(file('a.ts'))).toBe('original');
    expect(await listSnapshots()).toEqual([]);
  });

  it('deletes a file the agent created', async () => {
    await agentWrite('c1', file('new.ts'), 'agent');
    const r = await revertEdit(ws, 'c1', false);
    expect(r).toEqual({ outcome: 'deleted', path: file('new.ts') });
    expect(await exists(file('new.ts'))).toBe(false);
  });

  it('returns stale and leaves the file alone if it changed after the edit', async () => {
    await write(file('a.ts'), 'original');
    await agentWrite('c1', file('a.ts'), 'agent');
    await write(file('a.ts'), 'user edit');
    const r = await revertEdit(ws, 'c1', false);
    expect(r).toEqual({ outcome: 'stale', path: file('a.ts') });
    expect(await read(file('a.ts'))).toBe('user edit');
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('force overwrites a stale file (and force-deletes a user-edited created file)', async () => {
    await write(file('a.ts'), 'original');
    await agentWrite('c1', file('a.ts'), 'agent');
    await write(file('a.ts'), 'user edit');
    expect(await revertEdit(ws, 'c1', true)).toMatchObject({ outcome: 'reverted' });
    expect(await read(file('a.ts'))).toBe('original');

    await agentWrite('c2', file('new.ts'), 'agent');
    await write(file('new.ts'), 'user edit');
    expect(await revertEdit(ws, 'c2', true)).toMatchObject({ outcome: 'deleted' });
    expect(await exists(file('new.ts'))).toBe(false);
  });

  it('treats a file deleted after the edit as stale', async () => {
    await write(file('a.ts'), 'original');
    await agentWrite('c1', file('a.ts'), 'agent');
    await fs.promises.rm(file('a.ts'));
    expect(await revertEdit(ws, 'c1', false)).toEqual({ outcome: 'stale', path: file('a.ts') });
    expect(await exists(file('a.ts'))).toBe(false);
  });

  it('returns not-found when reverting twice or with an unknown id', async () => {
    await write(file('a.ts'), 'original');
    await agentWrite('c1', file('a.ts'), 'agent');
    await revertEdit(ws, 'c1', false);
    expect(await revertEdit(ws, 'c1', false)).toEqual({ outcome: 'not-found' });
    expect(await revertEdit(ws, 'nope', false)).toEqual({ outcome: 'not-found' });
  });

  it('returns stale when reverting an earlier edit after a later one touched the file', async () => {
    await write(file('a.ts'), 'v0');
    await agentWrite('c1', file('a.ts'), 'v1');
    await agentWrite('c2', file('a.ts'), 'v2');
    expect(await revertEdit(ws, 'c1', false)).toMatchObject({ outcome: 'stale' });
    expect(await revertEdit(ws, 'c2', false)).toMatchObject({ outcome: 'reverted' });
    expect(await read(file('a.ts'))).toBe('v1');
  });

  it('throws when the snapshot path is outside the workspace', async () => {
    const outside = path.join(home, 'outside.txt');
    await write(outside, 'original');
    await saveSnapshot(ws, 'c1', outside, 'agent', 'write_file');
    await write(outside, 'agent');
    await expect(revertEdit(ws, 'c1', true)).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' });
    expect(await read(outside)).toBe('agent');
  });
});
