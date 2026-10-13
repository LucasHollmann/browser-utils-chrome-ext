import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { DuplicateGroup } from '@/lib/messages';
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '@/lib/settings';
import type { NormalizeOptions } from '@/lib/normalize-url';
import type { FaviconBadgeStyle } from '@/lib/favicon-badge';

interface GroupsResponse {
  groups: DuplicateGroup[];
  settings: Settings;
}

const BADGE_STYLE_LABELS: Array<{ value: FaviconBadgeStyle; label: string }> = [
  { value: 'dot', label: 'Ponto vermelho no canto' },
  { value: 'count', label: 'Número de abas repetidas' },
  { value: 'emoji', label: 'Emoji 🔁 no canto' },
  { value: 'ring', label: 'Moldura vermelha em volta' },
  { value: 'dim', label: 'Favicon acinzentado + ponto' },
];

const NORMALIZE_LABELS: Array<{ key: keyof NormalizeOptions; label: string }> = [
  { key: 'ignoreHash', label: 'Ignorar fragmento (#...)' },
  { key: 'ignoreTrailingSlash', label: 'Ignorar barra final' },
  { key: 'stripTrackingParams', label: 'Ignorar parâmetros de rastreamento' },
  { key: 'ignoreProtocol', label: 'http e https são a mesma coisa' },
  { key: 'ignoreWww', label: 'www. é a mesma coisa' },
];

export function App() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const load = useCallback(async () => {
    const response = (await browser.runtime.sendMessage({
      type: 'get-duplicate-groups',
    })) as GroupsResponse | undefined;
    if (response) {
      setGroups(response.groups);
      setSettings(response.settings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (changes: Partial<Settings>) => {
    const next = await saveSettings(changes);
    setSettings(next);
    // O background recalcula as chaves ao ver a mudança no storage.
    setTimeout(() => void load(), 150);
  };

  const goToTab = async (tabId: number, windowId: number) => {
    await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(windowId, { focused: true });
    window.close();
  };

  const closeTab = async (tabId: number) => {
    await browser.tabs.remove(tabId);
    await load();
  };

  const totalExtras = groups.reduce((sum, group) => sum + group.tabs.length - 1, 0);

  return (
    <div className="app">
      <header className="header">
        <h1>Abas duplicadas</h1>
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowOptions((value) => !value)}
          aria-expanded={showOptions}
        >
          {showOptions ? 'Fechar ajustes' : 'Ajustes'}
        </button>
      </header>

      {showOptions && (
        <section className="options">
          <label className="row">
            <input
              type="checkbox"
              checked={settings.titlePrefixEnabled}
              onChange={(event) => void patch({ titlePrefixEnabled: event.target.checked })}
            />
            <span>Prefixo no título das abas duplicadas</span>
          </label>

          <label className="row indent">
            <span>Prefixo</span>
            <input
              type="text"
              className="text-input"
              value={settings.titlePrefix}
              onChange={(event) => void patch({ titlePrefix: event.target.value })}
            />
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={settings.faviconBadgeEnabled}
              onChange={(event) =>
                void patch({ faviconBadgeEnabled: event.target.checked })
              }
            />
            <span>Marcar o ícone da aba duplicada</span>
          </label>

          <label className="row indent">
            <span>Estilo</span>
            <select
              className="text-input"
              value={settings.faviconBadgeStyle}
              disabled={!settings.faviconBadgeEnabled}
              onChange={(event) =>
                void patch({
                  faviconBadgeStyle: event.target.value as FaviconBadgeStyle,
                })
              }
            >
              {BADGE_STYLE_LABELS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={settings.tooltipEnabled}
              onChange={(event) => void patch({ tooltipEnabled: event.target.checked })}
            />
            <span>Tooltip ao passar o mouse em links já abertos</span>
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={settings.focusExistingTabEnabled}
              onChange={(event) =>
                void patch({ focusExistingTabEnabled: event.target.checked })
              }
            />
            <span>Alt+clique / clique do meio focam a aba existente</span>
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={settings.badgeEnabled}
              onChange={(event) => void patch({ badgeEnabled: event.target.checked })}
            />
            <span>Contador de abas repetidas no ícone da extensão</span>
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={settings.separateIncognito}
              onChange={(event) => void patch({ separateIncognito: event.target.checked })}
            />
            <span>Não misturar abas anônimas com normais</span>
          </label>

          <h2>Quando duas URLs são a mesma página</h2>
          {NORMALIZE_LABELS.map(({ key, label }) => (
            <label className="row" key={key}>
              <input
                type="checkbox"
                checked={settings.normalize[key]}
                onChange={(event) =>
                  void patch({
                    normalize: { ...settings.normalize, [key]: event.target.checked },
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </section>
      )}

      {loading ? (
        <p className="empty">Carregando…</p>
      ) : groups.length === 0 ? (
        <p className="empty">Nenhuma aba duplicada. 🎉</p>
      ) : (
        <>
          <p className="summary">
            {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'} · {totalExtras}{' '}
            {totalExtras === 1 ? 'aba extra' : 'abas extras'}
          </p>
          <ul className="groups">
            {groups.map((group) => (
              <li className="group" key={group.key}>
                <p className="group-url" title={group.tabs[0]?.url}>
                  {group.tabs[0]?.url ?? group.key}
                </p>
                <ul className="tabs">
                  {group.tabs.map((tab) => (
                    <li className="tab" key={tab.tabId}>
                      {tab.favIconUrl ? (
                        <img className="favicon" src={tab.favIconUrl} alt="" />
                      ) : (
                        <span className="favicon placeholder" />
                      )}
                      <span className="tab-title" title={tab.title}>
                        {tab.title}
                      </span>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void goToTab(tab.tabId, tab.windowId)}
                      >
                        Ir
                      </button>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => void closeTab(tab.tabId)}
                      >
                        Fechar
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
