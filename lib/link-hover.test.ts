// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anchorFromEvent, LinkHover } from './link-hover';

const DELAY = 150;

function hover(element: Element): void {
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
}

describe('LinkHover', () => {
  let shown: Array<{ match: string; x: number; y: number }>;
  let hidden: number;
  let hoverer: LinkHover<string>;
  let listeners: AbortController;

  /** Só "https://aberta.com/" conta como já aberta em outra aba. */
  const lookup = (anchor: HTMLAnchorElement) =>
    anchor.href === 'https://aberta.com/' ? 'Página aberta' : undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    shown = [];
    hidden = 0;
    hoverer = new LinkHover<string>({
      delayMs: DELAY,
      lookup,
      show: (match, x, y) => shown.push({ match, x, y }),
      hide: () => {
        hidden++;
      },
    });
    // Sem o signal, os listeners de um teste continuariam atendendo o
    // seguinte e os resultados se somariam.
    listeners = new AbortController();
    const signal = listeners.signal;
    document.addEventListener('mouseover', hoverer.handleMouseOver, { signal });
    document.addEventListener('mousemove', hoverer.handleMouseMove, { signal });
    document.addEventListener('mouseout', hoverer.handleMouseOut, { signal });
  });

  afterEach(() => {
    listeners.abort();
    vi.useRealTimers();
  });

  function addLink(href: string, html = 'link'): HTMLAnchorElement {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.innerHTML = html;
    document.body.appendChild(anchor);
    return anchor;
  }

  it('mostra depois da espera quando a página já está aberta', () => {
    hover(addLink('https://aberta.com/'));
    expect(shown).toHaveLength(0);

    vi.advanceTimersByTime(DELAY);
    expect(shown).toEqual([{ match: 'Página aberta', x: 0, y: 0 }]);
  });

  it('não mostra nada para uma página que não está aberta', () => {
    hover(addLink('https://outra.com/'));
    vi.advanceTimersByTime(DELAY * 10);
    expect(shown).toHaveLength(0);
  });

  it('usa a posição do ponteiro no momento de mostrar', () => {
    const link = addLink('https://aberta.com/');
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 80 }),
    );
    hover(link);
    vi.advanceTimersByTime(DELAY);
    expect(shown[0]).toMatchObject({ x: 120, y: 80 });
  });

  it('encontra o link mesmo com o mouse sobre um filho dele', () => {
    const link = addLink('https://aberta.com/', '<span><b>texto</b></span>');
    hover(link.querySelector('b')!);
    vi.advanceTimersByTime(DELAY);
    expect(shown).toHaveLength(1);
  });

  it('não mostra se o ponteiro sair do link antes da espera terminar', () => {
    hover(addLink('https://aberta.com/'));
    vi.advanceTimersByTime(DELAY - 20);

    const fora = document.createElement('div');
    document.body.appendChild(fora);
    hover(fora);

    vi.advanceTimersByTime(DELAY * 2);
    expect(shown).toHaveLength(0);
  });

  it('esconde ao passar para outro elemento', () => {
    hover(addLink('https://aberta.com/'));
    vi.advanceTimersByTime(DELAY);
    expect(shown).toHaveLength(1);

    const fora = document.createElement('div');
    document.body.appendChild(fora);
    hover(fora);
    expect(hidden).toBeGreaterThan(0);
    expect(hoverer.anchor).toBeNull();
  });

  it('não reagenda enquanto o ponteiro continua no mesmo link', () => {
    const link = addLink('https://aberta.com/');
    hover(link);
    hover(link);
    hover(link);
    vi.advanceTimersByTime(DELAY);
    expect(shown).toHaveLength(1);
  });

  it('esconde ao sair da janela', () => {
    hover(addLink('https://aberta.com/'));
    vi.advanceTimersByTime(DELAY);

    document.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }),
    );
    expect(hidden).toBeGreaterThan(0);
    expect(hoverer.anchor).toBeNull();
  });

  it('funciona com link adicionado depois do listener', () => {
    vi.advanceTimersByTime(1000);
    hover(addLink('https://aberta.com/'));
    vi.advanceTimersByTime(DELAY);
    expect(shown).toHaveLength(1);
  });

  it('enxerga links dentro de shadow DOM', () => {
    // É o caso do YouTube e de qualquer site feito com web components: o
    // event.target que chega ao document é o host, não o <a>.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const link = document.createElement('a');
    link.href = 'https://aberta.com/';
    link.textContent = 'dentro do shadow';
    shadow.appendChild(link);

    hover(link);
    vi.advanceTimersByTime(DELAY);
    expect(shown).toHaveLength(1);
  });
});

describe('anchorFromEvent', () => {
  it('devolve null fora de links', () => {
    document.body.innerHTML = '<div id="x">texto</div>';
    const target = document.getElementById('x')!;
    const event = new MouseEvent('mouseover', { bubbles: true, composed: true });
    target.dispatchEvent(event);
    expect(anchorFromEvent(event)).toBeNull();
  });

  it('ignora <a> sem href (âncora de nome)', () => {
    document.body.innerHTML = '<a id="x">sem href</a>';
    const target = document.getElementById('x')!;
    const event = new MouseEvent('mouseover', { bubbles: true, composed: true });
    target.dispatchEvent(event);
    expect(anchorFromEvent(event)).toBeNull();
  });
});
