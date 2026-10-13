/**
 * Normalização de URL — a regra de "duas páginas são a mesma página".
 *
 * Função pura, sem dependência de APIs de extensão, para poder ser testada
 * isoladamente (ver normalize-url.test.ts).
 */

export interface NormalizeOptions {
  /** Ignora o fragmento (#secao). */
  ignoreHash: boolean;
  /** Ignora a barra final do path (/docs/ === /docs). */
  ignoreTrailingSlash: boolean;
  /** Remove parâmetros de rastreamento (utm_*, fbclid, gclid, ...). */
  stripTrackingParams: boolean;
  /** Trata http:// e https:// como equivalentes. */
  ignoreProtocol: boolean;
  /** Trata example.com e www.example.com como equivalentes. */
  ignoreWww: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  ignoreHash: true,
  ignoreTrailingSlash: true,
  stripTrackingParams: true,
  ignoreProtocol: true,
  ignoreWww: true,
};

/** Parâmetros de rastreamento removidos por nome exato. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'gbraid',
  'wbraid',
  'dclid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'mkt_tok',
  // Parâmetros de contexto/compartilhamento: mudam de onde o link veio, não
  // a página que ele abre.
  'si',
  'pp',
  'feature',
  'ab_channel',
  'vero_id',
  'vero_conv',
  '_hsenc',
  '_hsmi',
  'oly_anon_id',
  'oly_enc_id',
  'pk_campaign',
  'pk_kwd',
  'piwik_campaign',
  'piwik_kwd',
  'hsa_cam',
  'hsa_grp',
  'hsa_ad',
]);

/** Prefixos de parâmetros de rastreamento (utm_source, utm_medium, ...). */
const TRACKING_PREFIXES = ['utm_', 'matomo_', 'vmc_'];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Esquemas em que faz sentido normalizar host/protocolo. */
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Converte uma URL na sua "chave" canônica. Duas URLs com a mesma chave são
 * consideradas a mesma página.
 *
 * Retorna `null` quando a URL não é analisável ou não é uma página de conteúdo
 * (about:blank, chrome://, etc.) — o chamador deve ignorar essas abas.
 */
export function normalizeUrl(
  url: string | undefined | null,
  options: Partial<NormalizeOptions> = {},
): string | null {
  if (!url) return null;

  const opts: NormalizeOptions = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const isWeb = WEB_PROTOCOLS.has(parsed.protocol);

  // Protocolo
  let protocol: string;
  if (isWeb && opts.ignoreProtocol) {
    protocol = 'http:';
  } else {
    protocol = parsed.protocol;
  }

  // Host (o construtor URL já faz lowercase e remove portas padrão)
  let host = parsed.host;
  if (isWeb && opts.ignoreWww && host.startsWith('www.')) {
    host = host.slice(4);
  }

  // Path
  let path = parsed.pathname;
  if (opts.ignoreTrailingSlash) {
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '/') path = '';
  }

  // Query
  let search = '';
  if (parsed.search) {
    const params = new URLSearchParams(parsed.search);
    if (opts.stripTrackingParams) {
      for (const name of [...params.keys()]) {
        if (isTrackingParam(name)) params.delete(name);
      }
    }
    const serialized = params.toString();
    if (serialized) search = `?${serialized}`;
  }

  // Fragmento
  const hash = opts.ignoreHash ? '' : parsed.hash;

  // Mantém o "//" mesmo quando o host é vazio (file:///...).
  const hasAuthority = /^[a-z][a-z0-9+.-]*:\/\//i.test(url.trim());
  const authority = hasAuthority ? `//${host}` : '';
  return `${protocol}${authority}${path}${search}${hash}`;
}

/** URLs em que nenhum content script roda — podem ser ignoradas sem erro. */
const RESTRICTED_PREFIXES = [
  'chrome://',
  'brave://',
  'edge://',
  'about:',
  'chrome-extension://',
  'moz-extension://',
  'devtools://',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
  'https://addons.mozilla.org',
];

export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return RESTRICTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
