// Pure message-handling logic for the Gemini Live relay.
// No WebSocket, React, or audio APIs here — the hook executes the returned actions.

export type TranscriptEntry = { role: 'user' | 'agent'; text: string };

export interface TurnBuffers {
  userBuf: string;
  agentBuf: string;
}

export interface GeminiMessageDeps {
  ctx: string | null | undefined;
  buildPrompt: (ctx?: string | null) => string;
  /** Pre-formatted open-tabs block (see formatOpenTabs), appended to the system instruction. */
  tabs?: string;
}

/** Snapshot of the editor tabs, as absolute paths from the workbench. */
export interface EditorTabs {
  root: string | null;
  paths: string[];
  active: string | null;
}

/** Strip the workspace root so the agent sees paths open_file accepts as-is. */
export function toWorkspaceRelative(p: string, root: string | null): string {
  if (!root) return p;
  const r = root.replace(/[/\\]+$/, '');
  return p === r ? '.' : p.startsWith(r + '/') || p.startsWith(r + '\\') ? p.slice(r.length + 1) : p;
}

/** Tell the agent which files are open (and which is active) with exact workspace-relative paths. */
export function formatOpenTabs(t: EditorTabs): string {
  if (!t.paths.length) return 'Open editor tabs: none.';
  const lines = t.paths.map(p => {
    const rel = toWorkspaceRelative(p, t.root);
    return p === t.active ? `- ${rel} (active — the user is looking at this)` : `- ${rel}`;
  });
  return `Open editor tabs (exact paths — use these directly with open_file/read_file):\n${lines.join('\n')}`;
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type GeminiAction =
  | { type: 'send'; payload: unknown }
  | { type: 'setError'; message: string }
  | { type: 'stop' }
  | { type: 'markReady' }
  | { type: 'setSpeakingAgent' }
  | { type: 'playAudio'; base64: string }
  | { type: 'pushTranscript'; entry: TranscriptEntry }
  | { type: 'endAgentSpeaking' }
  /** User barged in: drop any queued/playing agent audio immediately. */
  | { type: 'stopPlayback' }
  | { type: 'runTool'; calls: ToolCall[] };

export interface GeminiMessageResult {
  buffers: TurnBuffers;
  actions: GeminiAction[];
}

export type SpeakingState = 'user' | 'agent' | 'idle';

/** Applied for `endAgentSpeaking`: only clears the agent state, never the user's. */
export function speakingAfterAgentEnds(s: SpeakingState): SpeakingState {
  return s === 'agent' ? 'idle' : s;
}

export interface CurrentView { path: string; content: string }

/** Formats the editor's visible code for the get_current_view tool. */
export function formatCurrentViewOutput(view: CurrentView | null | undefined): string {
  return view
    ? `Path: ${view.path}\n\n${view.content}`
    : 'No file is currently open in the editor.';
}

export const READ_FILE_MAX_LINES = 200;

/** Formats file content for the read_file tool, capped at READ_FILE_MAX_LINES lines. */
export function formatReadFileOutput(content: string, startLine?: unknown, endLine?: unknown): string {
  const lines = content.split('\n');
  const start = typeof startLine === 'number' && startLine >= 1 ? Math.floor(startLine) : 1;
  const maxEnd = start + READ_FILE_MAX_LINES - 1;
  const requestedEnd = typeof endLine === 'number' && endLine >= start ? Math.floor(endLine) : maxEnd;
  const end = Math.min(requestedEnd, maxEnd);
  let output = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
  if (lines.length > end) output += `\n… (${lines.length - end} more lines)`;
  return output;
}

export const SEARCH_FILES_MAX_RESULTS = 10;

/** Minimal tree shape used by searchFilePaths (matches FileNode from ../types). */
export interface SearchTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: SearchTreeNode[] | null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Finds files whose workspace-relative path matches a (possibly spoken) name.
 * Every whitespace-separated query token must appear in the normalized path,
 * so "gemini message" matches "client/src/hooks/geminiMessage.ts".
 * Returns relative paths, best matches first.
 */
export function searchFilePaths(tree: SearchTreeNode, query: string): string[] {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  const root = tree.path.replace(/[\\/]+$/, '');
  const whole = tokens.join('');

  const hits: { rel: string; score: number }[] = [];
  const walk = (node: SearchTreeNode) => {
    if (node.type === 'file') {
      const rel = node.path.startsWith(root) ? node.path.slice(root.length).replace(/^[\\/]+/, '') : node.path;
      const normPath = normalize(rel);
      if (tokens.every(t => normPath.includes(t))) {
        const base = normalize(node.name);
        const stem = normalize(node.name.replace(/\.[^.]+$/, ''));
        const score = stem === whole || base === whole ? 0 : base.includes(whole) ? 1 : 2;
        hits.push({ rel, score });
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);

  return hits
    .sort((a, b) => a.score - b.score || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel))
    .map(h => h.rel);
}

/** Formats search_files output; tells the agent to ask the user when ambiguous. */
export function formatSearchFilesOutput(query: string, matches: string[]): string {
  if (!matches.length) {
    return `No files matched "${query}". Tell the user and ask them for a different name.`;
  }
  if (matches.length === 1) {
    return `1 match: ${matches[0]}\nConfirm with the user before opening it.`;
  }
  const shown = matches.slice(0, SEARCH_FILES_MAX_RESULTS);
  const extra = matches.length - shown.length;
  return [
    `${matches.length} matches for "${query}" — ambiguous. Offer them one at a time and ask the user which one to open, pausing after each for a yes or no. Do not pick one yourself.`,
    ...shown,
    ...(extra > 0 ? [`… (${extra} more — ask the user to be more specific)`] : []),
  ].join('\n');
}

export type DiffHunkLite = { startLine: number; lineCount: number; originalLines?: string[] };

export interface DiffJump {
  /** Line to scroll to (≥ 1). */
  line: number;
  /** One entry per changed section, in file order, for the agent to move between. */
  sections: { start: number; end: number; header: boolean }[];
}

/**
 * Last line (1-based) of the file's leading import/header block: imports
 * (including multi-line ones), blank lines and comments. 0 if none.
 */
export function headerEndLine(content: string): number {
  const lines = content.split('\n');
  let end = 0;
  let inImport = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (inImport) {
      end = i + 1;
      if (/\bfrom\s+['"]/.test(t) || t.endsWith(';')) inImport = false;
      continue;
    }
    if (/^import\b/.test(t)) {
      end = i + 1;
      // Single-line forms: `import x from '…'`, `import '…'`, or ending in `;`.
      inImport = !(/\bfrom\s+['"]/.test(t) || /^import\s+['"]/.test(t) || t.endsWith(';'));
      continue;
    }
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    break;
  }
  return end;
}

/**
 * Where open_file should land when no line is given: the "meat" of the change.
 * Hunks entirely inside the import header are skipped; among the rest the
 * biggest (added + removed lines) wins, earliest on ties. Falls back to the
 * first hunk if every change is in the header. Undefined when nothing changed.
 */
export function pickDiffJump(hunks: DiffHunkLite[] | undefined, content: string): DiffJump | undefined {
  if (!hunks?.length) return undefined;
  const headerEnd = headerEndLine(content);
  const sorted = [...hunks].sort((a, b) => a.startLine - b.startLine);
  const sections = sorted.map(h => {
    const start = Math.max(1, h.startLine);
    const end = Math.max(start, h.startLine + h.lineCount - 1);
    return { start, end, header: end <= headerEnd, size: h.lineCount + (h.originalLines?.length ?? 0) };
  });
  const body = sections.filter(s => !s.header);
  const best = body.length
    ? body.reduce((a, b) => (b.size > a.size ? b : a))
    : sections[0];
  return {
    line: best.start,
    sections: sections.map(({ start, end, header }) => ({ start, end, header })),
  };
}

/** Tool output for open_file when it jumped via the diff. Keeps paths out so the agent doesn't repeat them. */
export function formatDiffJumpOutput(jump: DiffJump): string {
  const list = jump.sections
    .slice(0, 8)
    .map(s => `${s.start === s.end ? s.start : `${s.start}-${s.end}`}${s.header ? ' (imports)' : ''}`)
    .join(', ');
  const more = jump.sections.length > 8 ? `, and ${jump.sections.length - 8} more` : '';
  return `Opened at line ${jump.line}, the main change in the git diff. ` +
    `Changed sections: ${list}${more}. ` +
    'To show another section, call open_file again with that line.';
}

export const GEMINI_LIVE_MODEL = 'models/gemini-3.8-live';
export const GEMINI_VOICE = 'Aoede';

type ServerContent = {
  modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
  /** Set by Gemini when the user starts talking over the agent. */
  interrupted?: boolean;
};

export function handleGeminiMessage(
  msg: Record<string, unknown>,
  buffers: TurnBuffers,
  deps: GeminiMessageDeps,
): GeminiMessageResult {
  // Relay error (e.g. missing API key)
  if (msg.type === 'error') {
    return {
      buffers,
      actions: [
        { type: 'setError', message: (msg.message as string) ?? 'Meeting relay error' },
        { type: 'stop' },
      ],
    };
  }

  // Relay ready — send the Gemini Live setup message
  if (msg.type === 'relay-ready') {
    return {
      buffers,
      actions: [{
        type: 'send',
        payload: {
          setup: {
            model: GEMINI_LIVE_MODEL,
            systemInstruction: {
              parts: [{
                text: deps.tabs
                  ? `${deps.buildPrompt(deps.ctx)}\n\n[OPEN TABS]\n${deps.tabs}`
                  : deps.buildPrompt(deps.ctx),
              }],
            },
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                languageCode: 'en-US',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{
              functionDeclarations: [
                {
                  name: 'read_file',
                  description: 'Read a file from the workspace. Use to answer specific questions about code. Call it silently — do not announce it.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      path: { type: 'STRING', description: 'Workspace-relative path, e.g. src/index.ts' },
                      start_line: { type: 'INTEGER', description: 'First line to read (1-indexed, optional)' },
                      end_line: { type: 'INTEGER', description: 'Last line to read (1-indexed, max 200 lines from start_line, optional)' },
                    },
                    required: ['path'],
                  },
                },
                {
                  name: 'open_file',
                  description: 'Open a file in the editor and optionally jump to a specific line. Use when you want the user to see a particular piece of code. Do not narrate the call (no "opening X and scrolling to line N") — just talk about the code once it is on screen.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      path: { type: 'STRING', description: 'Workspace-relative path' },
                      line: { type: 'INTEGER', description: 'Line number to highlight (optional). If omitted and the file has uncommitted changes, the editor scrolls to the first changed line.' },
                    },
                    required: ['path'],
                  },
                },
                {
                  name: 'search_files',
                  description: 'Find files by name when you do not know the exact workspace path. Returns matching workspace-relative paths. If several match, ask the user which one before opening.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      query: { type: 'STRING', description: 'File name or words from it, e.g. "gemini message" or "files.ts"' },
                    },
                    required: ['query'],
                  },
                },
                {
                  name: 'get_current_view',
                  description: 'Return the file currently open in the editor and the exact lines visible on screen (or the user\'s selection). Call this immediately when the user asks "what is this?", "what am I looking at?", "what\'s in this file?", or anything about the current code on screen. No path argument needed.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {},
                  },
                },
                {
                  name: 'get_whiteboard_instructions',
                  description: 'Fetch the drawing style guide. You MUST call this before calling write_whiteboard — write_whiteboard will fail with an error if you have not called this first.',
                  parameters: { type: 'OBJECT', properties: {} },
                },
                {
                  name: 'write_whiteboard',
                  description: 'Append text to the shared whiteboard. You MUST call get_whiteboard_instructions() before this — it will fail otherwise.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      text: { type: 'STRING', description: 'Text to append. May contain ASCII art, line drawings, or plain prose.' },
                    },
                    required: ['text'],
                  },
                },
                {
                  name: 'read_whiteboard',
                  description: 'Read the current contents of the shared whiteboard. Use to recall what has been drawn so far before deciding what to add next.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {},
                  },
                },
                {
                  name: 'clear_whiteboard',
                  description: 'Erase the entire whiteboard so you can start a fresh diagram. Use this before redrawing an existing diagram — appending to an existing one creates duplicates and confusion.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {},
                  },
                },
              ],
            }],
          },
        },
      }],
    };
  }

  // Setup complete — mark ready and send a silent trigger so Gemini opens with its intro.
  if ('setupComplete' in msg) {
    return {
      buffers,
      actions: [
        { type: 'markReady' },
        {
          type: 'send',
          payload: {
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: 'hi' }] }],
              turnComplete: true,
            },
          },
        },
      ],
    };
  }

  // Tool call — the AI wants to call search_files, read_file, or open_file
  if (msg.toolCall) {
    type FunctionCall = { id?: string; name?: string; args?: Record<string, unknown> };
    const raw = (msg.toolCall as { functionCalls?: FunctionCall[] }).functionCalls ?? [];
    const calls: ToolCall[] = raw
      .filter((c): c is Required<FunctionCall> => !!(c.id && c.name))
      .map(c => ({ id: c.id, name: c.name, args: c.args ?? {} }));
    return { buffers, actions: calls.length ? [{ type: 'runTool', calls }] : [] };
  }

  const actions: GeminiAction[] = [];
  let { userBuf, agentBuf } = buffers;
  const serverContent = msg.serverContent as ServerContent | undefined;

  // Agent audio
  for (const part of serverContent?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) {
      actions.push({ type: 'setSpeakingAgent' });
      actions.push({ type: 'playAudio', base64: part.inlineData.data });
    }
  }

  // Accumulate transcription text per turn
  if (serverContent?.inputTranscription?.text) userBuf += serverContent.inputTranscription.text;
  if (serverContent?.outputTranscription?.text) agentBuf += serverContent.outputTranscription.text;

  // Barge-in: stop playback now and close out the cut-off agent text so it
  // doesn't get merged into the next reply.
  if (serverContent?.interrupted) {
    actions.push({ type: 'stopPlayback' });
    if (agentBuf.trim()) {
      actions.push({ type: 'pushTranscript', entry: { role: 'agent', text: `${agentBuf.trim()} (interrupted)` } });
      agentBuf = '';
    }
  }

  // Flush completed turn buffers into the transcript
  if (serverContent?.turnComplete) {
    if (userBuf.trim()) {
      actions.push({ type: 'pushTranscript', entry: { role: 'user', text: userBuf.trim() } });
      userBuf = '';
    }
    if (agentBuf.trim()) {
      actions.push({ type: 'pushTranscript', entry: { role: 'agent', text: agentBuf.trim() } });
      agentBuf = '';
    }
    actions.push({ type: 'endAgentSpeaking' });
  }

  return { buffers: { userBuf, agentBuf }, actions };
}
