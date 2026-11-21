'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Archive, FolderPlus, Layers, Plus, Search, X } from 'lucide-react';
import type { Asset } from '@/lib/vtt/assets/rules';
import { assetsOfKind } from '@/lib/vtt/assets/static';
import {
  canRemovePage,
  folderCounts,
  folderList,
  MAX_FOLDER_NAME,
  reorderPages,
  uniqueFolderName,
  visiblePages,
  type PagesView,
} from '@/lib/vtt/pages';
import { useVttStore } from '@/lib/vtt/store';
import { isTypingTarget } from '@/lib/vtt/ui-prefs';
import { ConfirmDialog } from '../ConfirmDialog';
import { FLOATING_PANEL, IconButton, useDismiss } from '../hud';
import { CreatePageModal } from './CreatePageModal';
import { dragKindOf, FolderCard, PAGE_DRAG_TYPE, PageCard, RIBBON_DRAG_TYPE, type DragKind } from './PageCard';
import { PageSettingsModal } from './PageSettingsModal';

type Modal =
  | { kind: 'create' }
  | { kind: 'settings'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'deleteFolder'; name: string };

interface Menu {
  id: string;
  x: number;
  y: number;
}

const MENU_ITEM =
  'flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm text-parchment hover:bg-ink-raised disabled:cursor-not-allowed disabled:text-ink-muted/60 desk:min-h-8';

function sameView(a: PagesView, b: PagesView): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'folder' || (b.kind === 'folder' && a.name === b.name);
}

/** Menu do card: ⋯ ou clique direito. Fica dentro da tela. */
function PageMenu({
  menu,
  folders,
  hasParty,
  archived,
  onClose,
  onAction,
}: {
  menu: Menu;
  folders: string[];
  hasParty: boolean;
  archived: boolean;
  onClose: () => void;
  onAction: (action: string, folder?: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showFolders, setShowFolders] = useState(false);
  useDismiss(ref, true, onClose);
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 232));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 340));
  const blocked = hasParty ? 'Os jogadores estão nesta página: mova a fita antes.' : undefined;

  const item = (action: string, label: string, disabled = false, title?: string) => (
    <button
      type="button"
      role="menuitem"
      className={MENU_ITEM}
      disabled={disabled}
      title={title}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      className={FLOATING_PANEL + ' fixed z-20 w-56 rounded-xl p-1'}
      style={{ left, top }}
    >
      {item('party', 'Mover jogadores para cá', hasParty, hasParty ? 'Os jogadores já estão aqui' : undefined)}
      {item('settings', 'Configurações')}
      {item('rename', 'Renomear')}
      {item('duplicate', 'Duplicar')}
      <button
        type="button"
        role="menuitem"
        aria-expanded={showFolders}
        className={MENU_ITEM}
        onClick={() => setShowFolders((value) => !value)}
      >
        Mover para pasta ▸
      </button>
      {showFolders && (
        <div className="ml-2 max-h-40 overflow-y-auto border-l border-ink-border pl-1">
          <button type="button" className={MENU_ITEM} onClick={() => onAction('folder', '')}>
            Sem pasta
          </button>
          {folders.map((folder) => (
            <button key={folder} type="button" className={MENU_ITEM} onClick={() => onAction('folder', folder)}>
              <span className="truncate">{folder}</span>
            </button>
          ))}
        </div>
      )}
      {archived
        ? item('unarchive', 'Desarquivar')
        : item('archive', 'Arquivar', hasParty, blocked)}
      {item('delete', 'Apagar', hasParty, blocked)}
    </div>
  );
}

function SidebarEntry({
  active,
  icon,
  label,
  count,
  dropHighlight,
  onClick,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  count: number;
  dropHighlight: boolean;
  onClick: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <li onDragOver={onDragOver} onDrop={onDrop} className="shrink-0">
      <button
        type="button"
        aria-current={active}
        onClick={onClick}
        className={
          'flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md border px-2 text-left text-sm desk:min-h-8 ' +
          (dropHighlight
            ? 'border-amber-400 bg-amber-400/10 '
            : active
              ? 'border-crimson/60 bg-crimson/20 text-parchment '
              : 'border-transparent text-ink-muted hover:bg-ink-raised hover:text-parchment ')
        }
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">{count}</span>
      </button>
    </li>
  );
}

/**
 * Páginas (Fase 12), como no Roll20. Clicar num card leva só a mestra; a fita
 * amarela marca onde os jogadores estão, e arrastá-la move todos.
 */
export function PagesOverlay() {
  const scenes = useVttStore((s) => s.scenes);
  const library = useVttStore((s) => s.library);
  const storedFolders = useVttStore((s) => s.pageFolders);
  const partySceneId = useVttStore((s) => s.table?.default_scene_id ?? null);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const sync = useVttStore((s) => s.sync);

  const [view, setView] = useState<PagesView>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ kind: DragKind; id: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const close = useCallback(() => useVttStore.setState({ pagesOpen: false }), []);

  // Pastas e calibrações dos mapas: relê a cada abertura (duas consultas leves).
  useEffect(() => {
    void sync?.loadPagesMeta();
  }, [sync]);

  // Esc fecha o que estiver por cima: menu, modal, e só então o overlay.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTypingTarget(event.target)) return;
      if (menu) setMenu(null);
      else if (modal) setModal(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, modal, close]);

  const maps = useMemo(() => assetsOfKind(library ?? [], 'mapa'), [library]);
  const mapById = useMemo(() => new Map<string, Asset>(maps.map((map) => [map.id, map])), [maps]);
  const folders = useMemo(() => folderList(storedFolders, scenes), [storedFolders, scenes]);
  const counts = useMemo(() => folderCounts(scenes), [scenes]);
  const shown = useMemo(() => visiblePages(scenes, view, query), [scenes, view, query]);
  const activeCount = scenes.filter((scene) => !scene.archived).length;
  const archivedCount = scenes.length - activeCount;
  const showFolderCards = view.kind === 'all' && !query.trim();

  // A pasta aberta foi apagada ou renomeada: volta para "Todas".
  useEffect(() => {
    if (view.kind === 'folder' && !folders.includes(view.name) && folderDraft === null) {
      setView({ kind: 'all' });
    }
  }, [folders, view, folderDraft]);

  // ---------- Ações ----------

  function openPage(id: string) {
    useVttStore.setState({ gmSceneChoice: id });
    close();
  }

  async function onMenuAction(action: string, folder?: string) {
    const id = menu?.id;
    setMenu(null);
    if (!id || !sync) return;
    switch (action) {
      case 'party':
        await sync.movePartyTo(id);
        break;
      case 'settings':
        setModal({ kind: 'settings', id });
        break;
      case 'rename':
        setRenamingId(id);
        break;
      case 'duplicate':
        await sync.duplicateScene(id);
        break;
      case 'folder':
        await sync.moveToFolder(id, folder ?? '');
        break;
      case 'archive':
        await sync.setArchived(id, true);
        break;
      case 'unarchive':
        await sync.setArchived(id, false);
        break;
      case 'delete':
        setModal({ kind: 'delete', id });
        break;
    }
  }

  const onRename = useCallback(
    (id: string, name: string) => {
      setRenamingId(null);
      const scene = useVttStore.getState().scenes.find((item) => item.id === id);
      if (scene && scene.name !== name) void sync?.updateScene(id, { name });
    },
    [sync]
  );
  const cancelRename = useCallback(() => setRenamingId(null), []);
  const onMenu = useCallback((id: string, x: number, y: number) => setMenu({ id, x, y }), []);

  async function newFolder() {
    const name = uniqueFolderName(folders);
    if (await sync?.createFolder(name)) {
      setView({ kind: 'folder', name });
      setFolderDraft(name);
    }
  }

  async function saveFolderName(from: string) {
    const to = (folderDraft ?? '').trim();
    setFolderDraft(null);
    if (!to || to === from) return;
    if (await sync?.renameFolder(from, to)) setView({ kind: 'folder', name: to });
  }

  // ---------- Arrastar ----------

  const onDragStartPage = useCallback((id: string, event: DragEvent) => {
    event.dataTransfer.setData(PAGE_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'page', id });
  }, []);

  const onDragStartRibbon = useCallback((event: DragEvent) => {
    event.dataTransfer.setData(RIBBON_DRAG_TYPE, '1');
    event.dataTransfer.effectAllowed = 'move';
    setDrag({ kind: 'ribbon', id: null });
  }, []);

  const onDragEnd = useCallback(() => {
    setDrag(null);
    setDropTarget(null);
  }, []);

  /** Aceita só os tipos que `kinds` quer; marca o alvo para o destaque. */
  const acceptDrop = useCallback((target: string, kinds: DragKind[], event: DragEvent) => {
    const kind = dragKindOf(event);
    if (!kind || !kinds.includes(kind)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget((current) => (current === target ? current : target));
  }, []);

  const onDragOverCard = useCallback(
    (id: string, event: DragEvent) => acceptDrop(`page:${id}`, ['page', 'ribbon'], event),
    [acceptDrop]
  );

  const onDropCard = useCallback(
    (targetId: string, event: DragEvent) => {
      event.preventDefault();
      const kind = dragKindOf(event);
      const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE);
      setDrag(null);
      setDropTarget(null);
      if (!sync) return;
      if (kind === 'ribbon') {
        if (targetId !== useVttStore.getState().table?.default_scene_id) void sync.movePartyTo(targetId);
        return;
      }
      if (kind !== 'page' || !draggedId) return;
      const all = useVttStore.getState().scenes;
      const target = all.find((scene) => scene.id === targetId);
      const dragged = all.find((scene) => scene.id === draggedId);
      if (!target || !dragged) return;
      // Soltar sobre uma página de outra pasta (na busca) leva para a pasta dela.
      if (dragged.folder !== target.folder) void sync.moveToFolder(dragged.id, target.folder);
      const next = reorderPages(all, draggedId, targetId);
      if (next) void sync.reorderScenes(next);
    },
    [sync]
  );

  function dropOnFolder(folder: string | 'archived', event: DragEvent) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE);
    setDrag(null);
    setDropTarget(null);
    if (!draggedId || !sync) return;
    if (folder === 'archived') {
      void sync.setArchived(draggedId, true);
      return;
    }
    const dragged = useVttStore.getState().scenes.find((scene) => scene.id === draggedId);
    if (dragged?.archived) void sync.setArchived(draggedId, false);
    void sync.moveToFolder(draggedId, folder);
  }

  // ---------- Tela ----------

  const menuScene = menu ? scenes.find((scene) => scene.id === menu.id) : undefined;
  const deleting = modal?.kind === 'delete' ? scenes.find((scene) => scene.id === modal.id) : undefined;
  const currentFolder = view.kind === 'folder' ? view.name : '';

  return (
    <div
      className="fixed inset-0 z-50 flex bg-ink/60 p-0 desk:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Páginas"
        className={FLOATING_PANEL + ' relative flex min-h-0 w-full flex-col overflow-hidden desk:rounded-2xl'}
      >
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-border px-3 py-2">
          <h2 className="font-display text-2xl text-parchment">Páginas</h2>
          <label className="relative order-last w-full desk:order-none desk:ml-4 desk:w-72">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              className="field min-h-11 py-1 pl-7 pr-2 text-sm desk:min-h-8"
              placeholder="Buscar página"
              aria-label="Buscar página"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn-primary min-h-11 px-3 py-1 text-sm desk:min-h-8"
              onClick={() => setModal({ kind: 'create' })}
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={14} aria-hidden />
                Criar página
              </span>
            </button>
            <IconButton icon={X} label="Fechar (Esc)" tooltip="left" onClick={close} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col desk:flex-row">
          <nav aria-label="Pastas" className="shrink-0 border-b border-ink-border p-2 desk:w-56 desk:border-b-0 desk:border-r">
            <ul className="flex gap-1 overflow-x-auto desk:flex-col desk:overflow-x-visible">
              <SidebarEntry
                active={view.kind === 'all'}
                icon={<Layers size={14} aria-hidden />}
                label="Todas"
                count={activeCount}
                dropHighlight={dropTarget === 'folder:'}
                onClick={() => setView({ kind: 'all' })}
                onDragOver={(event) => acceptDrop('folder:', ['page'], event)}
                onDrop={(event) => dropOnFolder('', event)}
              />
              {folders.map((folder) => (
                <SidebarEntry
                  key={folder}
                  active={sameView(view, { kind: 'folder', name: folder })}
                  label={folder}
                  count={counts.get(folder) ?? 0}
                  dropHighlight={dropTarget === `folder:${folder}`}
                  onClick={() => setView({ kind: 'folder', name: folder })}
                  onDragOver={(event) => acceptDrop(`folder:${folder}`, ['page'], event)}
                  onDrop={(event) => dropOnFolder(folder, event)}
                />
              ))}
              <li className="shrink-0">
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md px-2 text-left text-sm text-ink-muted hover:bg-ink-raised hover:text-parchment desk:min-h-8"
                  onClick={() => void newFolder()}
                >
                  <FolderPlus size={14} aria-hidden />
                  Nova pasta
                </button>
              </li>
              <li className="shrink-0 desk:mt-2 desk:border-t desk:border-ink-border desk:pt-2">
                <SidebarEntry
                  active={view.kind === 'archived'}
                  icon={<Archive size={14} aria-hidden />}
                  label="Arquivadas"
                  count={archivedCount}
                  dropHighlight={dropTarget === 'archived'}
                  onClick={() => setView({ kind: 'archived' })}
                  onDragOver={(event) => {
                    // A página da fita não vai para o arquivo.
                    if (drag?.id && !canRemovePage(drag.id, partySceneId)) return;
                    acceptDrop('archived', ['page'], event);
                  }}
                  onDrop={(event) => dropOnFolder('archived', event)}
                />
              </li>
            </ul>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {view.kind === 'folder' && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {folderDraft !== null ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveFolderName(view.name);
                    }}
                  >
                    <input
                      className="field min-h-11 px-2 py-1 text-sm desk:min-h-8"
                      aria-label="Nome da pasta"
                      autoFocus
                      maxLength={MAX_FOLDER_NAME}
                      value={folderDraft}
                      onChange={(e) => setFolderDraft(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setFolderDraft(null);
                      }}
                    />
                    <button type="submit" className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-8">
                      Salvar
                    </button>
                  </form>
                ) : (
                  <>
                    <h3 className="font-display text-xl text-parchment">{view.name}</h3>
                    <button
                      type="button"
                      className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-0"
                      onClick={() => setFolderDraft(view.name)}
                    >
                      Renomear pasta
                    </button>
                    <button
                      type="button"
                      className="btn-ghost min-h-11 px-2 py-1 text-xs text-crimson-soft desk:min-h-0"
                      onClick={() => setModal({ kind: 'deleteFolder', name: view.name })}
                    >
                      Apagar pasta
                    </button>
                  </>
                )}
              </div>
            )}

            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
              {showFolderCards &&
                folders.map((folder) => (
                  <FolderCard
                    key={`folder-${folder}`}
                    name={folder}
                    count={counts.get(folder) ?? 0}
                    dropHighlight={dropTarget === `card-folder:${folder}`}
                    onOpen={() => setView({ kind: 'folder', name: folder })}
                    onDragOver={(event) => acceptDrop(`card-folder:${folder}`, ['page'], event)}
                    onDrop={(event) => dropOnFolder(folder, event)}
                  />
                ))}
              {shown.map((scene) => (
                <PageCard
                  key={scene.id}
                  scene={scene}
                  map={scene.map_asset_id ? (mapById.get(scene.map_asset_id) ?? null) : null}
                  hasParty={scene.id === partySceneId}
                  isViewing={scene.id === viewedSceneId}
                  renaming={renamingId === scene.id}
                  dropHighlight={dropTarget === `page:${scene.id}`}
                  onOpen={openPage}
                  onMenu={onMenu}
                  onRename={onRename}
                  onCancelRename={cancelRename}
                  onDragStartPage={onDragStartPage}
                  onDragStartRibbon={onDragStartRibbon}
                  onDragEnd={onDragEnd}
                  onDragOverCard={onDragOverCard}
                  onDropCard={onDropCard}
                />
              ))}
            </ul>

            {shown.length === 0 && !(showFolderCards && folders.length > 0) && (
              <p className="mt-8 text-center text-sm text-ink-muted">
                {query.trim()
                  ? 'Nenhuma página com esse nome.'
                  : view.kind === 'archived'
                    ? 'Nada arquivado. Use "Arquivar" no menu ⋯ de uma página para tirá-la da grade sem apagar.'
                    : view.kind === 'folder'
                      ? 'Pasta vazia. Arraste páginas para cá, ou use "Mover para pasta" no menu ⋯ de uma página.'
                      : 'Nenhuma página ainda. Clique em "Criar página", no topo.'}
              </p>
            )}
            {drag?.kind === 'ribbon' && (
              <p className="mt-3 text-center text-xs text-amber-300">
                Solte a fita na página para onde todos os jogadores vão.
              </p>
            )}
          </div>
        </div>

        {menu && menuScene && (
          <PageMenu
            menu={menu}
            folders={folders}
            hasParty={menuScene.id === partySceneId}
            archived={menuScene.archived}
            onClose={() => setMenu(null)}
            onAction={(action, folder) => void onMenuAction(action, folder)}
          />
        )}

        {modal?.kind === 'create' && (
          <CreatePageModal
            maps={maps}
            loadingMaps={library === null}
            folders={folders}
            initialFolder={currentFolder}
            onClose={() => setModal(null)}
            onCreated={close}
          />
        )}
        {modal?.kind === 'settings' && (
          <PageSettingsModal
            sceneId={modal.id}
            maps={maps}
            loadingMaps={library === null}
            folders={folders}
            onClose={() => setModal(null)}
            onMeasure={(id) => {
              useVttStore.setState({ gmSceneChoice: id });
              useVttStore.getState().startCalibration();
              close();
            }}
          />
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Apagar "${deleting.name}"?`}
          confirmLabel="Apagar"
          danger
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            void sync?.deleteScene(deleting.id);
          }}
        >
          A página, os objetos e os desenhos dela somem de vez. Para só tirar da grade, use
          Arquivar.
        </ConfirmDialog>
      )}
      {modal?.kind === 'deleteFolder' && (
        <ConfirmDialog
          title={`Apagar a pasta "${modal.name}"?`}
          confirmLabel="Apagar pasta"
          danger
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const name = modal.name;
            setModal(null);
            setView({ kind: 'all' });
            void sync?.deleteFolder(name);
          }}
        >
          Nenhuma página é apagada: as {counts.get(modal.name) ?? 0} página(s) dela voltam para
          Todas.
        </ConfirmDialog>
      )}
    </div>
  );
}
