import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { createRoot, type Root } from 'react-dom/client';
import {
  createTooltipStore,
  DuplicateTooltip,
} from '@/components/DuplicateTooltip';
import { normalizeUrl } from '@/lib/normalize-url';
import { FaviconBadger } from '@/lib/favicon-badge';
import { TitlePrefixer } from '@/lib/title-prefix';
import type { OpenTab, TabStateMessage } from '@/lib/messages';

const HOVER_DELAY_MS = 150;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let state: TabStateMessage | null = null;
    /** URL normalizada -> aba já aberta com aquela URL (exceto esta aba). */
    let openByKey = new Map<string, OpenTab>();

    const prefixer = new TitlePrefixer();
    const faviconBadger = new FaviconBadger(async (url) => {
      try {
        return (await browser.runtime.sendMessage({
          type: 'fetch-favicon',
          url,
        })) as string | null;
      } catch {
        return null;
      }
    });
    const tooltipStore = createTooltipStore();

    // ------------------------------------------------------------- tooltip UI

    let root: Root | undefined;
    const ui = await createShadowRootUi(ctx, {
      name: 'abas-duplicadas-tooltip',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        root = createRoot(container);
        root.render(<DuplicateTooltip store={tooltipStore} />);
      },
      onRemove() {
        root?.unmount();
        root = undefined;
      },
    });
    ui.mount();

    // --------------------------------------------------------------- estado

    function applyState(next: TabStateMessage | null): void {
      state = next;
      openByKey = new Map(next?.openTabs.map((tab) => [tab.key, tab]) ?? []);

      prefixer.update(
        Boolean(next?.isDuplicate && next.titlePrefixEnabled),
        next?.titlePrefix ?? '',
      );
      faviconBadger.update(Boolean(next?.isDuplicate && next.faviconBadgeEnabled), {
        style: next?.faviconBadgeStyle ?? 'dot',
        count: next?.duplicateCount ?? 0,
      });

      if (!next?.tooltipEnabled) tooltipStore.hide();
    }

    browser.runtime.onMessage.addListener((message) => {
      if ((message as TabStateMessage)?.type === 'tab-state') {
        applyState(message as TabStateMessage);
      }
    });

    async function requestState(): Promise<void> {
      try {
        const response = await browser.runtime.sendMessage({ type: 'request-state' });
        if (response) applyState(response as TabStateMessage);
      } catch {
        // Background ainda subindo ou extensão recarregada: a próxima
        // transmissão do background resolve.
      }
    }

    void requestState();
    // Uma aba descartada pela economia de memória reabre o content script aqui;
    // quando ela volta a ficar visível, pedimos o estado de novo.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void requestState();
    });

    // --------------------------------------------------------------- tooltip

    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let pointer = { x: 0, y: 0 };
    let hoveredAnchor: HTMLAnchorElement | null = null;

    function cancelHover(): void {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = undefined;
      }
    }

    /** A aba já aberta correspondente a este link, se houver. */
    function matchFor(anchor: HTMLAnchorElement): OpenTab | undefined {
      if (!state?.tooltipEnabled) return undefined;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return undefined;
      const protocol = anchor.protocol;
      if (protocol !== 'http:' && protocol !== 'https:') return undefined;

      const key = normalizeUrl(anchor.href, state.normalize);
      if (!key) return undefined;
      return openByKey.get(key);
    }

    function anchorFrom(target: EventTarget | null): HTMLAnchorElement | null {
      if (!(target instanceof Element)) return null;
      return target.closest('a[href]');
    }

    // Delegação: um único listener no document cobre links adicionados
    // dinamicamente, sem precisar observar o DOM.
    ctx.addEventListener(document, 'mouseover', (event) => {
      const anchor = anchorFrom(event.target);
      if (!anchor || anchor === hoveredAnchor) return;

      hoveredAnchor = anchor;
      cancelHover();
      tooltipStore.hide();

      const match = matchFor(anchor);
      if (!match) return;

      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        // O ponteiro pode ter saído do link durante o debounce.
        if (hoveredAnchor !== anchor) return;
        tooltipStore.set({
          visible: true,
          x: pointer.x,
          y: pointer.y,
          title: match.title,
        });
      }, HOVER_DELAY_MS);
    });

    ctx.addEventListener(document, 'mousemove', (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    });

    ctx.addEventListener(document, 'mouseout', (event) => {
      const anchor = anchorFrom(event.target);
      if (!anchor || anchor !== hoveredAnchor) return;
      // Ignora o trânsito entre elementos filhos do próprio link.
      if (anchorFrom(event.relatedTarget) === anchor) return;
      hoveredAnchor = null;
      cancelHover();
      tooltipStore.hide();
    });

    const hideAll = () => {
      hoveredAnchor = null;
      cancelHover();
      tooltipStore.hide();
    };

    ctx.addEventListener(window, 'scroll', hideAll, { passive: true });
    ctx.addEventListener(window, 'blur', hideAll);
    ctx.addEventListener(document, 'keydown', (event) => {
      if (event.key === 'Escape') hideAll();
    });

    // --------------------------------------- Alt+clique / clique do meio

    function focusExisting(event: MouseEvent): boolean {
      if (!state?.focusExistingTabEnabled) return false;
      const anchor = anchorFrom(event.target);
      if (!anchor) return false;
      const match = matchFor(anchor);
      if (!match) return false;

      event.preventDefault();
      event.stopPropagation();
      hideAll();
      void browser.runtime.sendMessage({ type: 'focus-tab', tabId: match.tabId });
      return true;
    }

    ctx.addEventListener(
      document,
      'mousedown',
      (event) => {
        // Impede o autoscroll do botão do meio antes que ele comece.
        if (event.button === 1 && state?.focusExistingTabEnabled) {
          const anchor = anchorFrom(event.target);
          if (anchor && matchFor(anchor)) event.preventDefault();
        }
      },
      { capture: true },
    );

    ctx.addEventListener(
      document,
      'auxclick',
      (event) => {
        if (event.button === 1) focusExisting(event);
      },
      { capture: true },
    );

    ctx.addEventListener(
      document,
      'click',
      (event) => {
        if (event.altKey && event.button === 0) focusExisting(event);
      },
      { capture: true },
    );

    // Extensão recarregada/atualizada: devolve o título ao original.
    ctx.onInvalidated(() => {
      cancelHover();
      prefixer.dispose();
      faviconBadger.dispose();
    });
  },
});
