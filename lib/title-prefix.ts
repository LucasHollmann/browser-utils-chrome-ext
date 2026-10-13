/**
 * Aplica (e remove) um prefixo no <title> da página.
 *
 * Muitas páginas reescrevem o próprio título — contadores de notificação,
 * roteadores de SPA, react-helmet. Um MutationObserver reaplica o prefixo
 * quando isso acontece. Para não entrar em loop, o observer é desconectado
 * enquanto nós mesmos escrevemos no título (o disconnect também descarta os
 * registros de mutação pendentes).
 */
export class TitlePrefixer {
  private observer: MutationObserver;
  private wanted = false;
  private prefix = '';
  /** Prefixo que está (ou esteve) aplicado, para conseguir removê-lo depois. */
  private applied = '';
  private observing = false;

  constructor() {
    this.observer = new MutationObserver(() => this.sync());
  }

  /** Define se a aba é duplicada e qual prefixo usar. */
  update(wanted: boolean, prefix: string): void {
    this.wanted = wanted && prefix.length > 0;
    if (prefix) this.prefix = prefix;
    this.sync();
    if (this.wanted) this.start();
    else this.stop();
  }

  /** Remove o prefixo e para de observar (extensão recarregada/desligada). */
  dispose(): void {
    this.wanted = false;
    this.sync();
    this.stop();
  }

  private start(): void {
    if (this.observing || !document.head) return;
    // Observa a <head> inteira: cobre tanto a troca do texto do <title>
    // quanto a substituição do próprio elemento <title> (comum em SPAs).
    this.observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.observing = true;
  }

  private stop(): void {
    if (!this.observing) return;
    this.observer.disconnect();
    this.observing = false;
  }

  private sync(): void {
    const current = document.title;
    const base = stripPrefixes(current, [this.prefix, this.applied]);
    const next = this.wanted ? this.prefix + base : base;
    if (next === current) return;

    const wasObserving = this.observing;
    this.stop();
    document.title = next;
    this.applied = this.wanted ? this.prefix : '';
    if (wasObserving) this.start();
  }
}

/**
 * Remove todas as ocorrências iniciais dos prefixos informados.
 * Garante que o prefixo nunca fique duplicado ("🔁 🔁 Página").
 */
export function stripPrefixes(title: string, prefixes: string[]): string {
  const valid = prefixes.filter((p) => p.length > 0);
  let result = title;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of valid) {
      if (result.startsWith(prefix)) {
        result = result.slice(prefix.length);
        changed = true;
      }
    }
  }
  return result;
}
