import { browser } from 'wxt/browser';
import { DEFAULT_NORMALIZE_OPTIONS, type NormalizeOptions } from './normalize-url';

export interface Settings {
  /** Liga o prefixo no título das abas duplicadas. */
  titlePrefixEnabled: boolean;
  /** O prefixo em si. */
  titlePrefix: string;
  /** Liga o tooltip ao passar o mouse sobre links já abertos. */
  tooltipEnabled: boolean;
  /** Alt+clique / clique do meio focam a aba existente. */
  focusExistingTabEnabled: boolean;
  /** Não mistura abas anônimas com abas normais. */
  separateIncognito: boolean;
  /** Regras de normalização de URL. */
  normalize: NormalizeOptions;
}

export const DEFAULT_SETTINGS: Settings = {
  titlePrefixEnabled: true,
  titlePrefix: '🔁 ',
  tooltipEnabled: true,
  focusExistingTabEnabled: true,
  separateIncognito: true,
  normalize: { ...DEFAULT_NORMALIZE_OPTIONS },
};

const STORAGE_KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    normalize: { ...DEFAULT_SETTINGS.normalize, ...raw?.normalize },
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Settings = {
    ...(await getSettings()),
    ...patch,
  };
  await browser.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

/** Avisa sempre que as configurações mudarem (em qualquer contexto da extensão). */
export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'sync' || !(STORAGE_KEY in changes)) return;
    void getSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
