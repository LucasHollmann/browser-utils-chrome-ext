// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptsImages,
  assignFiles,
  clipboardFileName,
  fieldLabel,
  fileInputFromEvent,
  matchesAccept,
  readClipboardImage,
  shouldIntercept,
} from './file-input';

function fileInput(attributes: Record<string, string> = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  for (const [name, value] of Object.entries(attributes)) {
    input.setAttribute(name, value);
  }
  return input;
}

function png(name = 'imagem.png'): File {
  return new File(['dados'], name, { type: 'image/png' });
}

/** Um ClipboardItem de mentira, com só o que readClipboardImage usa. */
function clipboardWith(items: Array<{ types: string[]; blob?: Blob }>): Clipboard {
  return {
    read: async () =>
      items.map((item) => ({
        types: item.types,
        getType: async () => item.blob ?? new Blob(['dados'], { type: item.types[0] }),
      })),
  } as unknown as Clipboard;
}

describe('fileInputFromEvent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('encontra o input clicado diretamente', () => {
    const input = fileInput();
    document.body.append(input);

    let found: HTMLInputElement | null = null;
    document.addEventListener('click', (event) => {
      found = fileInputFromEvent(event);
    });
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(found).toBe(input);
  });

  it('encontra o input dentro de um shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const input = fileInput();
    shadow.append(input);

    let found: HTMLInputElement | null = null;
    document.addEventListener('click', (event) => {
      found = fileInputFromEvent(event);
    });
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(found).toBe(input);
  });

  it('ignora clique fora de qualquer input de arquivo', () => {
    const button = document.createElement('button');
    document.body.append(button);

    let found: HTMLInputElement | null = null;
    document.addEventListener('click', (event) => {
      found = fileInputFromEvent(event);
    });
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(found).toBeNull();
  });
});

describe('shouldIntercept', () => {
  it('aceita um input comum', () => {
    expect(shouldIntercept(fileInput())).toBe(true);
  });

  it('recusa seleção de pasta', () => {
    expect(shouldIntercept(fileInput({ webkitdirectory: '' }))).toBe(false);
  });

  it('recusa input desabilitado', () => {
    const input = fileInput();
    input.disabled = true;
    expect(shouldIntercept(input)).toBe(false);
  });
});

describe('acceptsImages', () => {
  it('aceita campo sem accept', () => {
    expect(acceptsImages(fileInput())).toBe(true);
  });

  it('aceita image/*, tipo de imagem e extensão de imagem', () => {
    expect(acceptsImages(fileInput({ accept: 'image/*' }))).toBe(true);
    expect(acceptsImages(fileInput({ accept: 'image/png,image/jpeg' }))).toBe(true);
    expect(acceptsImages(fileInput({ accept: '.PNG,.pdf' }))).toBe(true);
  });

  it('recusa campo que só quer documento', () => {
    expect(acceptsImages(fileInput({ accept: '.pdf,.docx' }))).toBe(false);
    expect(acceptsImages(fileInput({ accept: 'application/pdf' }))).toBe(false);
    expect(acceptsImages(fileInput({ accept: 'video/*' }))).toBe(false);
  });
});

describe('matchesAccept', () => {
  it('aceita tudo sem accept', () => {
    expect(matchesAccept(fileInput(), png())).toBe(true);
  });

  it('entende curinga de tipo', () => {
    expect(matchesAccept(fileInput({ accept: 'image/*' }), png())).toBe(true);
    expect(matchesAccept(fileInput({ accept: 'video/*' }), png())).toBe(false);
  });

  it('entende tipo exato e lista', () => {
    expect(matchesAccept(fileInput({ accept: 'image/jpeg,image/png' }), png())).toBe(true);
    expect(matchesAccept(fileInput({ accept: 'image/jpeg' }), png())).toBe(false);
  });

  it('entende extensão, sem ligar para maiúsculas', () => {
    expect(matchesAccept(fileInput({ accept: '.PNG' }), png('Foto.png'))).toBe(true);
    expect(matchesAccept(fileInput({ accept: '.pdf' }), png())).toBe(false);
  });
});

describe('assignFiles', () => {
  it('entrega o arquivo e avisa a página', () => {
    const input = fileInput();
    document.body.append(input);
    const eventos: string[] = [];
    input.addEventListener('input', () => eventos.push('input'));
    input.addEventListener('change', () => eventos.push('change'));

    assignFiles(input, [png('colado.png')]);

    expect(input.files?.length).toBe(1);
    expect(input.files?.[0]?.name).toBe('colado.png');
    expect(eventos).toEqual(['input', 'change']);
  });
});

describe('clipboardFileName', () => {
  it('usa data, hora e a extensão do tipo', () => {
    const name = clipboardFileName('image/png', new Date(2026, 0, 5, 9, 7, 3));
    expect(name).toBe('pasted 2026-01-05 090703.png');
  });

  it('abrevia jpeg para jpg', () => {
    expect(clipboardFileName('image/jpeg', new Date(2026, 0, 5, 9, 7, 3))).toMatch(
      /\.jpg$/,
    );
  });
});

describe('readClipboardImage', () => {
  it('devolve a primeira imagem da área de transferência', async () => {
    const file = await readClipboardImage(
      clipboardWith([{ types: ['text/plain'] }, { types: ['image/png'] }]),
    );
    expect(file?.type).toBe('image/png');
  });

  it('devolve null quando só há texto', async () => {
    expect(await readClipboardImage(clipboardWith([{ types: ['text/html'] }]))).toBeNull();
  });

  it('devolve null quando a leitura é negada', async () => {
    const clipboard = {
      read: async () => {
        throw new Error('NotAllowedError');
      },
    } as unknown as Clipboard;
    expect(await readClipboardImage(clipboard)).toBeNull();
  });

  it('devolve null sem API de clipboard', async () => {
    expect(await readClipboardImage(undefined)).toBeNull();
  });
});

describe('fieldLabel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefere o aria-label', () => {
    expect(fieldLabel(fileInput({ 'aria-label': 'Anexar currículo' }))).toBe(
      'Anexar currículo',
    );
  });

  it('usa o texto do <label> que envolve o input', () => {
    const label = document.createElement('label');
    label.append('  Enviar  foto  ', fileInput());
    document.body.append(label);
    expect(fieldLabel(label.querySelector('input')!)).toBe('Enviar foto');
  });

  it('fica vazio quando não há rótulo', () => {
    expect(fieldLabel(fileInput())).toBe('');
  });
});
