/**
 * Marca o favicon da aba com um ponto de notificação enquanto ela for duplicada.
 *
 * O favicon original é baixado pelo background (que tem host_permissions e não
 * esbarra em CORS), redesenhado num canvas com o ponto por cima, e instalado
 * como <link rel="icon"> em data: URL. Ao deixar de ser duplicada, os <link>
 * originais voltam exatamente como estavam.
 */

const SIZE = 32;
const MARKER = '__abasDuplicadas';

export type FaviconFetcher = (url: string) => Promise<string | null>;

export class FaviconBadger {
  private observer: MutationObserver;
  private observing = false;
  private wanted = false;
  /** Data URL já composta, para reaplicar sem refazer o trabalho. */
  private composed: string | null = null;
  /** Links originais removidos, para restaurar depois. */
  private originalLinks: HTMLLinkElement[] | null = null;
  /** Invalida resultados assíncronos de um estado que já mudou. */
  private generation = 0;
  private reapplyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly fetchIcon: FaviconFetcher) {
    this.observer = new MutationObserver(() => this.onHeadMutated());
  }

  update(wanted: boolean): void {
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    this.generation++;

    if (wanted) void this.applyBadge(this.generation);
    else this.restore();
  }

  dispose(): void {
    this.wanted = false;
    this.generation++;
    if (this.reapplyTimer) clearTimeout(this.reapplyTimer);
    this.reapplyTimer = undefined;
    this.restore();
  }

  // ------------------------------------------------------------- aplicação

  private async applyBadge(generation: number): Promise<void> {
    if (!document.head) return;

    if (!this.composed) {
      const source = await this.fetchIcon(sourceIconUrl());
      if (generation !== this.generation) return;
      this.composed = await compose(source);
      if (generation !== this.generation || !this.composed) return;
    }

    this.install(this.composed);
    this.startObserving();
  }

  private install(href: string): void {
    const stop = this.pauseObserving();

    const existing = iconLinks();
    // Guarda os links do site para restaurar depois. Numa reaplicação, os
    // links atuais são os mais recentes (o site pode ter trocado o favicon),
    // então eles substituem os guardados antes.
    if (existing.length > 0 || !this.originalLinks) this.originalLinks = existing;
    existing.forEach((link) => link.remove());
    ourLinks().forEach((link) => link.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = href;
    link.dataset[MARKER] = '1';
    document.head.appendChild(link);

    stop();
  }

  private restore(): void {
    const stop = this.pauseObserving();

    ourLinks().forEach((link) => link.remove());
    if (this.originalLinks && document.head) {
      for (const link of this.originalLinks) document.head.appendChild(link);
    }
    this.originalLinks = null;
    this.composed = null;

    stop();
    this.stopObserving();
  }

  /**
   * Páginas que trocam o próprio favicon (SPAs, contadores) apagam o nosso
   * link; aqui ele é reinstalado.
   */
  private onHeadMutated(): void {
    if (!this.wanted || !this.composed) return;
    if (ourLinks().length > 0) return;

    // O site instalou um favicon novo: recompor a partir dele. Com um atraso
    // curto, para não refazer tudo a cada quadro em favicons animados.
    if (this.reapplyTimer) return;
    this.reapplyTimer = setTimeout(() => {
      this.reapplyTimer = undefined;
      if (!this.wanted || ourLinks().length > 0) return;
      this.composed = null;
      void this.applyBadge(this.generation);
    }, 500);
  }

  private startObserving(): void {
    if (this.observing || !document.head) return;
    this.observer.observe(document.head, { childList: true });
    this.observing = true;
  }

  private stopObserving(): void {
    if (!this.observing) return;
    this.observer.disconnect();
    this.observing = false;
  }

  /** Desliga o observer durante as nossas próprias escritas (evita loop). */
  private pauseObserving(): () => void {
    const wasObserving = this.observing;
    this.stopObserving();
    return () => {
      if (wasObserving) this.startObserving();
    };
  }
}

// ------------------------------------------------------------------ helpers

function iconLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].filter(
    (link) => link.dataset[MARKER] !== '1',
  );
}

function ourLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].filter(
    (link) => link.dataset[MARKER] === '1',
  );
}

/** O favicon declarado pela página, ou o /favicon.ico padrão. */
export function sourceIconUrl(): string {
  const links = iconLinks();
  const last = links[links.length - 1];
  if (last?.href) return last.href;
  return new URL('/favicon.ico', location.href).href;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('favicon não carregou'));
    image.src = src;
  });
}

/** Favicon original + ponto de notificação, como data URL PNG. */
export async function compose(source: string | null): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let drew = false;
  if (source) {
    try {
      const image = await loadImage(source);
      ctx.drawImage(image, 0, 0, SIZE, SIZE);
      drew = true;
    } catch {
      // Favicon ausente, formato não suportado ou fetch bloqueado.
    }
  }
  if (!drew) drawPlaceholder(ctx);

  // Ponto de notificação no canto superior direito, com anel claro em volta
  // para destacar de favicons escuros.
  ctx.beginPath();
  ctx.arc(SIZE - 9, 9, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(SIZE - 9, 9, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();

  try {
    return canvas.toDataURL('image/png');
  } catch {
    // Canvas "tainted" por alguma imagem cross-origin inesperada.
    return null;
  }
}

/** Quadrado neutro para páginas sem favicon. */
function drawPlaceholder(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#9ca3af';
  ctx.beginPath();
  ctx.roundRect(3, 3, SIZE - 6, SIZE - 6, 7);
  ctx.fill();
}
