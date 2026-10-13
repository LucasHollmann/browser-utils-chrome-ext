/**
 * Detecção de hover em links, por delegação de eventos.
 *
 * Fica separada do content script para poder ser testada com DOM de mentira,
 * inclusive o caso de links dentro de shadow DOM.
 */

export interface LinkHoverOptions<T> {
  /** Espera antes de mostrar, para não piscar ao atravessar links. */
  delayMs: number;
  /** O que mostrar para este link, ou undefined para não mostrar nada. */
  lookup: (anchor: HTMLAnchorElement) => T | undefined;
  show: (match: T, x: number, y: number) => void;
  hide: () => void;
}

export class LinkHover<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pointer = { x: 0, y: 0 };
  private hovered: HTMLAnchorElement | null = null;

  constructor(private readonly options: LinkHoverOptions<T>) {}

  /** O link sob o ponteiro agora (null se não for um link). */
  get anchor(): HTMLAnchorElement | null {
    return this.hovered;
  }

  handleMouseMove = (event: MouseEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY };
  };

  handleMouseOver = (event: MouseEvent): void => {
    const anchor = anchorFromEvent(event);
    if (anchor === this.hovered) return;

    // Trocar de link, ou sair de um link para fora dele: o mouseover do
    // elemento novo já serve de "saída" do anterior.
    this.hovered = anchor;
    this.cancel();
    this.options.hide();
    if (!anchor) return;

    const match = this.options.lookup(anchor);
    if (match === undefined) return;

    this.timer = setTimeout(() => {
      this.timer = undefined;
      // O ponteiro pode ter saído do link durante a espera.
      if (this.hovered !== anchor) return;
      this.options.show(match, this.pointer.x, this.pointer.y);
    }, this.options.delayMs);
  };

  handleMouseOut = (event: MouseEvent): void => {
    if (!this.hovered) return;
    // Só interessa sair da janela; trocar de elemento dentro da página é
    // tratado pelo mouseover do elemento novo.
    if (event.relatedTarget !== null) return;
    this.reset();
  };

  /** Esconde e esquece o link atual (Esc, scroll, clique, perda de foco). */
  reset = (): void => {
    this.hovered = null;
    this.cancel();
    this.options.hide();
  };

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * O <a> por baixo do ponteiro.
 *
 * Usa composedPath() porque sites feitos com web components (YouTube, Reddit,
 * GitHub) montam os links dentro de shadow roots: nesses casos o event.target
 * que chega ao document é o host do shadow root, e um closest() nele nunca
 * encontraria o <a>.
 */
export function anchorFromEvent(event: Event): HTMLAnchorElement | null {
  for (const node of event.composedPath()) {
    if (isAnchor(node)) return node;
  }
  const target = event.target;
  if (target instanceof Element) {
    const anchor = target.closest('a[href]');
    if (isAnchor(anchor)) return anchor;
  }
  return null;
}

function isAnchor(node: unknown): node is HTMLAnchorElement {
  return (
    node instanceof Element &&
    node.tagName === 'A' &&
    node.hasAttribute('href')
  );
}
