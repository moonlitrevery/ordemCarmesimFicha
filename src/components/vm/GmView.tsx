'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/vtt/ConfirmDialog';
import { fetchGroups, type VmGroup, type VmMember, type VmPickOption, type VmSection } from '@/lib/vm/data';
import { moveInList } from '@/lib/vm/card';
import { CharacterCard, NpcCard, type CardActions } from './VmCard';
import { MemberPicker } from './MemberPicker';
import { GroupNameModal } from './VmModal';
import { useVmGroup } from './useVmGroup';

const LAST_GROUP_KEY = 'vm:last-group';

function readLastGroup(): string | null {
  try {
    return window.localStorage.getItem(LAST_GROUP_KEY);
  } catch {
    return null;
  }
}

function writeLastGroup(id: string | null) {
  try {
    if (id) window.localStorage.setItem(LAST_GROUP_KEY, id);
    else window.localStorage.removeItem(LAST_GROUP_KEY);
  } catch {
    // Modo privado ou cota cheia: só não lembra.
  }
}

function bySortOrder<T extends { sort_order: number }>(a: T, b: T) {
  return a.sort_order - b.sort_order;
}

type Modal =
  | { kind: 'create' }
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'pick'; section: VmSection }
  | null;

export function GmView({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<VmGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { supabase, data, setData, error: groupError, loading, reload } = useVmGroup(selectedId);
  const closeModal = useCallback(() => setModal(null), []);

  const fail = useCallback((message: string, err: unknown) => {
    console.error('V.M.:', message, err);
    setNotice(message);
  }, []);

  useEffect(() => {
    let active = true;
    fetchGroups(supabase).then(
      (list) => {
        if (!active) return;
        setGroups(list);
        const last = readLastGroup();
        setSelectedId(list.find((g) => g.id === last)?.id ?? list[0]?.id ?? null);
      },
      (err) => {
        console.error('V.M.: falha ao listar grupos', err);
        if (active) setGroupsError('Não foi possível carregar os grupos.');
      }
    );
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (groups) writeLastGroup(selectedId);
  }, [groups, selectedId]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const selected = groups?.find((g) => g.id === selectedId) ?? null;

  // ---------- grupos ----------

  async function createGroup(name: string) {
    setBusy(true);
    const sort_order = (groups ?? []).reduce((max, g) => Math.max(max, g.sort_order + 1), 0);
    const { data: row, error } = await supabase
      .from('gm_groups')
      .insert({ name, sort_order })
      .select('id, name, sort_order')
      .single();
    setBusy(false);
    if (error || !row) return fail('Não foi possível criar o grupo.', error);
    setGroups((list) => [...(list ?? []), row as VmGroup]);
    setSelectedId((row as VmGroup).id);
    setModal(null);
  }

  async function renameGroup(name: string) {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from('gm_groups').update({ name }).eq('id', selected.id);
    setBusy(false);
    if (error) return fail('Não foi possível renomear o grupo.', error);
    setGroups((list) => (list ?? []).map((g) => (g.id === selected.id ? { ...g, name } : g)));
    setModal(null);
  }

  async function deleteGroup() {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from('gm_groups').delete().eq('id', selected.id);
    setBusy(false);
    if (error) return fail('Não foi possível apagar o grupo.', error);
    const rest = (groups ?? []).filter((g) => g.id !== selected.id);
    setGroups(rest);
    setSelectedId(rest[0]?.id ?? null);
    setModal(null);
  }

  async function moveGroup(dir: -1 | 1) {
    if (!groups || !selected) return;
    const moved = moveInList(groups, selected.id, dir);
    if (!moved) return;
    setGroups(moved.next);
    const results = await Promise.all(
      moved.changed.map((g) => supabase.from('gm_groups').update({ sort_order: g.sort_order }).eq('id', g.id))
    );
    const error = results.find((r) => r.error)?.error;
    if (error) {
      fail('Não foi possível reordenar os grupos.', error);
      setGroups(groups);
    }
  }

  // ---------- membros ----------

  const sections = useMemo(() => {
    const members = (data?.members ?? []).slice().sort(bySortOrder);
    return {
      pj: members.filter((m) => m.section === 'pj'),
      npc: members.filter((m) => m.section === 'npc'),
    };
  }, [data?.members]);

  // As ações leem o estado mais recente por ref: os callbacks ficam estáveis e o memo dos cards vale.
  const membersRef = useRef<VmMember[]>([]);
  membersRef.current = data?.members ?? [];

  const moveMember = useCallback(
    async (memberId: string, dir: -1 | 1) => {
      const all = membersRef.current;
      const member = all.find((m) => m.id === memberId);
      if (!member) return;
      const list = all.filter((m) => m.section === member.section).sort(bySortOrder);
      const moved = moveInList(list, memberId, dir);
      if (!moved) return;
      const byId = new Map(moved.next.map((m) => [m.id, m]));
      setData((d) => (d ? { ...d, members: d.members.map((m) => byId.get(m.id) ?? m) } : d));
      const results = await Promise.all(
        moved.changed.map((m) =>
          supabase.from('gm_group_members').update({ sort_order: m.sort_order }).eq('id', m.id)
        )
      );
      const error = results.find((r) => r.error)?.error;
      if (error) {
        fail('Não foi possível reordenar.', error);
        void reload();
      }
    },
    [supabase, setData, fail, reload]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      setData((d) => (d ? { ...d, members: d.members.filter((m) => m.id !== memberId) } : d));
      const { error } = await supabase.from('gm_group_members').delete().eq('id', memberId);
      if (error) {
        fail('Não foi possível tirar do grupo.', error);
        void reload();
      }
    },
    [supabase, setData, fail, reload]
  );

  const actions = useMemo<CardActions>(
    () => ({ move: (id, dir) => void moveMember(id, dir), remove: (id) => void removeMember(id) }),
    [moveMember, removeMember]
  );

  async function addMember(section: VmSection, option: VmPickOption) {
    if (!selected) return;
    const list = section === 'pj' ? sections.pj : sections.npc;
    const sort_order = list.reduce((max, m) => Math.max(max, m.sort_order + 1), 0);
    const { error } = await supabase.from('gm_group_members').insert({
      group_id: selected.id,
      section,
      character_id: option.kind === 'character' ? option.id : null,
      npc_id: option.kind === 'npc' ? option.id : null,
      sort_order,
    });
    if (error) return fail('Não foi possível adicionar.', error);
    // Relê para trazer a ficha completa e reassinar o realtime com o novo id.
    await reload();
  }

  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const m of data?.members ?? []) {
      if (m.character_id) set.add(`character:${m.character_id}`);
      if (m.npc_id) set.add(`npc:${m.npc_id}`);
    }
    return set;
  }, [data?.members]);

  // ---------- render ----------

  if (groupsError) {
    return <p className="panel p-6 text-center text-crimson-soft">{groupsError}</p>;
  }
  if (!groups) {
    return <p className="py-16 text-center text-ink-muted">Carregando…</p>;
  }

  const groupIndex = selected ? groups.indexOf(selected) : -1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-parchment">Visão da Mestra</h1>
          <p className="mt-1 text-sm text-ink-muted">Os personagens de cada grupo, atualizando em tempo real.</p>
        </div>
        {groups.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => setModal({ kind: 'create' })}>
            + Novo grupo
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-crimson/50 bg-crimson/10 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button type="button" className="text-ink-muted hover:text-parchment" onClick={() => setNotice(null)} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-ink-muted">Nenhum grupo ainda. Monte um grupo para acompanhar os personagens da sessão.</p>
          <button type="button" className="btn-primary" onClick={() => setModal({ kind: 'create' })}>
            Criar primeiro grupo
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-ink-border">
            <div role="tablist" aria-label="Grupos" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {groups.map((g) => {
                const active = g.id === selectedId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(g.id)}
                    className={
                      '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-base transition ' +
                      (active
                        ? 'border-crimson text-parchment'
                        : 'border-transparent text-ink-muted hover:text-parchment')
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            {selected && (
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`Opções do grupo ${selected.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-xl text-ink-muted hover:bg-ink-raised hover:text-parchment"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋯
                </button>
                {menuOpen && (
                  <div role="menu" className="panel absolute right-0 top-full z-30 mt-1 w-52 bg-ink-panel/95 py-1 text-sm">
                    {[
                      { label: 'Renomear', run: () => setModal({ kind: 'rename' }) },
                      { label: 'Mover para a esquerda', run: () => void moveGroup(-1), disabled: groupIndex <= 0 },
                      {
                        label: 'Mover para a direita',
                        run: () => void moveGroup(1),
                        disabled: groupIndex >= groups.length - 1,
                      },
                      { label: 'Apagar grupo', run: () => setModal({ kind: 'delete' }), danger: true },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        className={
                          'block w-full px-3 py-2 text-left hover:bg-ink-raised disabled:opacity-40 disabled:hover:bg-transparent ' +
                          (item.danger ? 'text-crimson-soft' : 'text-parchment')
                        }
                        onClick={() => {
                          setMenuOpen(false);
                          item.run();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {groupError ? (
            <div className="panel flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-crimson-soft">{groupError}</p>
              <button type="button" className="btn-ghost" onClick={() => void reload()}>
                Tentar de novo
              </button>
            </div>
          ) : !data ? (
            <p className="py-16 text-center text-ink-muted">{loading ? 'Carregando…' : ''}</p>
          ) : (
            (['pj', 'npc'] as const).map((section) => {
              const list = sections[section];
              return (
                <section key={section} className="space-y-3" aria-labelledby={`vm-${section}`}>
                  <div className="flex items-center gap-3">
                    <h2 id={`vm-${section}`} className="section-title shrink-0">
                      {section === 'pj' ? 'PJs' : 'NPCs'}
                    </h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-crimson/60 to-transparent" />
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2.5 py-1 text-sm"
                      onClick={() => setModal({ kind: 'pick', section })}
                    >
                      {section === 'pj' ? '+ Adicionar PJ' : '+ Adicionar NPC'}
                    </button>
                  </div>
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-border px-4 py-8 text-center text-sm text-ink-muted">
                      {section === 'pj' ? 'Nenhum PJ neste grupo.' : 'Nenhum NPC neste grupo.'}
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((m, index) => {
                        // Props planas: o memo do card compara uma a uma.
                        const placement = {
                          memberId: m.id,
                          first: index === 0,
                          last: index === list.length - 1,
                          actions,
                        };
                        if (m.character_id) {
                          const c = data.characters[m.character_id];
                          return c ? (
                            <CharacterCard key={m.id} character={c} asNpc={section === 'npc'} {...placement} />
                          ) : null;
                        }
                        const n = m.npc_id ? data.npcs[m.npc_id] : undefined;
                        return n ? <NpcCard key={m.id} npc={n} {...placement} /> : null;
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </>
      )}

      {modal?.kind === 'create' && (
        <GroupNameModal
          title="Novo grupo"
          confirmLabel="Criar"
          busy={busy}
          onSubmit={(name) => void createGroup(name)}
          onClose={closeModal}
        />
      )}
      {modal?.kind === 'rename' && selected && (
        <GroupNameModal
          title="Renomear grupo"
          initial={selected.name}
          confirmLabel="Salvar"
          busy={busy}
          onSubmit={(name) => void renameGroup(name)}
          onClose={closeModal}
        />
      )}
      {modal?.kind === 'delete' && selected && (
        <ConfirmDialog
          title="Apagar grupo?"
          confirmLabel="Apagar"
          danger
          busy={busy}
          onConfirm={() => void deleteGroup()}
          onCancel={closeModal}
        >
          O grupo <strong className="text-parchment">{selected.name}</strong> some da V.M. Nenhuma ficha nem NPC é apagado.
        </ConfirmDialog>
      )}
      {modal?.kind === 'pick' && (
        <MemberPicker
          supabase={supabase}
          userId={userId}
          section={modal.section}
          taken={taken}
          onPick={(option) => addMember(modal.section, option)}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
