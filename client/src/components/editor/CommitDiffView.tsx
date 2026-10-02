import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { fetchCommitDiff } from '../../api/files';
import type { CommitDiffData } from '../../api/files';

interface CommitDiffViewProps {
  hash: string;
  theme: string;
  onClose: () => void;
  onCheckout: () => void;
  onAddToContext?: (shortHash: string, content: string) => void;
}

export interface CommitDiffViewHandle {
  getVisibleContext: () => string | null;
}

export const CommitDiffView = forwardRef<CommitDiffViewHandle, CommitDiffViewProps>(function CommitDiffView({ hash, theme, onClose, onCheckout, onAddToContext }, ref) {
  const [data, setData] = useState<CommitDiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getVisibleContext: () => {
      if (!data) return null;
      return `Commit: ${data.subject} (${data.shortHash})\n\nAuthor: ${data.author}\nDate: ${data.date}\n\n${data.body || '(no body)'}\n\n${'─'.repeat(40)}\n\n${data.diff}`;
    },
  }), [data]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetchCommitDiff(hash)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [hash]);

  const appRepo = typeof __APP_REPO__ !== 'undefined' ? __APP_REPO__ : '';
  const githubUrl = appRepo && data ? `https://github.com/${appRepo}/commit/${data.hash}` : null;

  const formattedDate = data?.date
    ? (() => {
        try { return new Date(data.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
        catch { return data.date; }
      })()
    : '';

  const isDark = theme !== 'light';
  const monacoTheme = isDark ? 'commit-diff-dark' : 'commit-diff-light';

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('commit-diff-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // Monaco diff language token names (both common variants)
        { token: 'inserted',      foreground: '3fb950' },
        { token: 'deleted',       foreground: 'f85149' },
        { token: 'changed',       foreground: '569cd6' },
        { token: 'token.insert',  foreground: '3fb950' },
        { token: 'token.delete',  foreground: 'f85149' },
        { token: 'token.info',    foreground: '569cd6' },
        { token: 'token.header',  foreground: '858585' },
        { token: 'header',        foreground: '858585' },
      ],
      colors: {},
    });
    monaco.editor.defineTheme('commit-diff-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'inserted',      foreground: '116329' },
        { token: 'deleted',       foreground: 'b31d28' },
        { token: 'changed',       foreground: '0550ae' },
        { token: 'token.insert',  foreground: '116329' },
        { token: 'token.delete',  foreground: 'b31d28' },
        { token: 'token.info',    foreground: '0550ae' },
        { token: 'token.header',  foreground: '6e7781' },
        { token: 'header',        foreground: '6e7781' },
      ],
      colors: {},
    });
  };

  const handleMount: OnMount = (editor, monaco) => {
    const model = editor.getModel();
    if (!model) return;
    const decorations: Parameters<typeof editor.createDecorationsCollection>[0] = [];
    const lineCount = model.getLineCount();
    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        decorations.push(
          { range: new monaco.Range(i, 1, i, model.getLineMaxColumn(i)), options: { isWholeLine: true, className: 'diff-added-line' } },
          { range: new monaco.Range(i, 1, i, 2), options: { inlineClassName: 'diff-added-prefix' } },
        );
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        decorations.push(
          { range: new monaco.Range(i, 1, i, model.getLineMaxColumn(i)), options: { isWholeLine: true, className: 'diff-deleted-line' } },
          { range: new monaco.Range(i, 1, i, 2), options: { inlineClassName: 'diff-deleted-prefix' } },
        );
      } else if (line.startsWith('@@')) {
        decorations.push(
          { range: new monaco.Range(i, 1, i, model.getLineMaxColumn(i)), options: { isWholeLine: true, className: 'diff-info-line' } },
        );
      }
    }
    editor.createDecorationsCollection(decorations);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-sidebar)',
        flexShrink: 0,
      }}>
        {/* Top row: hash + subject + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--color-accent)', flexShrink: 0,
          }}>
            {data?.shortHash ?? hash.slice(0, 7)}
          </span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--color-text-primary)',
          }}>
            {data?.subject ?? ''}
          </span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {onAddToContext && data && (
              <button
                onClick={() => {
                  const context = `**Commit diff context** — \`${data.shortHash}\` ${data.subject}\nAuthor: ${data.author} · ${formattedDate}${data.body ? '\n\n' + data.body : ''}\n\n\`\`\`diff\n${data.diff}\n\`\`\``;
                  onAddToContext(data.shortHash, context);
                }}
                title="Send this diff to Conversation as context"
                style={{
                  padding: '3px 10px', fontSize: 12, fontWeight: 600,
                  background: 'rgba(78,201,176,0.12)', color: '#4ec9b0',
                  border: '1px solid rgba(78,201,176,0.35)', borderRadius: 4,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                + Ask Assistant
              </button>
            )}
            <button
              onClick={onCheckout}
              title="Check out this commit (detached HEAD)"
              style={{
                padding: '3px 10px', fontSize: 12, fontWeight: 600,
                background: 'rgba(214,158,46,0.15)', color: '#d69e2e',
                border: '1px solid rgba(214,158,46,0.4)', borderRadius: 4,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⎇ Checkout
            </button>
            {githubUrl && (
              <button
                onClick={() => window.open(githubUrl, '_blank', 'noopener,noreferrer')}
                title="View on GitHub"
                style={{
                  padding: '3px 10px', fontSize: 12,
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)', borderRadius: 4,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                ↗ GitHub
              </button>
            )}
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none',
                color: 'var(--color-text-secondary)', fontSize: 16,
                cursor: 'pointer', borderRadius: 3, padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>
        {/* Second row: author · date */}
        {data && (
          <div style={{
            marginTop: 4, fontSize: 11,
            color: 'var(--color-text-secondary)',
          }}>
            {data.author} · {formattedDate}
          </div>
        )}
        {/* Body row (only when non-empty) */}
        {data?.body && (
          <div style={{
            marginTop: 5, fontSize: 12,
            color: 'var(--color-text-secondary)',
            whiteSpace: 'pre-wrap', lineHeight: 1.5,
          }}>
            {data.body}
          </div>
        )}
      </div>

      {/* Diff content area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-secondary)', fontSize: 13,
          }}>
            Loading diff…
          </div>
        ) : error ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#f44747', fontSize: 13, padding: 20, textAlign: 'center',
          }}>
            {error}
          </div>
        ) : (
          <Editor
            key={hash}
            language="diff"
            value={data?.diff ?? ''}
            theme={monacoTheme}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            options={{
              readOnly: true,
              domReadOnly: true,
              automaticLayout: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              wordWrap: 'off',
              lineNumbers: 'on',
              fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono',Menlo,monospace",
            }}
          />
        )}
      </div>
    </div>
  );
});
