import { useEffect, useState, type CSSProperties } from 'react';

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
}

const HIDDEN: TooltipState = { visible: false, x: 0, y: 0, title: '' };

/** Store mínima para o content script empurrar estado ao React sem re-render global. */
export function createTooltipStore() {
  let state: TooltipState = HIDDEN;
  const listeners = new Set<(s: TooltipState) => void>();
  return {
    get: () => state,
    set(next: TooltipState) {
      state = next;
      listeners.forEach((listener) => listener(state));
    },
    hide() {
      if (state.visible) this.set(HIDDEN);
    },
    subscribe(listener: (s: TooltipState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type TooltipStore = ReturnType<typeof createTooltipStore>;

const OFFSET = 16;
const MAX_WIDTH = 320;

export function DuplicateTooltip({ store }: { store: TooltipStore }) {
  const [state, setState] = useState<TooltipState>(store.get);

  useEffect(() => store.subscribe(setState), [store]);

  if (!state.visible) return null;

  // Mantém o tooltip dentro da viewport.
  const flipX = state.x + OFFSET + MAX_WIDTH > window.innerWidth;
  const flipY = state.y + OFFSET + 80 > window.innerHeight;

  const style: CSSProperties = {
    position: 'fixed',
    left: flipX ? undefined : state.x + OFFSET,
    right: flipX ? Math.max(8, window.innerWidth - state.x + OFFSET) : undefined,
    top: flipY ? undefined : state.y + OFFSET,
    bottom: flipY ? Math.max(8, window.innerHeight - state.y + OFFSET) : undefined,
    zIndex: 2147483647,
    maxWidth: MAX_WIDTH,
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    background: '#1f2937',
    color: '#f9fafb',
    font: '500 12px/1.45 system-ui, -apple-system, Segoe UI, sans-serif',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
    textAlign: 'left',
  };

  return (
    <div style={style} role="tooltip">
      <div style={{ opacity: 0.75, marginBottom: 2 }}>🔁 Esta página já está aberta</div>
      <div
        style={{
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={state.title}
      >
        {state.title}
      </div>
    </div>
  );
}
