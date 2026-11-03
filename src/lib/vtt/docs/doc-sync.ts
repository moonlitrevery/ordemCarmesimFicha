import type { SupabaseClient } from '@supabase/supabase-js';
import { whenIdle } from '../library-sync';
import type { TableChannel } from '../realtime';
import { useVttStore } from '../store';
import {
  latestShownAt,
  newlyShownDocument,
  type TableDocument,
  type TableReport,
  type ViewerTarget,
} from './rules';

const REFRESH_DELAY_MS = 200;
// Só metadados: o arquivo em si só baixa ao abrir.
const COLUMNS = '*, profiles(display_name)';

function store() {
  return useVttStore.getState();
}

/**
 * Listas de documentos e relatórios. Não dependem de cena nem de sessão.
 * Carrega cedo porque a mestra precisa do contador de aprovações e todos precisam
 * saber o que já foi mostrado: `doc:show` só abre o que o banco confirmar como novo.
 */
export class DocSync {
  private cleanup: (() => void)[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private ticket = 0;
  private stopped = false;
  private shownBaseline: number | null = null;
  private knownPending: Set<string> | null = null;

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private tableId: string,
    private isGm: boolean
  ) {}

  start() {
    this.cleanup.push(
      whenIdle(() => void this.load(false)),
      this.channel.on('doc:refresh', () => this.scheduleRefresh()),
      this.channel.on('doc:show', () => this.scheduleRefresh())
    );
    if (this.isGm) {
      this.cleanup.push(
        this.channel.on('asset:pending', () => this.scheduleRefresh())
      );
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    this.cleanup.forEach((remove) => remove());
    this.cleanup = [];
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.load(true), REFRESH_DELAY_MS);
  }

  /** `announce` falso (entrada, reconexão): atualiza sem abrir o que ficou para trás. */
  async load(announce: boolean) {
    const ticket = ++this.ticket;
    const [documents, reports] = await Promise.all([
      this.supabase
        .from('table_documents')
        .select(COLUMNS)
        .eq('table_id', this.tableId)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('table_reports')
        .select(COLUMNS)
        .eq('table_id', this.tableId)
        .order('created_at', { ascending: false }),
    ]);
    if (this.stopped || ticket !== this.ticket) return;

    if (documents.error || reports.error) {
      // Falha ao atualizar não apaga a lista que já está na tela.
      useVttStore.setState({
        docsError: 'Não foi possível carregar. Confira se a migração 021 já rodou.',
      });
      return;
    }

    const nextDocuments = (documents.data ?? []) as unknown as TableDocument[];
    const nextReports = (reports.data ?? []) as unknown as TableReport[];
    useVttStore.setState({
      documents: nextDocuments,
      reports: nextReports,
      docsError: null,
    });
    this.closeViewerIfDeleted(nextDocuments, nextReports);
    if (announce) this.announce(nextDocuments);
    this.shownBaseline = Math.max(
      this.shownBaseline ?? 0,
      latestShownAt(nextDocuments)
    );
    this.knownPending = new Set(
      nextDocuments.filter((doc) => doc.status === 'pending').map((doc) => doc.id)
    );
  }

  private announce(documents: TableDocument[]) {
    if (this.shownBaseline !== null) {
      const shown = newlyShownDocument(documents, this.shownBaseline);
      if (shown) this.open(shown);
    }
    // Só avisa se o banco confirma item novo: o broadcast pode ser forjado.
    if (
      this.isGm &&
      this.knownPending &&
      documents.some((doc) => doc.status === 'pending' && !this.knownPending?.has(doc.id))
    ) {
      store().showToast('Novo arquivo aguardando aprovação');
    }
  }

  private closeViewerIfDeleted(documents: TableDocument[], reports: TableReport[]) {
    const open = store().docViewer;
    if (
      open &&
      !documents.some((doc) => doc.id === open.id) &&
      !reports.some((report) => report.id === open.id)
    ) {
      useVttStore.setState({ docViewer: null });
    }
  }

  open(target: ViewerTarget) {
    useVttStore.setState({
      docViewer: {
        id: target.id,
        title: target.title,
        url: target.url,
        mime: target.mime,
      },
    });
  }

  /** Depois de enviar: pendente só interessa à mestra. */
  notifyUploaded(pending: boolean) {
    this.channel.emit(pending ? { type: 'asset:pending' } : { type: 'doc:refresh' });
    void this.load(false);
  }

  notifyDeleted() {
    this.channel.emit({ type: 'doc:refresh' });
    void this.load(false);
  }

  async approve(id: string) {
    const { error } = await this.supabase
      .from('table_documents')
      .update({ status: 'approved' })
      .eq('id', id);
    if (error) throw new Error('Não foi possível aprovar. Tente de novo.');
    this.notifyDeleted();
  }

  /** O carimbo vai para o banco antes do aviso: é ele que os outros conferem. */
  async showToAll(document: TableDocument) {
    const shownAt = new Date(
      Math.max(Date.now(), (this.shownBaseline ?? 0) + 1)
    ).toISOString();
    const { error } = await this.supabase
      .from('table_documents')
      .update({ shown_at: shownAt })
      .eq('id', document.id);
    if (error) {
      store().showToast('Não foi possível mostrar a todos. Tente de novo.');
      return;
    }
    this.shownBaseline = Date.parse(shownAt);
    this.channel.emit({ type: 'doc:show' });
    this.open(document);
    store().showToast('Aberto na tela de todos');
  }
}
