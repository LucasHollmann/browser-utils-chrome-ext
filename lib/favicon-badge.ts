/**
 * Marca o favicon da aba com um ponto de notificação enquanto ela for duplicada.
 *
 * O favicon original é baixado pelo background (que tem host_permissions e não
 * esbarra em CORS), redesenhado num canvas com a marcação por cima, e instalado
 * como <link rel="icon"> em data: URL. Ao deixar de ser duplicada, os <link>
 * originais voltam exatamente como estavam.
 */

const SIZE = 32;
const MARKER = '__browserUtils';

/** Estilos de marcação do favicon. */
export const FAVICON_BADGE_STYLES = ['dot', 'count', 'emoji', 'ring', 'dim'] as const;
export type FaviconBadgeStyle = (typeof FAVICON_BADGE_STYLES)[number];

export interface BadgeRequest {
  style: FaviconBadgeStyle;
  /** Quantas abas estão nesta mesma página (inclui a atual). */
  count: number;
}

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
  /** Estilo + contagem já aplicados, para recompor só quando mudarem. */
  private request: BadgeRequest = { style: 'dot', count: 0 };

  constructor(private readonly fetchIcon: FaviconFetcher) {
    this.observer = new MutationObserver(() => this.onHeadMutated());
  }

  update(wanted: boolean, request: BadgeRequest): void {
    const changed =
      wanted !== this.wanted ||
      request.style !== this.request.style ||
      // A contagem só muda o desenho no estilo numérico.
      (request.style === 'count' && request.count !== this.request.count);
    if (!changed) return;

    const wasWanted = this.wanted;
    this.wanted = wanted;
    this.request = request;
    this.generation++;

    if (!wanted) {
      this.restore();
      return;
    }
    // Mudança de estilo com o badge já instalado: refazer o desenho, mas
    // manter os links originais guardados.
    if (wasWanted) this.composed = null;
    void this.applyBadge(this.generation);
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
      this.composed = await compose(source, this.request);
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

/** Favicon original + marcação de duplicata, como data URL PNG. */
export async function compose(
  source: string | null,
  request: BadgeRequest,
): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // O anel ocupa a borda, então o favicon entra reduzido para não ser coberto.
  const inset = request.style === 'ring' ? 4 : 0;

  let drew = false;
  if (source) {
    try {
      const image = await loadImage(source);
      if (request.style === 'dim') ctx.filter = 'grayscale(1) opacity(0.45)';
      ctx.drawImage(image, inset, inset, SIZE - inset * 2, SIZE - inset * 2);
      ctx.filter = 'none';
      drew = true;
    } catch {
      // Favicon ausente, formato não suportado ou fetch bloqueado.
    }
  }
  if (!drew) drawPlaceholder(ctx, inset);

  drawBadge(ctx, request);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    // Canvas "tainted" por alguma imagem cross-origin inesperada.
    return null;
  }
}

const ACCENT = '#dc2626';

function drawBadge(ctx: CanvasRenderingContext2D, request: BadgeRequest): void {
  switch (request.style) {
    case 'dot':
    case 'dim':
      // Ponto sólido no canto superior direito, com anel claro em volta para
      // destacar de favicons escuros.
      circle(ctx, SIZE - 9, 9, 9, '#ffffff');
      circle(ctx, SIZE - 9, 9, 7, ACCENT);
      return;

    case 'count': {
      const label = request.count > 9 ? '9+' : String(Math.max(request.count, 2));
      const wide = label.length > 1;
      const width = wide ? 22 : 18;
      const left = SIZE - width - 1;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(left - 2, -1, width + 4, 22, 11);
      ctx.fill();

      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.roundRect(left, 1, width, 18, 9);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${wide ? 12 : 14}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left + width / 2, 11);
      return;
    }

    case 'emoji':
      // Emoji colorido do próprio sistema, sobre um disco claro.
      circle(ctx, SIZE - 10, 10, 11, '#ffffff');
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔁', SIZE - 10, 11);
      return;

    case 'ring':
      // Moldura em volta do favicon inteiro.
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(1.75, 1.75, SIZE - 3.5, SIZE - 3.5, 8);
      ctx.stroke();
      return;
  }
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Quadrado neutro para páginas sem favicon. */
function drawPlaceholder(ctx: CanvasRenderingContext2D, inset: number): void {
  ctx.fillStyle = '#9ca3af';
  ctx.beginPath();
  ctx.roundRect(inset + 3, inset + 3, SIZE - inset * 2 - 6, SIZE - inset * 2 - 6, 7);
  ctx.fill();
}
