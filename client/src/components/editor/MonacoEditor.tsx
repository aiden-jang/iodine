import { useRef, useEffect, useState } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import type { editor as MonacoEditorAPI } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import type { OpenFile } from '../../types';
import type { DiffData } from '../../hooks/useFileDiff';
import type { DiffHunk } from '../../api/files';
import { DiffHunkDialog } from './DiffHunkDialog';

interface MonacoEditorProps {
  file: OpenFile;
  onContentChange: (path: string, content: string) => void;
  diffData?: DiffData | null;
  onEditorMount?: (editor: MonacoEditorAPI.IStandaloneCodeEditor) => void;
  onAfterRevert?: () => void;
  /** Fired on editor scroll — used by proactive help activity tracking. */
  onActivity?: () => void;
  /** Enables Vim keybindings (via monaco-vim) for this editor instance. */
  vimMode?: boolean;
}

type DialogState = { hunk: DiffHunk; currents: string[] };

// ── Hunk helpers ──────────────────────────────────────────────────────────────

/**
 * The gutter line(s) a hunk's marker occupies. A deleted hunk owns no
 * working-copy lines, so its marker is anchored to the line it used to follow
 * (or line 1 when the deletion was at the top of the file).
 */
function markerRange(hunk: DiffHunk): [number, number] {
  if (hunk.lineCount === 0) {
    const anchor = hunk.startLine === 0 ? 1 : hunk.startLine;
    return [anchor, anchor];
  }
  return [hunk.startLine, hunk.startLine + hunk.lineCount - 1];
}

/** Reads the hunk's current working-copy text, or [] for a pure deletion. */
function readCurrentLines(model: MonacoEditorAPI.ITextModel, hunk: DiffHunk): string[] | null {
  if (hunk.lineCount === 0) return [];
  if (hunk.startLine + hunk.lineCount - 1 > model.getLineCount()) return null;
  const out: string[] = [];
  for (let n = hunk.startLine; n < hunk.startLine + hunk.lineCount; n++) out.push(model.getLineContent(n));
  return out;
}

/**
 * Restores a hunk's committed text, replacing the whole hunk in one edit so an
 * unbalanced change (2 lines → 1) is restored completely rather than half-way.
 * Uses executeEdits so the revert stays on the undo stack.
 */
function revertHunk(editor: MonacoEditorAPI.IStandaloneCodeEditor, hunk: DiffHunk): void {
  const model = editor.getModel();
  if (!model) return;
  const { startLine, lineCount, originalLines } = hunk;
  const text = originalLines.join('\n');

  // Pure deletion → re-insert the removed lines after startLine.
  if (lineCount === 0) {
    if (startLine === 0) {
      editor.executeEdits('revert-hunk', [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        text: text + '\n',
      }]);
    } else {
      const col = model.getLineMaxColumn(startLine);
      editor.executeEdits('revert-hunk', [{
        range: { startLineNumber: startLine, startColumn: col, endLineNumber: startLine, endColumn: col },
        text: '\n' + text,
      }]);
    }
    return;
  }

  const endLine = startLine + lineCount - 1;

  // Pure addition → remove the lines, taking a newline with them so no blank
  // line is left behind.
  if (originalLines.length === 0) {
    const total = model.getLineCount();
    let range;
    if (endLine < total) {
      range = { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine + 1, endColumn: 1 };
    } else if (startLine > 1) {
      range = {
        startLineNumber: startLine - 1,
        startColumn: model.getLineMaxColumn(startLine - 1),
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      };
    } else {
      range = { startLineNumber: 1, startColumn: 1, endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine) };
    }
    editor.executeEdits('revert-hunk', [{ range, text: '' }]);
    return;
  }

  // Modified → swap the whole range for the committed text.
  editor.executeEdits('revert-hunk', [{
    range: { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine) },
    text,
  }]);
}

// ── Monaco language configuration ─────────────────────────────────────────────

/**
 * Configures Monaco's TypeScript/JavaScript language service before any editor
 * instance is created. Runs once (Monaco's global state is shared across all
 * instances). Key settings:
 *   - jsx: ReactJSX  → enables JSX/TSX syntax so angle-bracket elements are
 *                       not flagged as errors in .tsx files.
 *   - noSemanticValidation: true  → suppresses false-positive "cannot find
 *       module" / "cannot find name" errors that arise because Monaco has no
 *       access to the workspace's node_modules. Syntax errors are still shown.
 */
const configureMonacoLanguages: BeforeMount = (monaco: Monaco) => {
  const compilerOptions: Monaco['languages']['typescript']['CompilerOptions'] = {
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    noEmit: true,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  };

  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    // Suppress only the two codes that fire because Monaco has no access to
    // the workspace's node_modules. All other semantic errors stay visible.
    diagnosticCodesToIgnore: [
      2307, // Cannot find module 'X' or its corresponding type declarations
      7016, // Could not find a declaration file for module 'X'
      8006, // 'type' aliases can only be used in TypeScript files
      8009, // 'interface' declarations can only be used in TypeScript files
      8010, // Type annotations can only be used in TypeScript files
      8013, // Non-null assertions can only be used in TypeScript files
      8016, // Type assertion expressions can only be used in TypeScript files
    ],
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MonacoEditor({ file, onContentChange, diffData, onEditorMount, onAfterRevert, onActivity, vimMode = false }: MonacoEditorProps) {
  const editorRef = useRef<MonacoEditorAPI.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const diffDataRef = useRef<DiffData | null>(diffData ?? null);
  const onAfterRevertRef = useRef(onAfterRevert);
  onAfterRevertRef.current = onAfterRevert;
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const [mounted, setMounted] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Tracks the last content value that originated from the editor's own onChange.
  // Used to distinguish user edits (which must not be pushed back) from external
  // content updates (refreshFile, agent writes) which need explicit model sync.
  const editorValueRef = useRef(file.content);

  // Keep diffDataRef in sync so the click handler always has the latest data
  useEffect(() => { diffDataRef.current = diffData ?? null; }, [diffData]);

  // Close any open dialog when the file changes
  useEffect(() => { setDialog(null); }, [file.path]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    onEditorMount?.(editor);

    let lastScrollActivity = 0;
    editor.onDidScrollChange(() => {
      const now = Date.now();
      if (now - lastScrollActivity >= 3000) {
        lastScrollActivity = now;
        onActivityRef.current?.();
      }
    });

    editor.onMouseDown(e => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber == null || !diffDataRef.current) return;

      const hunk = diffDataRef.current.hunks.find(h => {
        const [from, to] = markerRange(h);
        return lineNumber >= from && lineNumber <= to;
      });
      if (!hunk) return;

      const model = editor.getModel();
      if (!model) return;
      const currents = readCurrentLines(model, hunk);
      if (currents === null) return;

      setDialog({ hunk, currents });
    });

    setMounted(true);
  };

  // Attach/detach Vim keybindings. monaco-vim is loaded lazily so it only
  // costs anything once someone actually turns Vim on.
  useEffect(() => {
    const editor = editorRef.current;
    if (!vimMode || !editor || !mounted) return;
    let disposed = false;
    let vim: { dispose(): void } | null = null;
    import('monaco-vim').then(({ initVimMode }) => {
      if (disposed) return;
      vim = initVimMode(editor, null);
      editor.focus();
    }).catch(err => console.error('Failed to load monaco-vim', err));
    return () => {
      disposed = true;
      vim?.dispose();
    };
  }, [vimMode, mounted]);

  // Revert the change previewed in the dialog. Guards against the buffer having
  // moved on (further edits, or a diff refresh that made the hunk stale) while
  // the dialog was open, so we never clobber newer edits.
  const handleRevert = () => {
    const state = dialog;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!state || !editor || !model) { setDialog(null); return; }

    const live = readCurrentLines(model, state.hunk);
    const stillMatches =
      live !== null &&
      live.length === state.currents.length &&
      live.every((text, i) => text === state.currents[i]);

    if (stillMatches) {
      revertHunk(editor, state.hunk);
      onAfterRevertRef.current?.();
    }
    setDialog(null);
  };

  // Apply/update decorations whenever diff data changes
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !mounted) return;

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
    if (!diffData) return;

    const newDecorations: MonacoEditorAPI.IModelDeltaDecoration[] = [];

    for (const hunk of diffData.hunks) {
      const [from, to] = markerRange(hunk);

      if (hunk.type === 'deleted') {
        newDecorations.push({
          range: new monaco.Range(from, 1, from, 1),
          options: {
            glyphMarginClassName: 'git-deleted-glyph',
            glyphMarginHoverMessage: { value: 'Click to view and restore the deleted lines' },
            overviewRuler: { color: '#f44747', position: monaco.editor.OverviewRulerLane.Left },
          },
        });
        continue;
      }

      const isAdded = hunk.type === 'added';
      newDecorations.push({
        range: new monaco.Range(from, 1, to, 1),
        options: {
          isWholeLine: true,
          className: isAdded ? 'git-added-line' : 'git-modified-line',
          glyphMarginClassName: isAdded ? 'git-added-glyph' : 'git-modified-glyph',
          glyphMarginHoverMessage: { value: 'Click to view and revert this change' },
          overviewRuler: {
            color: isAdded ? '#2ea043' : '#e9b44c',
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations([], newDecorations);
  }, [diffData, mounted]);

  // Sync external content changes (refreshFile, agent writes) into the editor
  // while preserving cursor and selection. Changes that came from the editor's
  // own onChange are already reflected in the model and must be skipped, otherwise
  // @monaco-editor/react's controlled-value path replaces the full model range
  // and moves the cursor to the last line.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !mounted) return;
    if (file.content === editorValueRef.current) return; // editor-originated change — no-op
    const position = editor.getPosition();
    const selection = editor.getSelection();
    editorValueRef.current = file.content ?? '';
    editor.setValue(file.content ?? '');
    if (position) editor.setPosition(position);
    if (selection) editor.setSelection(selection);
  }, [file.content, mounted]);

  return (
    <>
      <Editor
        height="100%"
        theme={document.documentElement.dataset.theme === 'light' ? 'light' : 'vs-dark'}
        language={file.language}
        defaultValue={file.content}
        onChange={value => { editorValueRef.current = value ?? ''; onContentChange(file.path, value ?? ''); }}
        beforeMount={configureMonacoLanguages}
        onMount={handleMount}
        options={{
          fontSize: 14,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, 'Courier New', monospace",
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          renderWhitespace: 'selection',
          tabSize: 2,
          automaticLayout: true,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          renderLineHighlight: 'line',
          bracketPairColorization: { enabled: true },
          padding: { top: 8 },
        }}
      />
      {dialog && (
        <DiffHunkDialog
          hunk={dialog.hunk}
          currents={dialog.currents}
          onRevert={handleRevert}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
