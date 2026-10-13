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
  { value: 'dot', label: 'Red dot in the corner' },
  { value: 'count', label: 'Number of repeated tabs' },
  { value: 'emoji', label: '🔁 emoji in the corner' },
  { value: 'ring', label: 'Red ring around it' },
  { value: 'dim', label: 'Dimmed favicon + dot' },
];

const NORMALIZE_LABELS: Array<{ key: keyof NormalizeOptions; label: string }> = [
  { key: 'ignoreHash', label: 'Ignore the fragment (#...)' },
  { key: 'ignoreTrailingSlash', label: 'Ignore the trailing slash' },
  { key: 'stripTrackingParams', label: 'Ignore tracking parameters' },
  { key: 'ignoreProtocol', label: 'http and https are the same' },
  { key: 'ignoreWww', label: 'www. is the same' },
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
        <h1>Browser Utils</h1>
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowOptions((value) => !value)}
          aria-expanded={showOptions}
        >
          {showOptions ? 'Close settings' : 'Settings'}
        </button>
      </header>

      {showOptions && (
        <div className="options">
          <section className="option-group">
            <h2>Duplicate tabs</h2>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.titlePrefixEnabled}
                onChange={(event) =>
                  void patch({ titlePrefixEnabled: event.target.checked })
                }
              />
              <span>Prefix the title of duplicate tabs</span>
            </label>

            <label className="row indent">
              <span>Prefix</span>
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
              <span>Mark the duplicate tab&apos;s icon</span>
            </label>

            <label className="row indent">
              <span>Style</span>
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
              <span>Tooltip when hovering a link already open</span>
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.focusExistingTabEnabled}
                onChange={(event) =>
                  void patch({ focusExistingTabEnabled: event.target.checked })
                }
              />
              <span>Alt+click / middle click focus the existing tab</span>
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.badgeEnabled}
                onChange={(event) => void patch({ badgeEnabled: event.target.checked })}
              />
              <span>Count repeated tabs on the extension icon</span>
            </label>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.separateIncognito}
                onChange={(event) =>
                  void patch({ separateIncognito: event.target.checked })
                }
              />
              <span>Keep incognito tabs apart from normal ones</span>
            </label>

            <h3>When two URLs are the same page</h3>
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

          <section className="option-group">
            <h2>File uploads</h2>

            <label className="row">
              <input
                type="checkbox"
                checked={settings.filePickerEnabled}
                onChange={(event) =>
                  void patch({ filePickerEnabled: event.target.checked })
                }
              />
              <span>Quick pick when uploading a file</span>
            </label>
            <p className="hint">
              On fields that take images, clicking opens a popup to paste the image from
              your clipboard. With nothing copied, the system dialog opens as usual.
            </p>
          </section>
        </div>
      )}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="empty">No duplicate tabs. 🎉</p>
      ) : (
        <>
          <p className="summary">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {totalExtras}{' '}
            {totalExtras === 1 ? 'extra tab' : 'extra tabs'}
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
                        Go
                      </button>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => void closeTab(tab.tabId)}
                      >
                        Close
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
