import { describe, expect, it, vi } from 'vitest';
import {
  handleGeminiMessage,
  speakingAfterAgentEnds,
  formatReadFileOutput,
  READ_FILE_MAX_LINES,
  searchFilePaths,
  formatSearchFilesOutput,
  SEARCH_FILES_MAX_RESULTS,
  type SearchTreeNode,
  headerEndLine,
  pickDiffJump,
  formatDiffJumpOutput,
  GEMINI_LIVE_MODEL,
  GEMINI_VOICE,
  formatCurrentViewOutput,
  type TurnBuffers,
} from './geminiMessage';
import { buildLiveMeetingPrompt } from '../prompts/prompt';

const empty: TurnBuffers = { userBuf: '', agentBuf: '' };

describe('get_current_view', () => {
  it('declares a no-arg tool with a description', () => {
    const { actions } = handleGeminiMessage({ type: 'relay-ready' }, empty, { ctx: null, buildPrompt: () => '' });
    const payload = (actions[0] as { payload: any }).payload;
    const decl = payload.setup.tools[0].functionDeclarations
      .find((d: { name: string }) => d.name === 'get_current_view');
    expect(decl).toBeDefined();
    expect(decl.parameters).toEqual({ type: 'OBJECT', properties: {} });
    expect(decl.description).toMatch(/visible/);
  });

  it('formats path and visible content', () => {
    expect(formatCurrentViewOutput({ path: 'src/a.ts', content: 'const x = 1;' }))
      .toBe('Path: src/a.ts\n\nconst x = 1;');
  });

  it('reports no open file when the view is missing', () => {
    expect(formatCurrentViewOutput(undefined)).toBe('No file is currently open in the editor.');
    expect(formatCurrentViewOutput(null)).toBe('No file is currently open in the editor.');
  });

  it('is listed in the live meeting prompt', () => {
    expect(buildLiveMeetingPrompt()).toContain('get_current_view()');
  });
});
const deps = { ctx: 'some context', buildPrompt: (c?: string | null) => `PROMPT:${c}` };

describe('handleGeminiMessage', () => {
  describe('relay error', () => {
    it('sets the relay message as error and stops', () => {
      const { actions } = handleGeminiMessage({ type: 'error', message: 'no key' }, empty, deps);
      expect(actions).toEqual([{ type: 'setError', message: 'no key' }, { type: 'stop' }]);
    });

    it('falls back to a default error message', () => {
      const { actions } = handleGeminiMessage({ type: 'error' }, empty, deps);
      expect(actions[0]).toEqual({ type: 'setError', message: 'Meeting relay error' });
    });
  });

  describe('relay-ready', () => {
    it('sends the setup payload built from ctx', () => {
      const buildPrompt = vi.fn(() => 'PROMPT');
      const { actions } = handleGeminiMessage({ type: 'relay-ready' }, empty, { ctx: 'c', buildPrompt });

      expect(buildPrompt).toHaveBeenCalledWith('c');
      expect(actions).toEqual([{
        type: 'send',
        payload: {
          setup: {
            model: GEMINI_LIVE_MODEL,
            systemInstruction: { parts: [{ text: 'PROMPT' }] },
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { languageCode: 'en-US', voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{
              functionDeclarations: [
                expect.objectContaining({ name: 'read_file' }),
                expect.objectContaining({ name: 'open_file' }),
                expect.objectContaining({ name: 'search_files' }),
                expect.objectContaining({ name: 'get_current_view' }),
                expect.objectContaining({ name: 'get_whiteboard_instructions' }),
                expect.objectContaining({ name: 'write_whiteboard' }),
                expect.objectContaining({ name: 'read_whiteboard' }),
                expect.objectContaining({ name: 'clear_whiteboard' }),
              ],
            }],
          },
        },
      }]);
    });
  });

  describe('toolCall', () => {
    it('emits a runTool action with normalized calls', () => {
      const msg = {
        toolCall: {
          functionCalls: [
            { id: '1', name: 'read_file', args: { path: 'a.ts' } },
            { id: '2', name: 'open_file' },
          ],
        },
      };
      const { actions } = handleGeminiMessage(msg, empty, deps);
      expect(actions).toEqual([{
        type: 'runTool',
        calls: [
          { id: '1', name: 'read_file', args: { path: 'a.ts' } },
          { id: '2', name: 'open_file', args: {} },
        ],
      }]);
    });

    it('drops calls missing id or name, and emits nothing if none remain', () => {
      const msg = { toolCall: { functionCalls: [{ name: 'read_file' }, { id: 'x' }] } };
      expect(handleGeminiMessage(msg, empty, deps).actions).toEqual([]);
    });

    it('passes get_current_view through with empty args', () => {
      const msg = { toolCall: { functionCalls: [{ id: 'v', name: 'get_current_view' }] } };
      expect(handleGeminiMessage(msg, empty, deps).actions).toEqual([{
        type: 'runTool',
        calls: [{ id: 'v', name: 'get_current_view', args: {} }],
      }]);
    });

    it('leaves buffers untouched', () => {
      const buffers = { userBuf: 'u', agentBuf: 'a' };
      const r = handleGeminiMessage({ toolCall: { functionCalls: [] } }, buffers, deps);
      expect(r.buffers).toBe(buffers);
    });
  });

  describe('setupComplete', () => {
    it('marks ready and sends the silent "hi" trigger', () => {
      const { actions } = handleGeminiMessage({ setupComplete: {} }, empty, deps);
      expect(actions).toEqual([
        { type: 'markReady' },
        {
          type: 'send',
          payload: { clientContent: { turns: [{ role: 'user', parts: [{ text: 'hi' }] }], turnComplete: true } },
        },
      ]);
    });
  });

  describe('modelTurn audio', () => {
    it('plays only parts with inline data', () => {
      const msg = {
        serverContent: {
          modelTurn: { parts: [{ inlineData: { data: 'AAA' } }, {}, { inlineData: {} }, { inlineData: { data: 'BBB' } }] },
        },
      };
      const { actions } = handleGeminiMessage(msg, empty, deps);
      expect(actions).toEqual([
        { type: 'setSpeakingAgent' },
        { type: 'playAudio', base64: 'AAA' },
        { type: 'setSpeakingAgent' },
        { type: 'playAudio', base64: 'BBB' },
      ]);
    });

    it('does nothing for missing serverContent or empty parts', () => {
      expect(handleGeminiMessage({}, empty, deps).actions).toEqual([]);
      expect(handleGeminiMessage({ serverContent: { modelTurn: { parts: [] } } }, empty, deps).actions).toEqual([]);
    });
  });

  describe('transcription buffering', () => {
    it('accumulates input and output text across messages without emitting', () => {
      let buffers = empty;
      for (const [inp, out] of [['Hel', 'Hi '], ['lo', 'there']]) {
        const r = handleGeminiMessage(
          { serverContent: { inputTranscription: { text: inp }, outputTranscription: { text: out } } },
          buffers,
          deps,
        );
        expect(r.actions).toEqual([]);
        buffers = r.buffers;
      }
      expect(buffers).toEqual({ userBuf: 'Hello', agentBuf: 'Hi there' });
    });

    it('does not mutate the input buffers', () => {
      const input = { userBuf: 'a', agentBuf: 'b' };
      handleGeminiMessage({ serverContent: { inputTranscription: { text: 'x' } } }, input, deps);
      expect(input).toEqual({ userBuf: 'a', agentBuf: 'b' });
    });
  });

  describe('turnComplete', () => {
    it('flushes trimmed buffers in user-then-agent order and ends agent speaking', () => {
      const { actions, buffers } = handleGeminiMessage(
        { serverContent: { turnComplete: true } },
        { userBuf: '  hello ', agentBuf: ' hi there  ' },
        deps,
      );
      expect(actions).toEqual([
        { type: 'pushTranscript', entry: { role: 'user', text: 'hello' } },
        { type: 'pushTranscript', entry: { role: 'agent', text: 'hi there' } },
        { type: 'endAgentSpeaking' },
      ]);
      expect(buffers).toEqual(empty);
    });

    it('skips empty or whitespace-only buffers', () => {
      const { actions } = handleGeminiMessage(
        { serverContent: { turnComplete: true } },
        { userBuf: '   ', agentBuf: '' },
        deps,
      );
      expect(actions).toEqual([{ type: 'endAgentSpeaking' }]);
    });

    it('includes text arriving in the same message as turnComplete', () => {
      const { actions } = handleGeminiMessage(
        { serverContent: { outputTranscription: { text: 'bye' }, turnComplete: true } },
        { userBuf: '', agentBuf: 'good' },
        deps,
      );
      expect(actions[0]).toEqual({ type: 'pushTranscript', entry: { role: 'agent', text: 'goodbye' } });
    });
  });

  describe('interrupted', () => {
    it('stops playback and flushes the cut-off agent text, keeping the user buffer', () => {
      const { actions, buffers } = handleGeminiMessage(
        { serverContent: { interrupted: true } },
        { userBuf: 'wait', agentBuf: ' so the next step ' },
        deps,
      );
      expect(actions).toEqual([
        { type: 'stopPlayback' },
        { type: 'pushTranscript', entry: { role: 'agent', text: 'so the next step (interrupted)' } },
      ]);
      expect(buffers).toEqual({ userBuf: 'wait', agentBuf: '' });
    });

    it('only stops playback when there is no agent text yet', () => {
      const { actions } = handleGeminiMessage({ serverContent: { interrupted: true } }, empty, deps);
      expect(actions).toEqual([{ type: 'stopPlayback' }]);
    });
  });
});

describe('speakingAfterAgentEnds', () => {
  it('resets agent to idle', () => {
    expect(speakingAfterAgentEnds('agent')).toBe('idle');
  });

  it('does not clear the user speaking state', () => {
    expect(speakingAfterAgentEnds('user')).toBe('user');
  });

  it('leaves idle as idle', () => {
    expect(speakingAfterAgentEnds('idle')).toBe('idle');
  });
});

describe('formatReadFileOutput', () => {
  const file = Array.from({ length: 500 }, (_, i) => `line${i + 1}`).join('\n');

  it('numbers lines and caps at READ_FILE_MAX_LINES by default', () => {
    const out = formatReadFileOutput(file).split('\n');
    expect(out[0]).toBe('1: line1');
    expect(out[READ_FILE_MAX_LINES - 1]).toBe(`${READ_FILE_MAX_LINES}: line${READ_FILE_MAX_LINES}`);
    expect(out.at(-1)).toBe(`… (${500 - READ_FILE_MAX_LINES} more lines)`);
  });

  it('respects a requested range', () => {
    expect(formatReadFileOutput(file, 10, 12)).toBe('10: line10\n11: line11\n12: line12\n… (488 more lines)');
  });

  it('clamps an oversized range to the cap', () => {
    const out = formatReadFileOutput(file, 1, 450).split('\n');
    expect(out).toHaveLength(READ_FILE_MAX_LINES + 1);
  });

  it('omits the trailer when the file ends within range', () => {
    expect(formatReadFileOutput('a\nb', 1)).toBe('1: a\n2: b');
  });

  it('ignores invalid start/end values', () => {
    expect(formatReadFileOutput('a\nb', 'x', -3)).toBe('1: a\n2: b');
  });
});

const file = (path: string): SearchTreeNode => ({
  name: path.split('/').pop()!, path, type: 'file', children: null,
});
const dir = (path: string, children: SearchTreeNode[]): SearchTreeNode => ({
  name: path.split('/').pop()!, path, type: 'directory', children,
});

const tree = dir('/ws', [
  dir('/ws/client', [
    file('/ws/client/src/api/files.ts'),
    file('/ws/client/src/hooks/geminiMessage.ts'),
    file('/ws/client/src/hooks/geminiMessage.test.ts'),
  ]),
  dir('/ws/server', [
    file('/ws/server/src/routes/files.ts'),
    file('/ws/server/src/services/fileSystem.ts'),
  ]),
]);

describe('searchFilePaths', () => {
  it('matches spoken names and returns workspace-relative paths', () => {
    expect(searchFilePaths(tree, 'gemini message')[0]).toBe('client/src/hooks/geminiMessage.ts');
  });

  it('returns every candidate for an ambiguous name, exact names first', () => {
    const hits = searchFilePaths(tree, 'files.ts');
    expect(hits.slice(0, 2).sort()).toEqual(['client/src/api/files.ts', 'server/src/routes/files.ts']);
  });

  it('can narrow with directory words', () => {
    expect(searchFilePaths(tree, 'api files')).toEqual(['client/src/api/files.ts']);
  });

  it('returns nothing for an empty or unmatched query', () => {
    expect(searchFilePaths(tree, '   ')).toEqual([]);
    expect(searchFilePaths(tree, 'nonexistent')).toEqual([]);
  });

  it('ignores directories', () => {
    expect(searchFilePaths(tree, 'server')).not.toContain('server');
  });
});

const src = [
  "import { a } from './a';",   // 1
  'import {',                   // 2
  '  b,',                       // 3
  '  c,',                       // 4
  "} from './b';",              // 5
  '',                           // 6
  '// helper',                  // 7
  'export function f() {',      // 8
  ...Array.from({ length: 40 }, (_, i) => `  line${i};`), // 9–48
  '}',                          // 49
].join('\n');

describe('headerEndLine', () => {
  it('covers single- and multi-line imports but not code', () => {
    expect(headerEndLine(src)).toBe(5);
  });

  it('returns 0 when there are no imports', () => {
    expect(headerEndLine('const x = 1;')).toBe(0);
  });
});

describe('pickDiffJump', () => {
  it('returns undefined when there are no hunks', () => {
    expect(pickDiffJump(undefined, src)).toBeUndefined();
    expect(pickDiffJump([], src)).toBeUndefined();
  });

  it('skips an import-only hunk and lands on the code change', () => {
    const jump = pickDiffJump([{ startLine: 3, lineCount: 2 }, { startLine: 20, lineCount: 1 }], src);
    expect(jump?.line).toBe(20);
    expect(jump?.sections).toEqual([
      { start: 3, end: 4, header: true },
      { start: 20, end: 20, header: false },
    ]);
  });

  it('picks the largest body hunk, counting removed lines, earliest on ties', () => {
    expect(pickDiffJump([
      { startLine: 12, lineCount: 1 },
      { startLine: 30, lineCount: 1, originalLines: ['x', 'y', 'z'] },
    ], src)?.line).toBe(30);
    expect(pickDiffJump([{ startLine: 40, lineCount: 2 }, { startLine: 15, lineCount: 2 }], src)?.line).toBe(15);
  });

  it('falls back to the first hunk when every change is in the header, clamping line 0', () => {
    expect(pickDiffJump([{ startLine: 4, lineCount: 1 }, { startLine: 0, lineCount: 0 }], src)?.line).toBe(1);
  });
});

describe('formatDiffJumpOutput', () => {
  it('lists sections, marks imports, and never includes a path', () => {
    const out = formatDiffJumpOutput({
      line: 20,
      sections: [{ start: 3, end: 4, header: true }, { start: 20, end: 20, header: false }],
    });
    expect(out).toContain('Opened at line 20');
    expect(out).toContain('3-4 (imports), 20');
    expect(out).not.toMatch(/\//);
  });
});

describe('formatSearchFilesOutput', () => {
  it('returns the single path and asks for confirmation when unambiguous', () => {
    const out = formatSearchFilesOutput('x', ['a/b.ts']);
    expect(out).toContain('1 match: a/b.ts');
    expect(out).toContain('Confirm with the user');
  });

  it('tells the agent to offer candidates one at a time with pauses', () => {
    const out = formatSearchFilesOutput('files', ['a/files.ts', 'b/files.ts']);
    expect(out).toContain('one at a time');
    expect(out).toContain('pausing after each');
  });

  it('tells the agent to ask the user when ambiguous', () => {
    const out = formatSearchFilesOutput('files', ['a/files.ts', 'b/files.ts']);
    expect(out).toContain('ask the user which one');
    expect(out).toContain('a/files.ts');
    expect(out).toContain('b/files.ts');
  });

  it(`caps the list at ${SEARCH_FILES_MAX_RESULTS}`, () => {
    const many = Array.from({ length: SEARCH_FILES_MAX_RESULTS + 5 }, (_, i) => `f${i}.ts`);
    const out = formatSearchFilesOutput('f', many);
    expect(out).toContain('f0.ts');
    expect(out).not.toContain(`f${SEARCH_FILES_MAX_RESULTS}.ts`);
    expect(out).toContain('5 more');
  });

  it('reports no matches clearly', () => {
    expect(formatSearchFilesOutput('zzz', [])).toContain('No files matched');
  });
});
