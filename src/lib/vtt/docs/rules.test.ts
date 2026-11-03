import { describe, expect, it } from 'vitest';
import {
  buildTableFilePathname,
  canDeleteTableFile,
  clampPan,
  decodeText,
  downloadName,
  latestShownAt,
  newlyShownDocument,
  panForZoom,
  pdfRenderScale,
  sourceMimeForFile,
  tableFileUploadRules,
  titleFromFile,
  validateTableFile,
  viewerKindForMime,
  visibleDocuments,
  type TableDocument,
} from './rules';

const UUID = 'f0000000-0000-4000-8000-000000000001';

function doc(change: Partial<TableDocument>): TableDocument {
  return {
    id: UUID,
    table_id: UUID,
    category: 'carta',
    title: 'Carta',
    storage_key: 'documento/a.pdf',
    url: 'https://x/documento/a.pdf',
    mime: 'application/pdf',
    size_bytes: 1,
    status: 'approved',
    uploaded_by: 'gm',
    shown_at: null,
    created_at: '2026-01-01T00:00:00Z',
    profiles: null,
    ...change,
  };
}

describe('tipos de arquivo', () => {
  it('usa a extensão, porque o navegador dá tipo vazio para .md no Windows', () => {
    expect(sourceMimeForFile('notas.MD', 'relatorio')).toBe('text/markdown');
    expect(sourceMimeForFile('a.tar.pdf', 'documento')).toBe('application/pdf');
  });

  it('recusa vídeo e wav nos documentos, e imagem nos relatórios', () => {
    expect(sourceMimeForFile('a.mp4', 'documento')).toBeNull();
    expect(sourceMimeForFile('a.wav', 'documento')).toBeNull();
    expect(sourceMimeForFile('a.png', 'relatorio')).toBeNull();
    expect(sourceMimeForFile('sem-extensao', 'relatorio')).toBeNull();
    expect(sourceMimeForFile('a.constructor', 'relatorio')).toBeNull();
  });

  it('aplica o limite de cada formato', () => {
    const MB = 1024 * 1024;
    expect(validateTableFile({ name: 'a.pdf', size: 20 * MB }, 'documento')).toBeNull();
    expect(validateTableFile({ name: 'a.pdf', size: 20 * MB + 1 }, 'documento')).toMatch(/20 MB/);
    expect(validateTableFile({ name: 'a.docx', size: 10 * MB + 1 }, 'relatorio')).toMatch(/10 MB/);
    expect(validateTableFile({ name: 'a.mp3', size: 8 * MB + 1 }, 'documento')).toMatch(/8 MB/);
  });

  it('todo formato aceito tem visualizador', () => {
    for (const name of ['a.pdf', 'a.md', 'a.txt', 'a.docx']) {
      expect(viewerKindForMime(sourceMimeForFile(name, 'relatorio') as string)).not.toBeNull();
    }
    for (const name of ['a.png', 'a.mp3']) {
      expect(viewerKindForMime(sourceMimeForFile(name, 'documento') as string)).not.toBeNull();
    }
  });
});

describe('token de upload', () => {
  const base = {
    kind: 'documento' as const,
    role: 'player' as const,
    category: 'referencia',
    mime: 'application/pdf',
    pathname: buildTableFilePathname('documento', UUID, 'application/pdf'),
  };

  it('jogador só envia referência', () => {
    expect(tableFileUploadRules(base)).toMatchObject({
      allowedContentTypes: ['application/pdf'],
    });
    expect(tableFileUploadRules({ ...base, category: 'carta' })).toMatch(/permissão/);
    expect(tableFileUploadRules({ ...base, category: undefined })).toMatch(/permissão/);
  });

  it('mestra envia em qualquer categoria', () => {
    expect(typeof tableFileUploadRules({ ...base, role: 'gm', category: 'prova' })).toBe('object');
  });

  it('recusa caminho de outra pasta e formato fora da lista', () => {
    expect(tableFileUploadRules({ ...base, pathname: `mapa/${UUID}.pdf` })).toMatch(/Caminho/);
    expect(tableFileUploadRules({ ...base, pathname: `documento/../${UUID}.pdf` })).toMatch(/Caminho/);
    expect(tableFileUploadRules({ ...base, mime: 'text/html' })).toMatch(/Formato/);
    expect(tableFileUploadRules({ ...base, mime: 'image/svg+xml' })).toMatch(/Formato/);
  });

  it('relatório não tem categoria', () => {
    expect(
      typeof tableFileUploadRules({
        ...base,
        kind: 'relatorio',
        category: undefined,
        mime: 'text/plain',
        pathname: buildTableFilePathname('relatorio', UUID, 'text/plain'),
      })
    ).toBe('object');
  });
});

describe('Mostrar a todos', () => {
  const older = doc({ id: 'a', shown_at: '2026-01-01T10:00:00Z' });
  const newer = doc({ id: 'b', shown_at: '2026-01-01T11:00:00Z' });

  it('abre o que foi mostrado depois da última leitura, e o mais recente', () => {
    expect(newlyShownDocument([older, newer], latestShownAt([older]))?.id).toBe('b');
  });

  it('um aviso forjado não abre nada: o banco não mudou', () => {
    expect(newlyShownDocument([older, newer], latestShownAt([older, newer]))).toBeNull();
    expect(newlyShownDocument([doc({})], 0)).toBeNull();
  });

  it('a mesma pessoa pode mostrar de novo', () => {
    const baseline = latestShownAt([older]);
    const again = doc({ id: 'a', shown_at: '2026-01-01T12:00:00Z' });
    expect(newlyShownDocument([again], baseline)?.id).toBe('a');
  });
});

describe('listas e permissões', () => {
  it('filtra por categoria e esconde pendente de quem não enviou', () => {
    const list = [
      doc({ id: 'a' }),
      doc({ id: 'b', category: 'referencia', status: 'pending', uploaded_by: 'p1' }),
    ];
    expect(visibleDocuments(list, null, 'p2').map((d) => d.id)).toEqual(['a']);
    expect(visibleDocuments(list, null, 'p1').map((d) => d.id)).toEqual(['a', 'b']);
    expect(visibleDocuments(list, 'referencia', 'p1').map((d) => d.id)).toEqual(['b']);
  });

  it('mestra apaga tudo, jogador só o próprio', () => {
    expect(canDeleteTableFile('p2', 'gm', true)).toBe(true);
    expect(canDeleteTableFile('p1', 'p1', false)).toBe(true);
    expect(canDeleteTableFile('p2', 'p1', false)).toBe(false);
    expect(canDeleteTableFile(null, 'p1', false)).toBe(false);
  });

  it('nome de arquivo sem caracteres proibidos', () => {
    expect(downloadName('Carta: 1/2', 'application/pdf')).toBe('Carta_ 1_2.pdf');
    expect(titleFromFile('relato.final.docx')).toBe('relato.final');
    expect(titleFromFile('.docx')).toBe('Sem título');
  });
});

describe('leitura de texto', () => {
  it('aceita UTF-8 e cai para Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('ação'))).toBe('ação');
    expect(decodeText(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe('ação');
  });
});

describe('zoom', () => {
  it('centraliza o que cabe e não deixa sobra no que não cabe', () => {
    expect(clampPan(50, 100, 300)).toBe(100);
    expect(clampPan(50, 500, 300)).toBe(0);
    expect(clampPan(-999, 500, 300)).toBe(-200);
  });

  it('mantém o ponto sob o dedo no lugar', () => {
    const next = panForZoom(-50, 100, 1, 2);
    expect((100 - next) / 2).toBe(150);
  });

  it('o canvas do PDF respeita o teto de pixels', () => {
    expect(pdfRenderScale(1, 2, 600, 800, 100_000_000)).toBe(3);
    const scale = pdfRenderScale(4, 2, 600, 800, 12_000_000);
    expect(600 * scale * 800 * scale).toBeCloseTo(12_000_000);
  });
});
