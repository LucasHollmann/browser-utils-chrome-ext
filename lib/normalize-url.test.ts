import { describe, expect, it } from 'vitest';
import { isRestrictedUrl, normalizeUrl } from './normalize-url';

const same = (a: string, b: string, opts = {}) =>
  expect(normalizeUrl(a, opts)).toBe(normalizeUrl(b, opts));

const differ = (a: string, b: string, opts = {}) =>
  expect(normalizeUrl(a, opts)).not.toBe(normalizeUrl(b, opts));

describe('normalizeUrl', () => {
  it('retorna null para entradas inválidas', () => {
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('não é uma url')).toBeNull();
  });

  describe('fragmento', () => {
    it('ignora o #hash por padrão', () => {
      same('https://a.com/p#topo', 'https://a.com/p#rodape');
    });

    it('respeita o hash quando a regra está desligada', () => {
      differ('https://a.com/p#topo', 'https://a.com/p#rodape', { ignoreHash: false });
    });
  });

  describe('barra final', () => {
    it('ignora a barra final por padrão', () => {
      same('https://a.com/docs/', 'https://a.com/docs');
      same('https://a.com/', 'https://a.com');
    });

    it('preserva a barra quando a regra está desligada', () => {
      differ('https://a.com/docs/', 'https://a.com/docs', { ignoreTrailingSlash: false });
    });

    it('não confunde paths diferentes', () => {
      differ('https://a.com/docs', 'https://a.com/docs/x');
    });
  });

  describe('parâmetros de rastreamento', () => {
    it('remove utm_*, fbclid e gclid', () => {
      expect(normalizeUrl('https://a.com/p?utm_source=x&utm_medium=y&fbclid=z&gclid=w')).toBe(
        'http://a.com/p',
      );
    });

    it('preserva parâmetros funcionais', () => {
      expect(normalizeUrl('https://a.com/busca?q=react&utm_source=news')).toBe(
        'http://a.com/busca?q=react',
      );
    });

    it('não remove nada quando a regra está desligada', () => {
      differ('https://a.com/p?utm_source=x', 'https://a.com/p', { stripTrackingParams: false });
    });

    it('distingue valores diferentes do mesmo parâmetro', () => {
      differ('https://a.com/p?id=1', 'https://a.com/p?id=2');
    });
  });

  describe('protocolo e www', () => {
    it('trata http e https como equivalentes', () => {
      same('http://a.com/p', 'https://a.com/p');
    });

    it('trata www. como equivalente', () => {
      same('https://www.a.com/p', 'https://a.com/p');
    });

    it('separa protocolos quando a regra está desligada', () => {
      differ('http://a.com/p', 'https://a.com/p', { ignoreProtocol: false });
    });

    it('separa www quando a regra está desligada', () => {
      differ('https://www.a.com/p', 'https://a.com/p', { ignoreWww: false });
    });

    it('só remove www. do início do host', () => {
      differ('https://www.a.com/p', 'https://api.www.a.com/p');
    });

    it('não mexe no protocolo de esquemas não-web', () => {
      expect(normalizeUrl('file:///c:/tmp/a.html')).toBe('file:///c:/tmp/a.html');
    });
  });

  describe('casos gerais', () => {
    it('ignora diferenças de maiúsculas no host, mas não no path', () => {
      same('https://A.com/p', 'https://a.com/p');
      differ('https://a.com/P', 'https://a.com/p');
    });

    it('remove a porta padrão', () => {
      same('https://a.com:443/p', 'https://a.com/p');
    });

    it('mantém porta não padrão', () => {
      differ('http://a.com:3000/p', 'http://a.com/p');
    });

    it('combina todas as regras', () => {
      expect(normalizeUrl('HTTPS://WWW.Exemplo.com/artigo/?utm_campaign=abc#comentarios')).toBe(
        'http://exemplo.com/artigo',
      );
    });

    it('é idempotente', () => {
      const once = normalizeUrl('https://www.a.com/p/?utm_source=x#y')!;
      expect(normalizeUrl(once)).toBe(once);
    });
  });
});

describe('isRestrictedUrl', () => {
  it('reconhece páginas internas do navegador', () => {
    expect(isRestrictedUrl('brave://settings')).toBe(true);
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('about:blank')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/detail/abc')).toBe(true);
    expect(isRestrictedUrl(undefined)).toBe(true);
  });

  it('aceita páginas normais', () => {
    expect(isRestrictedUrl('https://exemplo.com')).toBe(false);
  });
});
