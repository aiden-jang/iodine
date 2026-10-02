import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileContent, resolveWorkspacePath } from '../src/services/fileSystem';

let ws: string;

beforeEach(async () => {
  ws = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'iodine-ws-')));
  await fs.promises.mkdir(path.join(ws, 'client', 'src'), { recursive: true });
  await fs.promises.writeFile(path.join(ws, 'client', 'src', 'a.ts'), 'export const a = 1;\n');
});

afterEach(async () => {
  await fs.promises.rm(ws, { recursive: true, force: true });
});

describe('resolveWorkspacePath', () => {
  it('resolves relative paths against the workspace root, not the cwd', () => {
    expect(resolveWorkspacePath('client/src/a.ts', ws)).toBe(path.join(ws, 'client', 'src', 'a.ts'));
  });

  it('leaves absolute paths absolute (normalized)', () => {
    const abs = path.join(ws, 'client', '..', 'client', 'src', 'a.ts');
    expect(resolveWorkspacePath(abs, ws)).toBe(path.join(ws, 'client', 'src', 'a.ts'));
  });

  it('reads a workspace-relative file end to end', async () => {
    const abs = resolveWorkspacePath('client/src/a.ts', ws);
    await expect(readFileContent(abs, ws)).resolves.toBe('export const a = 1;\n');
  });

  it('still rejects relative paths that escape the workspace', async () => {
    const abs = resolveWorkspacePath('../outside.ts', ws);
    await expect(readFileContent(abs, ws)).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' });
  });
});
