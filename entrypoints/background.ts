import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { isRestrictedUrl, normalizeUrl } from '@/lib/normalize-url';
import {
  DEFAULT_SETTINGS,
  getSettings,
  onSettingsChanged,
  type Settings,
} from '@/lib/settings';
import type {
  DuplicateGroup,
  OpenTab,
  TabStateMessage,
  ToBackgroundMessage,
} from '@/lib/messages';

interface TabRecord {
  tabId: number;
  windowId: number;
  url: string;
  key: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  incognito: boolean;
}

export default defineBackground(() => {
  /**
   * Fonte da verdade: tabId -> dados da aba.
   *
   * O service worker pode ser suspenso a qualquer momento, por isso o estado é
   * reconstruído do zero com tabs.query() sempre que o worker sobe.
   */
  const tabs = new Map<number, TabRecord>();
  // Começa nos padrões: eventos podem chegar antes do rebuild() inicial.
  let settings: Settings = DEFAULT_SETTINGS;
  /** Último estado enviado a cada aba, para não repetir mensagens iguais. */
  const lastSentState = new Map<number, string>();

  // ---------------------------------------------------------------- helpers

  function toRecord(tab: Browser.tabs.Tab): TabRecord | null {
    if (tab.id == null || tab.id === browser.tabs.TAB_ID_NONE) return null;
    const url = tab.url || tab.pendingUrl || '';
    const key = normalizeUrl(url, settings.normalize);
    if (!key) return null;
    return {
      tabId: tab.id,
      windowId: tab.windowId ?? -1,
      url,
      key,
      title: tab.title || url,
      favIconUrl: tab.favIconUrl,
      active: tab.active ?? false,
      incognito: tab.incognito ?? false,
    };
  }

  /** Chave de agrupamento: separa (ou não) o contexto anônimo. */
  function groupKey(record: TabRecord): string {
    return settings.separateIncognito && record.incognito
      ? 'incognito\u0000' + record.key
      : record.key;
  }

  function groupsByKey(): Map<string, TabRecord[]> {
    const groups = new Map<string, TabRecord[]>();
    for (const record of tabs.values()) {
      const key = groupKey(record);
      const list = groups.get(key);
      if (list) list.push(record);
      else groups.set(key, [record]);
    }
    return groups;
  }

  // ------------------------------------------------------------ reconstrução

  async function rebuild(): Promise<void> {
    settings = await getSettings();
    tabs.clear();
    const all = await browser.tabs.query({});
    for (const tab of all) {
      const record = toRecord(tab);
      if (record) tabs.set(record.tabId, record);
    }
  }

  // ------------------------------------------------------------- transmissão

  /** Abas visíveis para `target` (mesmo contexto anônimo, se separado). */
  function visibleTabsFor(target: TabRecord): OpenTab[] {
    const seen = new Set<string>();
    const result: OpenTab[] = [];
    for (const record of tabs.values()) {
      if (record.tabId === target.tabId) continue;
      if (settings.separateIncognito && record.incognito !== target.incognito) continue;
      if (seen.has(record.key)) continue;
      seen.add(record.key);
      result.push({ tabId: record.tabId, key: record.key, title: record.title });
    }
    return result;
  }

  function buildState(record: TabRecord, duplicate: boolean): TabStateMessage {
    return {
      type: 'tab-state',
      isDuplicate: duplicate,
      titlePrefixEnabled: settings.titlePrefixEnabled,
      titlePrefix: settings.titlePrefix,
      tooltipEnabled: settings.tooltipEnabled,
      focusExistingTabEnabled: settings.focusExistingTabEnabled,
      normalize: settings.normalize,
      openTabs: settings.tooltipEnabled ? visibleTabsFor(record) : [],
    };
  }

  async function sendState(record: TabRecord, duplicate: boolean): Promise<void> {
    // Páginas internas não executam content script - ignorar sem erro.
    if (isRestrictedUrl(record.url)) return;

    const message = buildState(record, duplicate);
    const fingerprint = JSON.stringify(message);
    if (lastSentState.get(record.tabId) === fingerprint) return;

    try {
      await browser.tabs.sendMessage(record.tabId, message);
      lastSentState.set(record.tabId, fingerprint);
    } catch {
      // Aba descartada pelo gerenciador de memória, ainda carregando ou sem
      // content script. Ela volta a pedir o estado quando for reativada.
      lastSentState.delete(record.tabId);
    }
  }

  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleBroadcast(): void {
    if (broadcastTimer) clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      broadcastTimer = undefined;
      void broadcast();
    }, 80);
  }

  async function broadcast(): Promise<void> {
    const groups = groupsByKey();
    await Promise.all(
      [...tabs.values()].map((record) => {
        const duplicate = (groups.get(groupKey(record))?.length ?? 0) > 1;
        return sendState(record, duplicate);
      }),
    );
  }

  // --------------------------------------------------------------- eventos

  async function upsert(tabId: number): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      const record = toRecord(tab);
      if (record) tabs.set(tabId, record);
      else tabs.delete(tabId);
    } catch {
      tabs.delete(tabId);
    }
    scheduleBroadcast();
  }

  browser.tabs.onCreated.addListener((tab) => {
    const record = toRecord(tab);
    if (record) tabs.set(record.tabId, record);
    scheduleBroadcast();
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Cobre navegação normal, mudança de título e navegação de SPA
    // (a URL muda sem recarregar, mas onUpdated dispara mesmo assim).
    if (
      changeInfo.url === undefined &&
      changeInfo.title === undefined &&
      changeInfo.status === undefined &&
      changeInfo.favIconUrl === undefined &&
      changeInfo.discarded === undefined
    ) {
      return;
    }
    const record = toRecord(tab);
    if (record) tabs.set(tabId, record);
    else tabs.delete(tabId);
    scheduleBroadcast();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabs.delete(tabId);
    lastSentState.delete(tabId);
    scheduleBroadcast();
  });

  browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    tabs.delete(removedTabId);
    lastSentState.delete(removedTabId);
    void upsert(addedTabId);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    // Uma aba descartada que volta à vida reabre o content script e pede o
    // estado sozinha, mas o upsert aqui mantém o mapa alinhado.
    void upsert(tabId);
  });

  onSettingsChanged(async (next) => {
    settings = next;
    // As chaves dependem das regras de normalização: recalcular tudo.
    await rebuild();
    lastSentState.clear();
    scheduleBroadcast();
  });

  // -------------------------------------------------------------- mensagens

  browser.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    const message = rawMessage as ToBackgroundMessage;

    if (message?.type === 'request-state') {
      const tabId = sender.tab?.id;
      if (tabId == null) return false;
      void (async () => {
        await ready;
        await upsert(tabId);
        const record = tabs.get(tabId);
        if (!record) {
          sendResponse(null);
          return;
        }
        const groups = groupsByKey();
        const duplicate = (groups.get(groupKey(record))?.length ?? 0) > 1;
        const state = buildState(record, duplicate);
        lastSentState.set(tabId, JSON.stringify(state));
        sendResponse(state);
      })();
      return true;
    }

    if (message?.type === 'focus-tab') {
      void (async () => {
        try {
          const tab = await browser.tabs.get(message.tabId);
          await browser.tabs.update(message.tabId, { active: true });
          if (tab.windowId != null) {
            await browser.windows.update(tab.windowId, { focused: true });
          }
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }

    if (message?.type === 'get-duplicate-groups') {
      void (async () => {
        await ready;
        await rebuild();
        const groups: DuplicateGroup[] = [...groupsByKey().entries()]
          .filter(([, list]) => list.length > 1)
          .map(([key, list]) => ({
            key,
            tabs: list.map((record) => ({
              tabId: record.tabId,
              windowId: record.windowId,
              title: record.title,
              url: record.url,
              favIconUrl: record.favIconUrl,
              active: record.active,
              incognito: record.incognito,
            })),
          }))
          .sort((a, b) => b.tabs.length - a.tabs.length);
        sendResponse({ groups, settings });
      })();
      return true;
    }

    return false;
  });

  // --------------------------------------------------------------- bootstrap

  const ready = rebuild().then(() => {
    scheduleBroadcast();
  });

  browser.runtime.onInstalled.addListener(() => {
    void rebuild().then(() => scheduleBroadcast());
  });
  browser.runtime.onStartup.addListener(() => {
    void rebuild().then(() => scheduleBroadcast());
  });
});
