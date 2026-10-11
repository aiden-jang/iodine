import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listDirectories } from '../src/routes/files';

let base: string;
let root: string;

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'iodine-directory-browser-')));
  root = path.join(base, 'root');
  fs.mkdirSync(path.join(root, 'empty'), { recursive: true });
  fs.mkdirSync(path.join(root, 'project', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project', 'file.txt'), 'ignored');
});

afterAll(() => {
  if (base) fs.rmSync(base, { recursive: true, force: true });
});

describe('directory browser', () => {
  it('lists empty folders without reading their files', async () => {
    await expect(listDirectories(root, root)).resolves.toEqual({
      path: root,
      parentPath: null,
      directories: [
        { name: 'empty', path: path.join(root, 'empty') },
        { name: 'project', path: path.join(root, 'project') },
      ],
    });
  });

  it('allows browsing an empty folder', async () => {
    await expect(listDirectories(path.join(root, 'empty'), root)).resolves.toEqual({
      path: path.join(root, 'empty'),
      parentPath: root,
      directories: [],
    });
  });

  it('allows browsing outside a previous folder when the browser starts at the filesystem root', async () => {
    const filesystemRoot = path.parse(base).root;
    await expect(listDirectories(base, filesystemRoot)).resolves.toMatchObject({
      path: base,
      parentPath: path.dirname(base),
    });
  });

  it('rejects paths outside the browser root', async () => {
    await expect(listDirectories(base, root)).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' });
  });
});
