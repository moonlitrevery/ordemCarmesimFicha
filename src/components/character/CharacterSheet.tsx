'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Supabase fora do primeiro carregamento: só é usado depois de montar.
import { loadSupabase } from '@/lib/supabase/lazy';
import dynamic from 'next/dynamic';
import {
  computeDerivedMaxes,
  getAttributeModifier,
  getEffectiveMaxes,
  getAttributePointsAvailable,
  getCarryLimit,
  getInventoryWeight,
  getSkillUpgradesAvailable,
  getUpgradeKeyForNext,
  getTotalLevel,
  normalizeSkillUpgradeSpent,
} from '@/lib/calculations';
import {
  DEFAULT_SKILLS,
  MAX_IMAGE_URL_LENGTH,
  ORDER_RANKS,
  isValidImageUrl,
} from '@/lib/constants';
import {
  backpackToSave,
  mergeRemoteBackpack,
  mergeRemoteResources,
  nextBackpackRev,
  normalizeBackpack,
  resourcesToSave,
  type BackpackValues,
  type ResourceValues,
  type ServerBackpack,
} from '@/lib/resource-sync';
import { callMoneyRpc, fetchBackpack, updateCharacterRow } from '@/lib/character-save';
import type { MoneyLogEntry } from '@/components/money/MoneyControl';
import { FloatingDiceButton } from '@/components/dice/FloatingDiceButton';
import { QuickRollButton } from '@/components/dice/DiceRoller';
import { CursesSection } from '@/components/character/CursesSection';
import { HistoricalFeatsSection } from '@/components/character/HistoricalFeatsSection';
import { InventorySection } from '@/components/character/InventorySection';
import {
  BackstorySection,
  NotesSection,
} from '@/components/character/NotesAndBackstorySection';
import { SpellsSection } from '@/components/character/SpellsSection';
import { WeaponsSection } from '@/components/character/WeaponsSection';
import { ArmorSection } from '@/components/character/ArmorSection';
import { useDiceToast } from '@/components/dice/DiceToast';
import { ElementsSection } from '@/components/character/ElementsSection';
import { LevelProgression } from '@/components/character/LevelProgression';
import { CharacterImage } from '@/components/ui/CharacterImage';
import type { SaveStatus } from '@/components/ui/SaveIndicator';
import { SaveStatusPill } from '@/components/fx/SaveStatus';
import { AnimatedNumber } from '@/components/fx/AnimatedNumber';
import { isSanityCritical, RESOURCE_TONE_COLOR } from '@/lib/vm/card';
import { SkillsList } from '@/components/character/SkillsList';
import { SectionCard } from '@/components/ui/SectionCard';
import { SheetTabs } from '@/components/ui/SheetTabs';
import type {
  ArmorPiece,
  Attributes,
  Character,
  CharacterElementRow,
  Curse,
  HistoricalFeat,
  InventoryItem,
  MilestoneNotes,
  Skill,
  Spell,
  Weapon,
} from '@/types/database';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
  DEFAULT_RESOURCE_MODS,
  type ResourceMods,
  type SkillUpgradeSpent,
} from '@/types/database';

type SheetState = {
  name: string;
  occupation: string;
  age: string;
  pronouns: string;
  birthplace: string;
  residence: string;
  image_url: string;
  arcana: string;
  subarcana: string;
  attributes: Attributes;
  hp_current: number;
  mana_current: number;
  sanity_current: number;
  skills: Skill[];
  spells: Spell[];
  weapons: Weapon[];
  inventory: InventoryItem[];
  money: number;
  armor: ArmorPiece[];
  curses: Curse[];
  historical_feats: HistoricalFeat[];
  milestone_notes: MilestoneNotes;
  notes: string;
  backstory: string;
  is_order_agent: boolean;
  order_rank: string;
  resource_mods: ResourceMods;
  attribute_points_spent: number;
  skill_points_spent: SkillUpgradeSpent;
};

type PatchSheet = (
  partial: Partial<SheetState> | ((s: SheetState) => Partial<SheetState>)
) => void;

// Digitar num campo só renderiza a seção daquele campo.
const MemoLevelProgression = memo(LevelProgression);
const MemoSkillsList = memo(SkillsList);
const MemoElementsSection = memo(ElementsSection);
const MemoSpellsSection = memo(SpellsSection);
const MemoWeaponsSection = memo(WeaponsSection);
const MemoArmorSection = memo(ArmorSection);
const MemoInventorySection = memo(InventorySection);
const MemoCursesSection = memo(CursesSection);
const MemoHistoricalFeatsSection = memo(HistoricalFeatsSection);
const MemoNotesSection = memo(NotesSection);
const MemoBackstorySection = memo(BackstorySection);
const MemoFloatingDiceButton = memo(FloatingDiceButton);
// Só existe na aba Mosaico.
const MemoMosaicFrame = memo(
  dynamic(() =>
    import('@/components/mosaic/MosaicFrame').then((m) => m.MosaicFrame)
  )
);

/** HP acima do máximo não é salvo: conta como o máximo, igual à tela. */
function localResources(
  sheet: SheetState,
  elements: CharacterElementRow[]
): ResourceValues {
  const maxes = getEffectiveMaxes(
    getTotalLevel(elements),
    sheet.attributes,
    sheet.resource_mods || DEFAULT_RESOURCE_MODS
  );
  return {
    hp_current: Math.min(sheet.hp_current, maxes.hp),
    mana_current: sheet.mana_current,
    sanity_current: sheet.sanity_current,
  };
}

function toState(c: Character): SheetState {
  return {
    name: c.name ?? '',
    occupation: c.occupation ?? '',
    age: c.age != null ? String(c.age) : '',
    pronouns: c.pronouns ?? '',
    birthplace: c.birthplace ?? '',
    residence: c.residence ?? '',
    image_url: c.image_url ?? '',
    arcana: c.arcana ?? '',
    subarcana: c.subarcana ?? '',
    attributes: { ...DEFAULT_ATTRIBUTES, ...(c.attributes || {}) },
    hp_current: c.hp_current ?? 0,
    mana_current: c.mana_current ?? 0,
    sanity_current: c.sanity_current ?? 0,
    skills: c.skills && c.skills.length > 0 ? c.skills : DEFAULT_SKILLS.map((sk) => ({ ...sk })),
    spells: c.spells ?? [],
    weapons: c.weapons ?? [],
    inventory: c.inventory ?? [],
    money: Number(c.money ?? 0) || 0,
    armor: c.armor ?? [],
    curses: c.curses ?? [],
    historical_feats: c.historical_feats ?? [],
    milestone_notes: c.milestone_notes ?? {},
    notes: c.notes ?? '',
    backstory: c.backstory ?? '',
    is_order_agent: c.is_order_agent ?? true,
    order_rank: c.order_rank ?? 'Agente Principiante',
    resource_mods: { ...DEFAULT_RESOURCE_MODS, ...(c.resource_mods || {}) },
    attribute_points_spent: c.attribute_points_spent ?? 0,
    skill_points_spent: normalizeSkillUpgradeSpent(c.skill_points_spent),
  };
}

export function CharacterSheet({
  character,
  initialElements,
}: {
  character: Character;
  initialElements: CharacterElementRow[];
}) {
  const [sheet, setSheet] = useState(() => toState(character));
  const [elements, setElements] = useState<CharacterElementRow[]>(initialElements);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [ready, setReady] = useState(false);
  const { setRollContext } = useDiceToast();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    setRollContext({
      characterId: character.id,
      characterName: sheet.name || 'Personagem',
    });
    return () => setRollContext(null);
  }, [character.id, sheet.name, setRollContext]);

  const totalLevel = getTotalLevel(elements);
  const effectiveMaxes = useMemo(
    () => getEffectiveMaxes(totalLevel, sheet.attributes, sheet.resource_mods),
    [totalLevel, sheet.attributes, sheet.resource_mods]
  );

  // Último valor de cada recurso que o banco confirmou. O save só manda o que
  // mudou aqui desde então: a Ficha Rápida pode ter mudado o resto em outra aba.
  const lastSavedResourcesRef = useRef<ResourceValues>({
    hp_current: character.hp_current ?? 0,
    mana_current: character.mana_current ?? 0,
    sanity_current: character.sanity_current ?? 0,
  });

  // Mesma coisa para a mochila, que a Ficha Rápida também edita.
  const lastSavedBackpackRef = useRef<BackpackValues>(normalizeBackpack(character));
  // Versão da mochila que este save conhece (migração 025): grava só se ainda for ela.
  const backpackRevRef = useRef(character.backpack_rev ?? 0);
  const [backpackNotice, setBackpackNotice] = useState<string | null>(null);
  // Mochila/dinheiro que vieram do banco (RPC ou releitura): viram o local e o salvo.
  // Preenchida mais abaixo, depois de `remoteMergeRef` existir.
  const applyServerBackpackRef = useRef<(server: ServerBackpack) => void>(() => {});

  // Elementos já no banco: sem mudança aqui, o save nem toca em character_elements.
  const lastSavedElementsRef = useRef(initialElements);

  const persistCharacterNow = useCallback(
    async (next: SheetState, nextElements: CharacterElementRow[]) => {
      const supabase = await loadSupabase();
      const baseMaxes = computeDerivedMaxes(
        getTotalLevel(nextElements),
        next.attributes
      );
      const mods = next.resource_mods || DEFAULT_RESOURCE_MODS;
      const maxes = {
        hpMax: Math.max(1, baseMaxes.hpMax + (mods.hp || 0)),
        manaMax: Math.max(1, baseMaxes.manaMax + (mods.mana || 0)),
        sanityMax: Math.max(1, baseMaxes.sanityMax + (mods.sanity || 0)),
      };
      const changedResources = resourcesToSave(
        localResources(next, nextElements),
        lastSavedResourcesRef.current
      );
      let changedBackpack = backpackToSave(
        { inventory: next.inventory, money: next.money },
        lastSavedBackpackRef.current
      );
      const payload = {
        name: next.name || 'Sem nome',
        occupation: next.occupation || null,
        age: next.age ? Number(next.age) : null,
        pronouns: next.pronouns || null,
        birthplace: next.birthplace || null,
        residence: next.residence || null,
        // Grava o que foi digitado (rascunho incluso); a foto só aparece se for http(s).
        image_url: next.image_url ? next.image_url.slice(0, MAX_IMAGE_URL_LENGTH) : null,
        arcana: next.arcana || null,
        subarcana: next.subarcana || null,
        attributes: next.attributes,
        // hp_max não é persistido: sempre derivado de CON + nível (getMaxHp).
        ...changedResources,
        mana_max: maxes.manaMax,
        sanity_max: maxes.sanityMax,
        skills: next.skills,
        spells: next.spells,
        weapons: next.weapons,
        ...changedBackpack,
        armor: next.armor,
        curses: next.curses,
        historical_feats: next.historical_feats,
        milestone_notes: next.milestone_notes,
        resource_mods: next.resource_mods,
        notes: next.notes || null,
        backstory: next.backstory || null,
        is_order_agent: next.is_order_agent,
        order_rank: next.order_rank || null,
        attribute_points_spent: next.attribute_points_spent ?? 0,
        skill_points_spent: normalizeSkillUpgradeSpent(next.skill_points_spent),
      };

      const backpackChanged = Object.keys(changedBackpack).length > 0;
      let result = await updateCharacterRow(
        supabase,
        character.id,
        payload,
        backpackChanged ? backpackRevRef.current : null
      );
      if (result.status === 'conflict') {
        // Mochila mudou no banco depois da última leitura (party, Ficha Rápida, outra
        // aba): não regrava a velha. Relê, e salva o resto sem ela.
        const server = await fetchBackpack(supabase, character.id);
        if (!server) throw new Error('Falha ao reler a mochila');
        applyServerBackpackRef.current(server);
        setBackpackNotice(
          'A mochila mudou em outro lugar enquanto você editava. Recarreguei; confira a última mudança.'
        );
        reloadedRef.current = true;
        const rest: Record<string, unknown> = { ...payload };
        delete rest.inventory;
        delete rest.money;
        changedBackpack = {};
        result = await updateCharacterRow(supabase, character.id, rest, null);
      }
      if (result.status !== 'ok') throw new Error('Falha ao salvar a ficha');
      if (result.rev !== null) backpackRevRef.current = result.rev;
      lastSavedResourcesRef.current = {
        ...lastSavedResourcesRef.current,
        ...changedResources,
      };
      lastSavedBackpackRef.current = {
        ...lastSavedBackpackRef.current,
        ...changedBackpack,
      };

      if (nextElements === lastSavedElementsRef.current) return null;

      // sync elements: upsert all, delete removed
      for (const el of nextElements) {
        const { error: elErr } = await supabase.from('character_elements').upsert(
          {
            character_id: character.id,
            element: el.element,
            level: el.level,
            fragments_current: el.fragments_current,
            ...(el.id ? { id: el.id } : {}),
          },
          { onConflict: 'character_id,element' }
        );
        if (elErr) throw elErr;
      }

      const keep = new Set(nextElements.map((e) => e.element));
      // refetch ids after upsert — delete orphans by element not in keep
      const { data: existing } = await supabase
        .from('character_elements')
        .select('id, element')
        .eq('character_id', character.id);
      if (existing) {
        const orphanIds = existing
          .filter((e) => !keep.has(e.element as CharacterElementRow['element']))
          .map((e) => e.id);
        if (orphanIds.length) {
          await supabase.from('character_elements').delete().in('id', orphanIds);
        }
      }
      lastSavedElementsRef.current = nextElements;
      return existing;
    },
    [character.id]
  );

  // Um save de cada vez: dois em paralelo usariam a mesma versão da mochila e o
  // segundo daria conflito à toa. Na fila, o segundo já vê o que o primeiro gravou.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  /** O último save releu a mochila (conflito de versão): o indicador avisa. */
  const reloadedRef = useRef(false);
  const persistCharacter = useCallback(
    (next: SheetState, nextElements: CharacterElementRow[]) => {
      const run = saveQueueRef.current
        .catch(() => undefined)
        .then(() => persistCharacterNow(next, nextElements));
      saveQueueRef.current = run;
      return run;
    },
    [persistCharacterNow]
  );

  const sheetRef = useRef(sheet);
  const elementsRef = useRef(elements);
  sheetRef.current = sheet;
  elementsRef.current = elements;

  // Recurso vindo de outra aba já está no banco: mesclar não pede save. Mas se já
  // havia um save agendado, ele continua valendo (a limpeza do efeito o cancelou).
  const remoteMergeRef = useRef(false);
  const savePendingRef = useRef(false);

  applyServerBackpackRef.current = (server: ServerBackpack) => {
    lastSavedBackpackRef.current = server.backpack;
    backpackRevRef.current = server.rev;
    remoteMergeRef.current = true;
    setSheet((s) => ({ ...s, ...server.backpack }));
  };

  /** Gastar/Receber (e `+50`/`-30` no campo): grava o pendente, chama a RPC, aplica o retorno. */
  const moveMoney = useCallback(
    async (delta: number, reason: string | null) => {
      const supabase = await loadSupabase();
      try {
        // A RPC parte do valor do banco: o que estiver só aqui vai antes.
        await persistCharacter(sheetRef.current, elementsRef.current);
      } catch {
        setBackpackNotice('Não foi possível salvar a ficha antes de movimentar.');
        return false;
      }
      const result = await callMoneyRpc(supabase, 'move_character_money', {
        p_character: character.id,
        p_delta: delta,
        p_reason: reason,
      });
      if (!result.ok) {
        setBackpackNotice(result.message);
        return false;
      }
      if (result.backpack) applyServerBackpackRef.current(result.backpack);
      setBackpackNotice(null);
      return true;
    },
    [character.id, persistCharacter]
  );

  const loadMoneyHistory = useCallback(async (): Promise<MoneyLogEntry[] | null> => {
    const supabase = await loadSupabase();
    const { data, error } = await supabase
      .from('character_money_log')
      .select('id, created_at, delta, reason, author_name')
      .eq('character_id', character.id)
      .order('id', { ascending: false })
      .limit(20);
    if (error) return null;
    return (data ?? []).map((row) => ({ ...row, delta: Number(row.delta) }) as MoneyLogEntry);
  }, [character.id]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void loadSupabase().then((supabase) => {
      if (cancelled) return;
      const channel = supabase
        .channel(`character:${character.id}:${crypto.randomUUID()}`)
        .on<ResourceValues & Pick<Character, 'inventory' | 'money' | 'backpack_rev'>>(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'characters',
            filter: `id=eq.${character.id}`,
          },
          ({ new: row }) => {
            const merged = mergeRemoteResources(
              localResources(sheetRef.current, elementsRef.current),
              lastSavedResourcesRef.current,
              {
                hp_current: row.hp_current,
                mana_current: row.mana_current,
                sanity_current: row.sanity_current,
              }
            );
            const localPack = {
              inventory: sheetRef.current.inventory,
              money: sheetRef.current.money,
            };
            const remotePack = normalizeBackpack(row);
            backpackRevRef.current = nextBackpackRev(
              localPack,
              lastSavedBackpackRef.current,
              remotePack,
              backpackRevRef.current,
              row.backpack_rev ?? backpackRevRef.current
            );
            const mergedBackpack = mergeRemoteBackpack(
              localPack,
              lastSavedBackpackRef.current,
              remotePack
            );
            lastSavedResourcesRef.current = merged.lastSaved;
            lastSavedBackpackRef.current = mergedBackpack.lastSaved;
            if (!merged.changed && !mergedBackpack.changed) return;
            remoteMergeRef.current = true;
            setSheet((s) => ({ ...s, ...merged.local, ...mergedBackpack.local }));
          }
        )
        .subscribe();
      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [character.id]);

  useEffect(() => {
    if (!ready) return;
    const remoteOnly = remoteMergeRef.current && !savePendingRef.current;
    remoteMergeRef.current = false;
    if (remoteOnly) return;
    savePendingRef.current = true;
    setStatus('saving');
    const t = setTimeout(async () => {
      savePendingRef.current = false;
      const snapSheet = sheetRef.current;
      const snapElements = elementsRef.current;
      try {
        const data = await persistCharacter(snapSheet, snapElements);
        if (data) {
          // Só mescla IDs — não sobrescreve níveis/fragmentos locais (evita rollback)
          const current = elementsRef.current;
          const merged = current.map((row) => {
            const found = data.find((d) => d.element === row.element);
            return found && found.id !== row.id ? { ...row, id: found.id } : row;
          });
          // Array novo aqui religaria o efeito de save: só troca se algum id mudou,
          // e id que veio do banco não é edição, então não agenda outro save.
          if (merged.some((row, i) => row !== current[i])) {
            if (lastSavedElementsRef.current === current) {
              lastSavedElementsRef.current = merged;
            }
            remoteMergeRef.current = true;
            setElements(merged);
          }
        }
        setStatus(reloadedRef.current ? 'reloaded' : 'saved');
        reloadedRef.current = false;
      } catch {
        setStatus('error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sheet, elements, ready, persistCharacter]);

  useEffect(() => {
    if (status !== 'saved' && status !== 'reloaded') return;
    const t = setTimeout(() => setStatus('idle'), status === 'saved' ? 1600 : 4000);
    return () => clearTimeout(t);
  }, [status]);

  /** "Tentar de novo" do indicador: grava o estado atual na mesma fila. */
  const retrySave = useCallback(() => {
    setStatus('saving');
    persistCharacter(sheetRef.current, elementsRef.current).then(
      () => {
        setStatus(reloadedRef.current ? 'reloaded' : 'saved');
        reloadedRef.current = false;
      },
      () => setStatus('error')
    );
  }, [persistCharacter]);

  // Estável: as seções memorizadas não renderizam de novo só por causa do callback.
  const patch = useCallback<PatchSheet>((partial) => {
    setSheet((s) => ({
      ...s,
      ...(typeof partial === 'function' ? partial(s) : partial),
    }));
  }, []);

  const handlers = useMemo(
    () => ({
      arcana: (arcana: string) => patch({ arcana }),
      subarcana: (subarcana: string) => patch({ subarcana }),
      milestoneNote: (level: number, note: string) =>
        patch((s) => ({
          milestone_notes: { ...s.milestone_notes, [String(level)]: note },
        })),
      skills: (skills: Skill[]) => patch({ skills }),
      elements: (next: CharacterElementRow[]) => setElements(next),
      spells: (spells: Spell[]) => patch({ spells }),
      weapons: (weapons: Weapon[]) => patch({ weapons }),
      armor: (armor: ArmorPiece[]) => patch({ armor }),
      money: (money: number) => patch({ money }),
      inventory: (inventory: InventoryItem[]) => patch({ inventory }),
      curses: (curses: Curse[]) => patch({ curses }),
      feats: (historical_feats: HistoricalFeat[]) => patch({ historical_feats }),
      notes: (notes: string) => patch({ notes }),
      backstory: (backstory: string) => patch({ backstory }),
    }),
    [patch]
  );

  const weight = getInventoryWeight(sheet.inventory);
  const limit = getCarryLimit(sheet.attributes);
  const attrPointsAvailable = getAttributePointsAvailable(
    totalLevel,
    sheet.attribute_points_spent
  );
  const skillUpgradesAvailable = useMemo(
    () =>
      getSkillUpgradesAvailable(totalLevel, sheet.attributes.INT, sheet.skills),
    [totalLevel, sheet.attributes.INT, sheet.skills]
  );

  const spendSkillPoint = useCallback(
    (i: number) => {
      patch((s) => {
        const skill = s.skills[i];
        const upgradeKey = getUpgradeKeyForNext(skill.specialization);
        if (!upgradeKey || skillUpgradesAvailable[upgradeKey] <= 0) return {};
        const skills = [...s.skills];
        skills[i] = { ...skill, specialization: upgradeKey };
        // Gasto = especializações atuais; não depende mais do jsonb legado.
        return { skills };
      });
    },
    [patch, skillUpgradesAvailable]
  );

  return (
    <div className="relative space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl text-parchment md:text-4xl">
          {sheet.name || 'Sem nome'}
        </h1>
        <SaveStatusPill status={status} onRetry={retrySave} floating />
      </div>

      <HeaderSection
        imageUrl={sheet.image_url}
        name={sheet.name}
        occupation={sheet.occupation}
        age={sheet.age}
        pronouns={sheet.pronouns}
        birthplace={sheet.birthplace}
        residence={sheet.residence}
        orderRank={sheet.order_rank}
        isOrderAgent={sheet.is_order_agent}
        patch={patch}
      />

      <MemoLevelProgression
        elements={elements}
        isOrderAgent={sheet.is_order_agent}
        arcana={sheet.arcana}
        subarcana={sheet.subarcana}
        milestoneNotes={sheet.milestone_notes}
        onArcanaChange={handlers.arcana}
        onSubarcanaChange={handlers.subarcana}
        onMilestoneNoteChange={handlers.milestoneNote}
      />

      <AttributesSection
        attributes={sheet.attributes}
        attrPointsAvailable={attrPointsAvailable}
        patch={patch}
      />

      <ResourcesSection
        hpCurrent={sheet.hp_current}
        manaCurrent={sheet.mana_current}
        sanityCurrent={sheet.sanity_current}
        mods={sheet.resource_mods}
        maxes={effectiveMaxes}
        patch={patch}
      />

      <MemoSkillsList
        skills={sheet.skills}
        attributes={sheet.attributes}
        skillUpgradesAvailable={skillUpgradesAvailable}
        onChange={handlers.skills}
        onSpendSkillPoint={spendSkillPoint}
      />

      <section className="space-y-1">
        <SheetTabs
          defaultTabId="elementos"
          tabs={[
            {
              id: "elementos",
              label: "Elementos e Fragmentos",
              content: (
                <MemoElementsSection
                  elements={elements}
                  onChange={handlers.elements}
                />
              ),
            },
            {
              id: "magias",
              label: "Magias e Poderes Passivos",
              content: (
                <MemoSpellsSection
                  spells={sheet.spells}
                  onChange={handlers.spells}
                />
              ),
            },
            {
              id: "armas",
              label: "Armas",
              content: (
                <div className="space-y-5">
                  <MemoWeaponsSection
                    weapons={sheet.weapons}
                    onChange={handlers.weapons}
                  />
                  <MemoArmorSection
                    armor={sheet.armor}
                    onChange={handlers.armor}
                  />
                </div>
              ),
            },
            {
              id: "inventario",
              label: "Inventário",
              content: (
                <div className="space-y-2">
                  {backpackNotice && (
                    <p role="status" className="rounded-md border border-crimson/40 px-3 py-2 text-sm text-crimson-soft">
                      {backpackNotice}
                    </p>
                  )}
                  <MemoInventorySection
                    inventory={sheet.inventory}
                    weight={weight}
                    limit={limit}
                    money={sheet.money}
                    onMoneyChange={handlers.money}
                    onMoneyDelta={moveMoney}
                    loadMoneyHistory={loadMoneyHistory}
                    onChange={handlers.inventory}
                  />
                </div>
              ),
            },
            {
              id: "maldicoes",
              label: "Maldições",
              content: (
                <MemoCursesSection
                  curses={sheet.curses}
                  onChange={handlers.curses}
                />
              ),
            },
            {
              id: "feitos",
              label: "Feitos Históricos",
              content: (
                <MemoHistoricalFeatsSection
                  feats={sheet.historical_feats}
                  totalLevel={totalLevel}
                  onChange={handlers.feats}
                />
              ),
            },
            {
              id: "anotacoes",
              label: "Anotações",
              content: (
                <MemoNotesSection
                  notes={sheet.notes}
                  onChange={handlers.notes}
                />
              ),
            },
            {
              id: "historia",
              label: "História do Personagem",
              content: (
                <MemoBackstorySection
                  backstory={sheet.backstory}
                  onChange={handlers.backstory}
                />
              ),
            },
            {
              id: "mosaico",
              label: "Mosaico",
              content: (
                <MemoMosaicFrame characterName={sheet.name} elements={elements} />
              ),
            },
          ]}
        />
      </section>

      <MemoFloatingDiceButton />
    </div>
  );
}

const HeaderSection = memo(function HeaderSection({
  imageUrl,
  name,
  occupation,
  age,
  pronouns,
  birthplace,
  residence,
  orderRank,
  isOrderAgent,
  patch,
}: {
  imageUrl: string;
  name: string;
  occupation: string;
  age: string;
  pronouns: string;
  birthplace: string;
  residence: string;
  orderRank: string;
  isOrderAgent: boolean;
  patch: PatchSheet;
}) {
  const imageValid = !imageUrl || isValidImageUrl(imageUrl);

  return (
    <SectionCard title="Cabeçalho">
      <div className="grid gap-4 md:grid-cols-[140px_1fr]">
        <CharacterImage
          url={imageUrl}
          name={name}
          className="h-36 w-full rounded-md border border-ink-border md:h-40"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="label">URL da imagem</span>
            <input
              className="field"
              value={imageUrl}
              maxLength={MAX_IMAGE_URL_LENGTH}
              inputMode="url"
              onChange={(e) => patch({ image_url: e.target.value.trim() })}
              placeholder="https://…/retrato.png"
            />
            {!imageValid && (
              <span className="text-xs text-crimson-soft">
                A URL precisa começar com http:// ou https://
              </span>
            )}
          </label>
          <label className="space-y-1">
            <span className="label">Nome</span>
            <input
              className="field"
              value={name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Ocupação</span>
            <input
              className="field"
              value={occupation}
              onChange={(e) => patch({ occupation: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Idade</span>
            <input
              className="field"
              type="number"
              value={age}
              onChange={(e) => patch({ age: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Pronomes</span>
            <input
              className="field"
              value={pronouns}
              onChange={(e) => patch({ pronouns: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Naturalidade</span>
            <input
              className="field"
              placeholder="Cidade, País"
              value={birthplace}
              onChange={(e) => patch({ birthplace: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Residência</span>
            <input
              className="field"
              value={residence}
              onChange={(e) => patch({ residence: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="label">Patente na Ordem</span>
            <select
              className="field"
              value={orderRank}
              onChange={(e) => patch({ order_rank: e.target.value })}
              disabled={!isOrderAgent}
            >
              {ORDER_RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={isOrderAgent}
              onChange={(e) => patch({ is_order_agent: e.target.checked })}
              className="h-4 w-4 accent-crimson"
            />
            <span className="text-sm text-parchment">Agente da Ordem Carmesim</span>
          </label>
        </div>
      </div>
    </SectionCard>
  );
});

const AttributesSection = memo(function AttributesSection({
  attributes,
  attrPointsAvailable,
  patch,
}: {
  attributes: Attributes;
  attrPointsAvailable: number;
  patch: PatchSheet;
}) {
  return (
    <SectionCard
      title="Atributos"
      badge={
        attrPointsAvailable > 0 ? (
          <span className="animate-pulse rounded-md border border-crimson/50 bg-crimson/20 px-2 py-0.5 text-xs font-medium text-crimson-soft">
            {attrPointsAvailable === 1
              ? '1 ponto de atributo disponível'
              : attrPointsAvailable + ' pontos de atributo disponíveis'}
          </span>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = attributes[key];
          const mod = getAttributeModifier(value);
          return (
            <div key={key} className="rounded-md border border-ink-border bg-ink-raised/50 p-3 text-center">
              <span className="label block">{ATTRIBUTE_LABELS[key]}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{key}</span>
              <input
                type="number"
                className="field mt-2 text-center font-display text-2xl"
                value={value}
                onChange={(e) => {
                  const next = Number(e.target.value) || 0;
                  patch((s) => ({
                    attributes: { ...s.attributes, [key]: next },
                  }));
                }}
              />
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="text-base text-crimson-soft">
                  {mod >= 0 ? '+' + mod : mod}
                </span>
                <QuickRollButton bonus={mod} label={ATTRIBUTE_LABELS[key]} />
                {attrPointsAvailable > 0 && (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs text-crimson-soft"
                    onClick={() =>
                      patch((s) => ({
                        attributes: {
                          ...s.attributes,
                          [key]: s.attributes[key] + 1,
                        },
                        attribute_points_spent: s.attribute_points_spent + 1,
                      }))
                    }
                    title="Gastar 1 ponto de atributo"
                  >
                    +1
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
});

const ResourcesSection = memo(function ResourcesSection({
  hpCurrent,
  manaCurrent,
  sanityCurrent,
  mods,
  maxes,
  patch,
}: {
  hpCurrent: number;
  manaCurrent: number;
  sanityCurrent: number;
  mods: ResourceMods;
  maxes: { hp: number; mana: number; sanity: number };
  patch: PatchSheet;
}) {
  return (
    <SectionCard title="Recursos">
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['HP', 'hp_current', 'hp', hpCurrent, maxes.hp, '#8B1E2D'],
            ['Mana', 'mana_current', 'mana', manaCurrent, maxes.mana, '#3B6EA5'],
            ['Sanidade', 'sanity_current', 'sanity', sanityCurrent, maxes.sanity, '#7A6B9A'],
          ] as const
        ).map(([label, currentKey, modKey, value, max, color]) => {
          const current = Math.min(value, max);
          const modVal = mods[modKey] || 0;
          return (
            <ResourceBlock
              key={currentKey}
              label={label}
              current={current}
              max={max}
              color={color}
              mod={modVal}
              onModChange={(v) =>
                patch((s) => ({
                  resource_mods: { ...s.resource_mods, [modKey]: v },
                }))
              }
              onApply={(delta) => {
                const next = Math.max(0, Math.min(max, current + delta));
                patch({ [currentKey]: next } as Partial<SheetState>);
              }}
            />
          );
        })}
      </div>
    </SectionCard>
  );
});

function ResourceBlock({
  label,
  current,
  max,
  color,
  mod,
  onModChange,
  onApply,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
  mod: number;
  onModChange: (v: number) => void;
  onApply: (delta: number) => void;
}) {
  const [amount, setAmount] = useState(1);
  const ratio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  const critical = label === 'Sanidade' && isSanityCritical(current, max);
  return (
    <div className="space-y-2 rounded-md border border-ink-border bg-ink-raised/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          mod
          <input
            type="number"
            step={1}
            className="field w-14 py-1 text-center text-sm"
            value={mod}
            onChange={(e) => onModChange(Math.trunc(Number(e.target.value) || 0))}
            title="Ajuste no máximo"
          />
        </label>
      </div>
      <p className="font-display text-2xl text-parchment">
        <AnimatedNumber
          value={current}
          critical={critical}
          style={critical ? { color: RESOURCE_TONE_COLOR.danger } : undefined}
        />
        <span className="text-base text-ink-muted"> / {max}</span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink">
        {/* scaleX em vez de width: roda no compositor, sem layout a cada quadro. */}
        <div
          className="h-full origin-left transition-transform duration-slow ease-enter"
          style={{ transform: `scaleX(${ratio})`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          className="field w-14 py-1 text-center text-sm"
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
        />
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(-amount)}>
          Dano
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(amount)}>
          Cura
        </button>
      </div>
    </div>
  );
}

