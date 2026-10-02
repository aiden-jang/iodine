import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rootPath: '/ws' as string | null,
  executeTool: vi.fn(),
  requestTerminalApproval: vi.fn(),
  runTerminalCommand: vi.fn(),
}));

vi.mock('../src/state', () => ({
  get rootPath() {
    return mocks.rootPath;
  },
}));
vi.mock('../src/services/fileTools', () => ({ executeTool: mocks.executeTool }));
vi.mock('../src/services/terminalCommands', () => ({
  requestTerminalApproval: mocks.requestTerminalApproval,
  runTerminalCommand: mocks.runTerminalCommand,
}));

import { executeAgentTool } from '../src/services/agentTools';

function makeRes() {
  const writes: string[] = [];
  const res = { write: vi.fn((chunk: string) => { writes.push(chunk); return true; }) };
  return { res: res as any, writes };
}

function parseEvent(chunk: string) {
  const [eventLine, dataLine] = chunk.trim().split('\n');
  return {
    event: eventLine.replace('event: ', ''),
    data: JSON.parse(dataLine.replace('data: ', '')),
  };
}

const live = () => ({ aborted: false });
const WS_FILE = path.join('/ws', 'src/a.ts');

beforeEach(() => {
  mocks.rootPath = '/ws';
  vi.clearAllMocks();
});

describe('open_file', () => {
  it.each([undefined, '', '   ', 42])('rejects missing/blank path (%s)', async (p) => {
    const { res } = makeRes();
    const r = await executeAgentTool('open_file', { path: p }, res, live());
    expect(r).toEqual({ content: 'path is required', preview: 'path is required', error: true });
    expect(res.write).not.toHaveBeenCalled();
  });

  it('resolves relative paths against rootPath', async () => {
    const { res, writes } = makeRes();
    const r = await executeAgentTool('open_file', { path: ' src/a.ts ', line: 3 }, res, live());
    expect(r.error).toBe(false);
    expect(parseEvent(writes[0]).data.path).toBe(WS_FILE);
  });

  it('leaves absolute paths unchanged', async () => {
    const { res, writes } = makeRes();
    await executeAgentTool('open_file', { path: '/other/b.ts' }, res, live());
    expect(parseEvent(writes[0]).data.path).toBe('/other/b.ts');
  });

  it('leaves relative paths as-is when rootPath is unset', async () => {
    mocks.rootPath = null;
    const { res, writes } = makeRes();
    await executeAgentTool('open_file', { path: 'src/a.ts' }, res, live());
    expect(parseEvent(writes[0]).data.path).toBe('src/a.ts');
  });

  it('coerces line args from strings and floats', async () => {
    const { res, writes } = makeRes();
    await executeAgentTool(
      'open_file',
      { path: 'src/a.ts', line: '12', end_line: 20.9, start_col: '4', end_col: 'abc' },
      res,
      live(),
    );
    const { event, data } = parseEvent(writes[0]);
    expect(event).toBe('open_file');
    expect(data).toMatchObject({ line: 12, endLine: 20, startCol: 4, endCol: 1 });
  });

  it('defaults line to 1, endLine to line, and omits cols', async () => {
    const { res, writes } = makeRes();
    await executeAgentTool('open_file', { path: 'src/a.ts', line: 'nope' }, res, live());
    const { data } = parseEvent(writes[0]);
    expect(data.line).toBe(1);
    expect(data.endLine).toBe(1);
    expect(data.startCol).toBeUndefined();
    expect(data.endCol).toBeUndefined();
  });

  it('does not write when aborted but still returns success', async () => {
    const { res } = makeRes();
    const r = await executeAgentTool('open_file', { path: 'src/a.ts' }, res, { aborted: true });
    expect(res.write).not.toHaveBeenCalled();
    expect(r.error).toBe(false);
  });
});

describe('invoke_summary', () => {
  it('rejects missing path', async () => {
    const { res } = makeRes();
    const r = await executeAgentTool('invoke_summary', {}, res, live());
    expect(r.error).toBe(true);
  });

  it('resolves relative path and emits event', async () => {
    const { res, writes } = makeRes();
    const r = await executeAgentTool('invoke_summary', { path: 'src/a.ts' }, res, live());
    expect(parseEvent(writes[0])).toEqual({ event: 'invoke_summary', data: { path: WS_FILE } });
    expect(r.preview).toBe('Summary: a.ts');
  });
});

describe('git_commit_compose', () => {
  it('rejects blank message', async () => {
    const { res } = makeRes();
    const r = await executeAgentTool('git_commit_compose', { message: '  ' }, res, live());
    expect(r.error).toBe(true);
    expect(res.write).not.toHaveBeenCalled();
  });

  it('emits trimmed message', async () => {
    const { res, writes } = makeRes();
    const r = await executeAgentTool('git_commit_compose', { message: ' fix: x \n' }, res, live());
    expect(parseEvent(writes[0])).toEqual({ event: 'git_commit_compose', data: { message: 'fix: x' } });
    expect(r.error).toBe(false);
  });
});

describe('fallthrough to fileTools', () => {
  it('delegates unknown tools to executeTool', async () => {
    mocks.executeTool.mockResolvedValue({ content: 'ok', preview: 'ok', error: false });
    const { res } = makeRes();
    const input = { path: 'x' };
    const r = await executeAgentTool('read_file', input, res, live(), 'call-1');
    expect(mocks.executeTool).toHaveBeenCalledWith('read_file', input, 'call-1');
    expect(r.content).toBe('ok');
  });
});

describe('run_terminal_command', () => {
  it.each([
    [{ command: 'ls' }],
    [{ reason: 'why' }],
    [{ command: '  ', reason: 'why' }],
  ])('requires command and reason (%j)', async (input) => {
    const { res } = makeRes();
    const r = await executeAgentTool('run_terminal_command', input, res, live());
    expect(r.error).toBe(true);
    expect(mocks.requestTerminalApproval).not.toHaveBeenCalled();
  });

  it('does not run when approval is rejected', async () => {
    mocks.requestTerminalApproval.mockResolvedValue(false);
    const { res } = makeRes();
    const r = await executeAgentTool('run_terminal_command', { command: 'ls', reason: 'r' }, res, live(), 't1');
    expect(r).toMatchObject({ error: true, preview: 'Command rejected by user' });
    expect(mocks.runTerminalCommand).not.toHaveBeenCalled();
  });

  it('asks approval then runs, streaming output', async () => {
    mocks.requestTerminalApproval.mockResolvedValue(true);
    mocks.runTerminalCommand.mockImplementation(async (_req, onOutput) => {
      onOutput('stdout', 'hello');
      return { content: 'done', preview: 'done', error: false };
    });
    const { res, writes } = makeRes();
    const signal = live();
    const r = await executeAgentTool(
      'run_terminal_command',
      { command: ' ls ', reason: ' r ', longRunning: true },
      res,
      signal,
      't1',
    );
    const req = { id: 't1', command: 'ls', reason: 'r', longRunning: true };
    expect(mocks.requestTerminalApproval).toHaveBeenCalledWith(req, res, signal);
    expect(mocks.runTerminalCommand).toHaveBeenCalledWith(req, expect.any(Function));
    expect(parseEvent(writes[0])).toEqual({
      event: 'command_output',
      data: { id: 't1', stream: 'stdout', data: 'hello' },
    });
    expect(r.content).toBe('done');
  });

  it('generates an id when toolCallId is missing and treats non-true longRunning as false', async () => {
    mocks.requestTerminalApproval.mockResolvedValue(false);
    const { res } = makeRes();
    await executeAgentTool('run_terminal_command', { command: 'ls', reason: 'r', longRunning: 'yes' }, res, live());
    const [req] = mocks.requestTerminalApproval.mock.calls[0];
    expect(typeof req.id).toBe('string');
    expect(req.id.length).toBeGreaterThan(0);
    expect(req.longRunning).toBe(false);
  });

  it('suppresses streamed output after abort', async () => {
    mocks.requestTerminalApproval.mockResolvedValue(true);
    const signal = live();
    mocks.runTerminalCommand.mockImplementation(async (_req, onOutput) => {
      signal.aborted = true;
      onOutput('stdout', 'late');
      return { content: 'done', preview: 'done', error: false };
    });
    const { res } = makeRes();
    await executeAgentTool('run_terminal_command', { command: 'ls', reason: 'r' }, res, signal, 't1');
    expect(res.write).not.toHaveBeenCalled();
  });
});

describe('secret redaction', () => {
  // Built from parts so this file's own source doesn't contain a raw key.
  const KEY = 'sk-' + 'proj-' + 'abcdefghijklmnopqrstuvwx1234';
  const FILE = `OPENAI_API_KEY=${KEY}\nconst x = 1;`;

  it('masks secrets in tool results by default', async () => {
    mocks.executeTool.mockResolvedValue({ content: FILE, preview: `line: ${KEY}`, error: false });
    const { res } = makeRes();
    const r = await executeAgentTool('read_file', { path: '.env' }, res, live(), 'c1');
    expect(r.content).not.toContain(KEY);
    expect(r.content).toMatch(/\[REDACTED:\*+\]/);
    expect(r.content).toContain('const x = 1;');
    expect(r.preview).not.toContain(KEY);
    expect(r.error).toBe(false);
  });

  it('masks secrets in terminal output', async () => {
    mocks.requestTerminalApproval.mockResolvedValue(true);
    mocks.runTerminalCommand.mockResolvedValue({ content: `$ env\n${KEY}`, preview: 'env', error: false });
    const { res } = makeRes();
    const r = await executeAgentTool('run_terminal_command', { command: 'env', reason: 'r' }, res, live(), 't1', true);
    expect(r.content).not.toContain(KEY);
  });

  it('leaves tool results untouched when redaction is off', async () => {
    mocks.executeTool.mockResolvedValue({ content: FILE, preview: 'p', error: false });
    const { res } = makeRes();
    const r = await executeAgentTool('read_file', { path: '.env' }, res, live(), 'c1', false);
    expect(r.content).toBe(FILE);
  });
});
