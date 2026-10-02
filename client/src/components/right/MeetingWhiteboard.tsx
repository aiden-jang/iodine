import { useState, useRef, useEffect } from 'react';

// Detect the "rogue outer wrapper" pattern: a box whose content lines contain nested
// box-drawing corners (┌/└/├ immediately after the leading │). Strip the outer shell
// and expose the raw inner content so downstream passes can normalize it.
function unwrapNestedBoxes(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const topMatch = line.match(/^(\s*)[┌]([─]+)[┐]\s*$/);
    if (!topMatch) { out.push(line); i++; continue; }
    const boxLines: string[] = [line];
    let j = i + 1;
    let foundBottom = false;
    while (j < lines.length) {
      boxLines.push(lines[j]);
      if (/^\s*[└][─]+[┘]\s*$/.test(lines[j])) { foundBottom = true; j++; break; }
      j++;
    }
    if (!foundBottom) { out.push(...boxLines); i = j; continue; }
    const contentLines = boxLines.slice(1, -1);
    // A wrapper box: any content line, after stripping the outer │, starts with ┌ └ ├ or ▼+┌
    const isWrapper = contentLines.some(l => {
      const inner = l.replace(/^\s*[│]/, '').replace(/[│]\s*$/, '');
      return /^\s*([┌└├]|▼\s*[┌])/.test(inner);
    });
    if (isWrapper) {
      for (const cl of contentLines) {
        let inner = cl.replace(/^\s*[│]/, '').replace(/[│]\s*$/, '');
        out.push(inner);
      }
    } else {
      out.push(...boxLines);
    }
    i = j;
  }
  return out.join('\n');
}

function addBaseIndent(text: string): string {
  const lines = text.split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length === 0) return text;
  const minIndent = Math.min(...nonEmpty.map(l => (l.match(/^(\s*)/)?.[1] ?? '').length));
  if (minIndent >= 2) return text;
  return lines.map(l => l.trim() ? '  ' + l : l).join('\n');
}

function alignConnectorsToArrows(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const arrowCol = lines[i].indexOf('▼'); // ▼
    if (arrowCol === -1) continue;
    // Walk backward through pure connector lines and align each to arrowCol
    let j = i - 1;
    while (j >= 0 && /^\s*│\s*$/.test(lines[j])) {
      lines[j] = ' '.repeat(arrowCol) + '│';
      j--;
    }
  }
  return lines.join('\n');
}

function normalizeBoxAlignment(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match top border with optional leading whitespace
    const topMatch = line.match(/^(\s*)([┌+])([─\-]+)([┐+])\s*$/);
    if (!topMatch) { out.push(line); i++; continue; }

    const isUnicode = topMatch[2] === '┌';
    const vChar = isUnicode ? '│' : '|';
    const hChar = isUnicode ? '─' : '-';
    const tl    = isUnicode ? '┌' : '+';
    const tr    = isUnicode ? '┐' : '+';
    const bl    = isUnicode ? '└' : '+';
    const br    = isUnicode ? '┘' : '+';

    const boxLines: string[] = [line];
    let j = i + 1;
    let foundBottom = false;
    while (j < lines.length) {
      boxLines.push(lines[j]);
      if (/^\s*([└+])[─\-]+([┘+])\s*$/.test(lines[j])) { foundBottom = true; j++; break; }
      j++;
    }

    if (!foundBottom) { out.push(...boxLines); i = j; continue; }

    // Use the smallest leading-whitespace count across all box lines as the box indent.
    const minIndent = Math.min(...boxLines.map(l => (l.match(/^(\s*)/)?.[1] ?? '').length));
    const indent = ' '.repeat(minIndent);

    const contentLines = boxLines.slice(1, -1);
    const innerTexts = contentLines.map(l => {
      let s = l.trimStart();
      if (s.startsWith(vChar) || s.startsWith('│') || s.startsWith('|')) s = s.slice(1);
      if (s.endsWith(vChar) || s.endsWith('│') || s.endsWith('|')) s = s.slice(0, -1);
      return s;
    });

    const topInner = line.trimStart().length - 2;
    const maxInner = Math.max(topInner, ...innerTexts.map(s => s.length));

    out.push(indent + tl + hChar.repeat(maxInner) + tr);
    for (const inner of innerTexts) out.push(indent + vChar + inner.padEnd(maxInner) + vChar);
    out.push(indent + bl + hChar.repeat(maxInner) + br);
    i = j;
  }

  return out.join('\n');
}

const NODE_SPLIT_RE = /(\[[^\]]+\])/g;
const NODE_TEST_RE = /^\[[^\]]+\]$/;

function renderLine(line: string, key: number) {
  const parts = line.split(NODE_SPLIT_RE);
  return (
    <span key={key}>
      {parts.map((part, pi) =>
        NODE_TEST_RE.test(part) ? (
          <span key={pi} style={{
            background: 'var(--color-accent, #0e639c)',
            color: '#fff',
            borderRadius: 3,
            padding: '0px 5px',
            fontWeight: 600,
          }}>{part}</span>
        ) : part
      )}
      {'\n'}
    </span>
  );
}

interface MeetingWhiteboardProps {
  content: string;
  onAppend: (text: string) => void;
  onClear?: () => void;
}

export function MeetingWhiteboard({ content, onAppend, onClear }: MeetingWhiteboardProps) {
  const [input, setInput] = useState('');
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [content]);

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAppend(text);
    setInput('');
  }


  return (
    <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', opacity: 0.7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Whiteboard</span>
        {onClear && content && (
          <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.6, padding: '0 2px' }} title="Clear whiteboard">
            Clear
          </button>
        )}
      </div>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: '4px 10px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-text-primary)',
          whiteSpace: 'pre',
          lineHeight: 1.5,
          background: 'var(--color-bg-editor, #1e1e1e)',
        }}
      >
        {content
          ? alignConnectorsToArrows(normalizeBoxAlignment(addBaseIndent(unwrapNestedBoxes(content))))
              .split('\n').map((line, i) => renderLine(line, i))
          : <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontFamily: 'inherit' }}>Empty — AI or you can write here</span>}
      </pre>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--color-border)', padding: '4px 6px', gap: 4, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Append to whiteboard…"
          style={{
            flex: 1,
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            borderRadius: 3,
            padding: '3px 7px',
            fontSize: 11.5,
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          style={{
            background: 'var(--color-accent, #0e639c)',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
