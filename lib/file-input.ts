/**
 * Seleção rápida de arquivo: em vez de abrir direto o diálogo do sistema,
 * o clique em um <input type="file"> oferece a imagem que está na área de
 * transferência.
 *
 * Fica separado do content script para poder ser testado com DOM de mentira.
 */

/** Tipos de imagem que o Chrome entrega em navigator.clipboard.read(). */
const CLIPBOARD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Extensões que contam como imagem num accept do tipo ".png,.jpg". */
const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.svg',
];

/**
 * O <input type="file"> por baixo do clique.
 *
 * Usa composedPath() pelo mesmo motivo do hover em links: sites feitos com web
 * components escondem o input dentro de um shadow root, e o event.target que
 * chega ao document é o host.
 *
 * O input quase sempre está escondido atrás de um botão estilizado, que chama
 * input.click(). Esse clique sintético também passa por aqui, com o input no
 * composedPath, então os dois caminhos são cobertos.
 */
export function fileInputFromEvent(event: Event): HTMLInputElement | null {
  for (const node of event.composedPath()) {
    if (isFileInput(node)) return node;
  }
  const target = event.target;
  if (target instanceof Element) {
    const input = target.closest('input[type="file"]');
    if (isFileInput(input)) return input;
  }
  return null;
}

function isFileInput(node: unknown): node is HTMLInputElement {
  return (
    node instanceof Element &&
    node.tagName === 'INPUT' &&
    (node as HTMLInputElement).type === 'file'
  );
}

/**
 * Vale a pena interceptar este input?
 *
 * Seleção de pasta e input desabilitado ficam de fora: não há o que oferecer.
 */
export function shouldIntercept(input: HTMLInputElement): boolean {
  if (input.disabled) return false;
  if (input.hasAttribute('webkitdirectory') || input.hasAttribute('directory')) {
    return false;
  }
  return true;
}

/**
 * O campo aceita imagem?
 *
 * Sem accept, aceita qualquer coisa - inclusive imagem. Com accept, basta uma
 * regra que cubra imagem (image/*, um tipo de imagem, ou uma extensão de
 * imagem). Campo de PDF ou de planilha não interessa: lá o popup só atrapalha.
 */
export function acceptsImages(input: HTMLInputElement): boolean {
  const accept = input.getAttribute('accept')?.trim();
  if (!accept) return true;

  return accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return IMAGE_EXTENSIONS.includes(rule);
      if (rule.endsWith('/*')) return rule === 'image/*';
      return rule.startsWith('image/');
    });
}

/**
 * O arquivo passa pelo filtro do atributo accept?
 *
 * Aceita as três formas da especificação: tipo exato (image/png), curinga
 * (image/*) e extensão (.png). Sem accept, tudo serve.
 */
export function matchesAccept(input: HTMLInputElement, file: File): boolean {
  const accept = input.getAttribute('accept')?.trim();
  if (!accept) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

/**
 * Entrega os arquivos ao site como se o usuário os tivesse escolhido.
 *
 * input.files só aceita uma FileList, que não dá para construir à mão; o
 * caminho oficial é passar pelo DataTransfer. Os dois eventos são disparados
 * porque metade dos frameworks escuta 'change' e a outra metade, 'input'.
 */
export function assignFiles(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Nome do arquivo colado: data e hora, para não repetir "imagem.png". */
export function clipboardFileName(type: string, now = new Date()): string {
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `pasted ${stamp}.${extension}`;
}

/**
 * A imagem que está na área de transferência, se houver.
 *
 * navigator.clipboard.read() exige permissão (clipboardRead no manifest),
 * documento focado e gesto do usuário recente - por isso só é chamada logo
 * depois do clique no input. Qualquer negativa vira null: a extensão cai no
 * diálogo normal em vez de quebrar a página.
 */
export async function readClipboardImage(
  clipboard: Clipboard | undefined = navigator.clipboard,
): Promise<File | null> {
  if (!clipboard?.read) return null;
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) =>
        CLIPBOARD_IMAGE_TYPES.includes(candidate),
      );
      if (!type) continue;
      const blob = await item.getType(type);
      return new File([blob], clipboardFileName(type), { type });
    }
  } catch {
    // Sem permissão, sem foco ou clipboard vazio.
  }
  return null;
}

/**
 * Um rótulo curto para o campo, só para o usuário reconhecer de onde veio o
 * popup ("Anexar currículo"). Vazio quando não há nada confiável.
 */
export function fieldLabel(input: HTMLInputElement): string {
  const candidates = [
    input.getAttribute('aria-label'),
    labelText(input),
    input.getAttribute('title'),
  ];
  for (const candidate of candidates) {
    const text = candidate?.replace(/\s+/g, ' ').trim();
    if (text) return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }
  return '';
}

function labelText(input: HTMLInputElement): string | null {
  const id = input.getAttribute('aria-labelledby');
  if (id) {
    const labelled = input.ownerDocument.getElementById(id);
    if (labelled?.textContent) return labelled.textContent;
  }
  const label = input.closest('label') ?? input.labels?.[0];
  return label?.textContent ?? null;
}
