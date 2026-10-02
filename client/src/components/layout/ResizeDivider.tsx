import { useCallback } from 'react';

interface ResizeDividerProps {
  onResize: (newSize: number) => void;
  currentWidth: number;
  min?: number;
  max?: number;
  side?: 'left' | 'right'; // which panel's width we're adjusting
  orientation?: 'vertical' | 'horizontal'; // vertical = column resize, horizontal = row resize
  joined?: boolean; // render as a 1px seam between two joined cards instead of a gutter
}

export function ResizeDivider({
  onResize,
  currentWidth,
  min = 120,
  max = 800,
  side = 'left',
  orientation = 'vertical',
  joined = false,
}: ResizeDividerProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const isHorizontal = orientation === 'horizontal';
      const startPos = isHorizontal ? e.clientY : e.clientX;
      const startSize = currentWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const pos = isHorizontal ? ev.clientY : ev.clientX;
        // horizontal: dragging up grows tray (top side), so invert delta
        const delta = isHorizontal
          ? startPos - pos
          : side === 'left' ? pos - startPos : startPos - pos;
        const newSize = Math.min(max, Math.max(min, startSize + delta));
        onResize(newSize);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [currentWidth, min, max, onResize, side, orientation]
  );

  const isHorizontal = orientation === 'horizontal';

  if (joined && !isHorizontal) {
    // 1px seam that continues the card border; a wider invisible hit area
    // straddles it so it's still easy to grab.
    return (
      <div
        style={{
          position: 'relative',
          width: 1,
          height: '100%',
          flexShrink: 0,
          background: 'var(--color-border-card)',
          transition: 'background var(--transition-fast)',
          zIndex: 10,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-border-card)'; }}
      >
        <div
          onMouseDown={handleMouseDown}
          style={{ position: 'absolute', top: 0, bottom: 0, left: -3, width: 7, cursor: 'col-resize' }}
        />
      </div>
    );
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        // Doubles as the gutter between floating panel cards; on hover only a
        // thin centered line lights up (padding + content-box clip).
        ...(isHorizontal
          ? { width: '100%', height: 6, padding: '2px 24px' }
          : { width: 6, height: '100%', padding: '24px 2px' }),
        boxSizing: 'border-box',
        backgroundClip: 'content-box',
        background: 'transparent',
        borderRadius: 'var(--radius-pill)',
        cursor: isHorizontal ? 'row-resize' : 'col-resize',
        flexShrink: 0,
        transition: 'background var(--transition-fast)',
        zIndex: 10,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--color-accent)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    />
  );
}
