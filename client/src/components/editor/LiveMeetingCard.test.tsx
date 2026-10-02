// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveMeetingCard } from './LiveMeetingCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeContainerRef(width = 800, height = 600) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  return { current: el } as React.RefObject<HTMLDivElement>;
}

function makeTimeDomainAnalyser(fillValue = 128): AnalyserNode {
  return {
    fftSize: 256,
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
  } as unknown as AnalyserNode;
}

/** happy-dom has no 2D canvas; stub one so the rAF draw loop actually runs. */
function stubCanvas() {
  const ctx = {
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return ctx;
}

/** Capture the latest rAF callback so tests can step frames manually. */
function stubRaf() {
  const state: { cb: FrameRequestCallback | null } = { cb: null };
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { state.cb = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return () => act(() => { state.cb?.(0); });
}

describe('LiveMeetingCard', () => {
  it('renders timer at 0:00 on mount', () => {
    render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} />);
    expect(screen.getByText('0:00')).toBeTruthy();
  });

  it('mute button toggles between Mute and Unmute', () => {
    render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Mute'));
    expect(screen.getByTitle('Unmute')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Unmute'));
    expect(screen.getByTitle('Mute')).toBeTruthy();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('End meeting'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('starts at bottom-right and drag moves card position', () => {
    const { container } = render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} />);
    const card = container.firstChild as HTMLElement;
    // 800 - 240 (card) - 20 (margin) = 540, 600 - 148 - 20 = 432
    expect(card.style.left).toBe('540px');
    expect(card.style.top).toBe('432px');

    fireEvent.mouseDown(card.firstChild as HTMLElement, { clientX: 0, clientY: 0 });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50, bubbles: true })); });

    expect(card.style.left).toBe('640px');
    expect(card.style.top).toBe('482px');

    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  });

  it('clamps drag to container right and bottom edges', () => {
    const { container } = render(<LiveMeetingCard containerRef={makeContainerRef(200, 150)} onClose={vi.fn()} />);
    const card = container.firstChild as HTMLElement;

    fireEvent.mouseDown(card.firstChild as HTMLElement, { clientX: 0, clientY: 0 });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 9999, clientY: 9999, bubbles: true })); });

    expect(parseInt(card.style.left)).toBeLessThanOrEqual(200);
    expect(parseInt(card.style.top)).toBeLessThanOrEqual(150);

    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  });

  it('renders a waveform canvas', () => {
    const { container } = render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('draws the waveform from analyserNode on each rAF tick', () => {
    const ctx = stubCanvas();
    const tick = stubRaf();
    const analyser = makeTimeDomainAnalyser(200);

    render(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} analyserNode={analyser} />);
    tick();

    expect(analyser.getByteTimeDomainData).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('glow bar reacts to mic input and stays dark when muted', () => {
    stubCanvas();
    const tick = stubRaf();
    const mic = makeTimeDomainAnalyser(255);

    const { container, rerender } = render(
      <LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} micAnalyserNode={mic} isMuted={false} />,
    );
    const glowBar = () => (container.firstChild as HTMLElement).lastChild as HTMLElement;

    tick();
    expect(glowBar().style.boxShadow).not.toBe('none');

    rerender(<LiveMeetingCard containerRef={makeContainerRef()} onClose={vi.fn()} micAnalyserNode={mic} isMuted />);
    tick();
    expect(glowBar().style.boxShadow).toBe('none');
  });
});
