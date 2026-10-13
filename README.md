# Abas Duplicadas

Extensão Manifest V3 (Brave/Chrome) que identifica páginas duplicadas entre as abas abertas.

- **Prefixo no título**: abas com a mesma URL (após normalização) ganham um prefixo configurável (`🔁 `). O prefixo some quando a aba deixa de ser duplicada.
- **Tooltip em links**: ao passar o mouse sobre um link cuja página já está aberta em outra aba, aparece um aviso com o título daquela aba.
- **Alt+clique / clique do meio** em um link já aberto focam a aba existente em vez de abrir outra.
- **Popup**: lista os grupos de abas duplicadas (ir para / fechar) e liga/desliga cada funcionalidade.

Stack: [WXT](https://wxt.dev) + React + TypeScript.

## Desenvolvimento

```bash
npm install
npm run dev      # build em watch + abre um navegador com a extensão carregada
npm run build    # build de produção em .output/chrome-mv3
npm test         # testes da normalização de URL
npm run compile  # typecheck
```

## Carregar no Brave (modo desenvolvedor)

1. `npm run build` (ou `npm run dev`, que gera `.output/chrome-mv3-dev`).
2. Abra `brave://extensions`.
3. Ligue o **Modo de desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `.output/chrome-mv3` (ou `.output/chrome-mv3-dev`).
6. Depois de recarregar a extensão, **recarregue as abas já abertas** — content scripts não entram em páginas que já estavam carregadas.

Para ver os logs do background: em `brave://extensions`, clique em **service worker** no card da extensão.

### Janelas anônimas

Por padrão a extensão não roda em janelas anônimas. Para testar esse cenário, abra os detalhes da extensão e ligue **Permitir no modo anônimo**. Mesmo assim, abas anônimas e normais não são agrupadas entre si (configurável no popup).

## Arquitetura

| Arquivo | Papel |
| --- | --- |
| [lib/normalize-url.ts](lib/normalize-url.ts) | `normalizeUrl()` — a regra de "duas páginas são a mesma". Função pura e testada. |
| [lib/settings.ts](lib/settings.ts) | Configurações em `chrome.storage.sync`. |
| [lib/messages.ts](lib/messages.ts) | Contrato de mensagens entre background, content script e popup. |
| [lib/title-prefix.ts](lib/title-prefix.ts) | Aplica/remove o prefixo no `<title>` com `MutationObserver`. |
| [entrypoints/background.ts](entrypoints/background.ts) | Fonte da verdade: mapa `tabId → URL normalizada`, detecção de duplicatas, transmissão de estado. |
| [entrypoints/content.tsx](entrypoints/content.tsx) | Prefixo no título + tooltip (Shadow DOM) + Alt/meio-clique. |
| [entrypoints/popup/](entrypoints/popup/) | Popup React. |

O background mantém o estado e, a cada mudança, envia a cada content script: se aquela aba é duplicada e a lista de URLs abertas (chave normalizada, título e `tabId`). Assim o tooltip responde ao hover sem ida e volta ao background. Como o service worker pode ser suspenso, o estado é reconstruído com `chrome.tabs.query({})` sempre que ele sobe e sempre que o popup pede os grupos.

Permissões usadas: `tabs`, `storage` e `host_permissions: ["<all_urls>"]`.

## Limitações conhecidas

- Abas suspensas/descartadas pela economia de memória do Brave não executam content script: elas **contam** como duplicatas para as outras abas, mas só recebem o prefixo quando são reativadas (o content script pede o estado ao voltar).
- Páginas restritas (`brave://`, `chrome://`, Web Store) não aceitam content script: entram na contagem de duplicatas, mas não recebem prefixo nem tooltip.
