import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { createRoot, type Root } from 'react-dom/client';
import {
  createTooltipStore,
  DuplicateTooltip,
} from '@/components/DuplicateTooltip';
import {
  createFilePickerStore,
  FilePickerOverlay,
} from '@/components/FilePickerOverlay';
import { anchorFromEvent, LinkHover } from '@/lib/link-hover';
import {
  acceptsImages,
  assignFiles,
  fieldLabel,
  fileInputFromEvent,
  matchesAccept,
  readClipboardImage,
  shouldIntercept,
} from '@/lib/file-input';
import { normalizeUrl } from '@/lib/normalize-url';
import { FaviconBadger } from '@/lib/favicon-badge';
import { TitlePrefixer } from '@/lib/title-prefix';
import type { OpenTab, TabStateMessage } from '@/lib/messages';

const HOVER_DELAY_MS = 150;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // Sem cssInjectionMode: 'ui' de propósito. Ele faz o WXT buscar
  // content-scripts/content.css em runtime, que não existe (o tooltip usa
  // estilos inline), e o navegador bloqueia o fetch.

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
    const filePickerStore = createFilePickerStore();

    // ------------------------------------------------------------- tooltip UI

    let root: Root | undefined;
    const ui = await createShadowRootUi(ctx, {
      name: 'browser-utils-tooltip',
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

    // ---------------------------------------------------- seleção de arquivo UI

    let pickerRoot: Root | undefined;
    const pickerUi = await createShadowRootUi(ctx, {
      name: 'browser-utils-file-picker',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        pickerRoot = createRoot(container);
        pickerRoot.render(<FilePickerOverlay store={filePickerStore} />);
      },
      onRemove() {
        pickerRoot?.unmount();
        pickerRoot = undefined;
      },
    });
    pickerUi.mount();

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

    const hover = new LinkHover<OpenTab>({
      delayMs: HOVER_DELAY_MS,
      lookup: matchFor,
      show: (match, x, y) => tooltipStore.set({ visible: true, x, y, title: match.title }),
      hide: () => tooltipStore.hide(),
    });

    // Delegação: um único listener no document cobre links adicionados
    // dinamicamente, sem precisar observar o DOM.
    ctx.addEventListener(document, 'mouseover', hover.handleMouseOver);
    ctx.addEventListener(document, 'mousemove', hover.handleMouseMove);
    ctx.addEventListener(document, 'mouseout', hover.handleMouseOut);

    const hideAll = hover.reset;

    ctx.addEventListener(window, 'scroll', hideAll, { passive: true });
    ctx.addEventListener(window, 'blur', hideAll);
    ctx.addEventListener(document, 'keydown', (event) => {
      if (event.key === 'Escape') hideAll();
    });

    // --------------------------------------- Alt+clique / clique do meio

    function focusExisting(event: MouseEvent): boolean {
      if (!state?.focusExistingTabEnabled) return false;
      const anchor = anchorFromEvent(event);
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
          const anchor = anchorFromEvent(event);
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

    // ------------------------------------------- seleção rápida de arquivo

    /** Inputs cujo próximo clique deve passar direto para o diálogo nativo. */
    const bypass = new WeakSet<HTMLInputElement>();

    /** Reabre o input sem cair de novo na interceptação. */
    function browseNative(input: HTMLInputElement): void {
      bypass.add(input);
      input.click();
    }

    async function openPicker(input: HTMLInputElement): Promise<void> {
      const clipboardFile = await readClipboardImage();
      const usable =
        clipboardFile && matchesAccept(input, clipboardFile) ? clipboardFile : null;

      // Sem imagem para oferecer, o popup só atrapalharia: segue direto para o
      // diálogo do sistema, como se nunca tivéssemos entrado no caminho.
      if (!usable) {
        browseNative(input);
        return;
      }

      const previewUrl = URL.createObjectURL(usable);
      const close = () => {
        filePickerStore.hide();
        input.focus({ preventScroll: true });
      };

      filePickerStore.set({
        visible: true,
        clipboardFile: usable,
        previewUrl,
        fieldLabel: fieldLabel(input),
        onUseClipboard: () => {
          assignFiles(input, [usable]);
          close();
        },
        onBrowse: () => {
          close();
          browseNative(input);
        },
        onCancel: close,
      });
    }

    ctx.addEventListener(
      document,
      'click',
      (event) => {
        if (!state?.filePickerEnabled) return;
        if (event.defaultPrevented) return;

        const input = fileInputFromEvent(event);
        // Campo que não aceita imagem nunca passa por aqui: não há o que
        // oferecer, e segurar o clique só arriscaria atrapalhar o site.
        if (!input || !shouldIntercept(input) || !acceptsImages(input)) return;

        // Fomos nós que pedimos este clique: deixa o diálogo abrir.
        if (bypass.has(input)) {
          bypass.delete(input);
          return;
        }

        // Segura o diálogo nativo antes de qualquer await - depois seria tarde.
        event.preventDefault();
        event.stopPropagation();
        void openPicker(input);
      },
      { capture: true },
    );

    /**
     * Diagnóstico. No console da página, troque o contexto para a extensão
     * ("Browser Utils") e rode, por exemplo, __browserUtils.tabs().
     */
    Object.assign(globalThis, {
      __browserUtils: {
        /** O estado recebido do background (null = nunca chegou). */
        state: () => state,
        /** Chave normalizada desta página. */
        pageKey: () => normalizeUrl(location.href, state?.normalize),
        /** Chave de uma URL qualquer, com as regras atuais. */
        keyFor: (url: string) => normalizeUrl(url, state?.normalize),
        /** As outras abas abertas, como o content script as conhece. */
        tabs: () =>
          [...openByKey.entries()].map(([key, tab]) => ({ key, title: tab.title })),
        /** O link sob o ponteiro agora e se ele bate com alguma aba. */
        linkUnderPointer: () => {
          const anchor = hover.anchor;
          if (!anchor) return 'no link under the pointer';
          return {
            href: anchor.href,
            key: normalizeUrl(anchor.href, state?.normalize),
            matchingTab: matchFor(anchor) ?? null,
          };
        },
        /** Força o tooltip a aparecer: separa problema de desenho de match. */
        testTooltip: () => {
          tooltipStore.set({
            visible: true,
            x: 200,
            y: 200,
            title: 'Test tooltip',
          });
          return ui.mounted == null ? 'UI NOT mounted' : 'UI mounted';
        },
      },
    });

    // Extensão recarregada/atualizada: devolve o título ao original.
    ctx.onInvalidated(() => {
      hover.cancel();
      prefixer.dispose();
      faviconBadger.dispose();
      filePickerStore.hide();
    });
  },
});
