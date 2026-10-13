import { useEffect, useState, type CSSProperties } from 'react';

export interface FilePickerState {
  visible: boolean;
  /**
   * A imagem da área de transferência. O popup só é aberto quando há uma
   * utilizável - sem isso o content script vai direto ao diálogo do sistema.
   */
  clipboardFile: File | null;
  /** Objeto URL do preview; a store cuida de revogar. */
  previewUrl: string | null;
  /** Nome amigável do campo ("Enviar foto"), quando dá para descobrir. */
  fieldLabel: string;
  onUseClipboard: () => void;
  onBrowse: () => void;
  onCancel: () => void;
}

const HIDDEN: FilePickerState = {
  visible: false,
  clipboardFile: null,
  previewUrl: null,
  fieldLabel: '',
  onUseClipboard: () => {},
  onBrowse: () => {},
  onCancel: () => {},
};

/** Store mínima para o content script empurrar estado ao React. */
export function createFilePickerStore() {
  let state: FilePickerState = HIDDEN;
  const listeners = new Set<(s: FilePickerState) => void>();

  function emit() {
    listeners.forEach((listener) => listener(state));
  }

  return {
    get: () => state,
    set(next: FilePickerState) {
      // Um preview antigo não é mais visível: libera o blob.
      if (state.previewUrl && state.previewUrl !== next.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state = next;
      emit();
    },
    hide() {
      if (state.visible) this.set(HIDDEN);
    },
    subscribe(listener: (s: FilePickerState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type FilePickerStore = ReturnType<typeof createFilePickerStore>;

const FONT = '500 13px/1.45 system-ui, -apple-system, Segoe UI, sans-serif';

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483647,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.45)',
  backdropFilter: 'blur(2px)',
  font: FONT,
};

const panelStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: 'min(420px, calc(100vw - 32px))',
  padding: 16,
  borderRadius: 12,
  background: '#ffffff',
  color: '#111827',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
  textAlign: 'left',
};

const optionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  boxSizing: 'border-box',
  padding: 10,
  marginTop: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  background: '#f9fafb',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

export function FilePickerOverlay({ store }: { store: FilePickerStore }) {
  const [state, setState] = useState<FilePickerState>(store.get);

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    if (!state.visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        state.onCancel();
      }
    };
    // Capture: alguns sites engolem o Escape antes de chegar aqui.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [state]);

  if (!state.visible) return null;

  return (
    <div
      style={backdropStyle}
      onClick={state.onCancel}
      role="presentation"
      data-testid="file-picker-backdrop"
    >
      <div
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Quick file picker"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {state.fieldLabel || 'Upload file'}
        </div>
        <div style={{ opacity: 0.65, marginTop: 2 }}>
          There is an image in your clipboard.
        </div>

        {state.clipboardFile && (
          <button type="button" style={optionStyle} onClick={state.onUseClipboard} autoFocus>
            {state.previewUrl && (
              <img
                src={state.previewUrl}
                alt=""
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'cover',
                  borderRadius: 8,
                  background: '#e5e7eb',
                  flex: '0 0 auto',
                }}
              />
            )}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>
                Use the copied image
              </span>
              <span style={{ display: 'block', opacity: 0.6, fontSize: 12 }}>
                {formatSize(state.clipboardFile.size)} · {state.clipboardFile.type}
              </span>
            </span>
          </button>
        )}

        <button type="button" style={optionStyle} onClick={state.onBrowse}>
          <span
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              background: '#e5e7eb',
              fontSize: 24,
              flex: '0 0 auto',
            }}
          >
            📁
          </span>
          <span>
            <span style={{ display: 'block', fontWeight: 600 }}>
              Choose a file from your computer
            </span>
            <span style={{ display: 'block', opacity: 0.6, fontSize: 12 }}>
              Opens the usual dialog
            </span>
          </span>
        </button>

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            type="button"
            onClick={state.onCancel}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: '#6b7280',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
