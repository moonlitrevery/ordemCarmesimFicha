# Mesa (VTT) — Especificação técnica

> Copie este arquivo para `docs/vtt/SPEC.md` no repositório. **Todo prompt de fase manda o Claude Code ler este arquivo antes de começar.** Ele é a fonte única de decisões; se um prompt de fase e este SPEC discordarem, vale o prompt de fase (ele é mais novo) e o SPEC deve ser atualizado no mesmo PR.

## 0. Contexto

O site da Ordem Carmesim (Next.js 14 App Router + TypeScript + Tailwind + Supabase, deploy na Vercel) ganha uma aba **Mesa**: um tabletop virtual próprio, integrado às fichas que já existem. Uso privado: uma mestra (role `mestre`) e ~6 jogadores, um dos quais joga num **Samsung Galaxy Tab S9 FE+** (régua de desempenho). Código em inglês, interface em pt-BR, seguindo o padrão visual e de componentes do repo (`panel`, `field`, `label`, `btn-ghost`, cores `crimson`, `ink-*`, `parchment`).

**Prioridade nº 1: desempenho.** Tudo tem que rodar liso no tablet e não pode comer CPU/RAM no PC. Regras na seção 7 são obrigatórias em toda fase.

## 1. Stack adicional

| Função | Escolha | Por quê |
|---|---|---|
| Render do mapa | **PixiJS v8** (WebGL), carregado com `dynamic import` só na rota da Mesa, `ssr: false` | rápido em mobile, sprites/partículas baratos |
| Estado do cliente | **zustand** | leve, fácil de atualizar fora do React (Pixi) |
| Tempo real | **Supabase Realtime**: 1 canal privado por mesa (`mesa:{tableId}`) com *presence* + *broadcast*; `postgres_changes` só pro chat | já está no projeto |
| Arquivos | **Vercel Blob** (store **público**) com **client upload** (`@vercel/blob/client`) | já está na Vercel, sem cartão; Hobby inclui 1 GB armazenado e 10 GB de transferência/mês |
| Áudio | **howler.js** | loop, fade, várias camadas, desbloqueio de áudio no mobile |
| PDF | **pdfjs-dist** (import dinâmico) | celular Android não abre PDF inline |
| .docx | **mammoth** (import dinâmico) + **DOMPurify** | relatórios em Word |
| Markdown | **react-markdown** + **remark-gfm** (já tem remark-gfm) | relatórios .md |

Não adicionar outras libs grandes sem necessidade. Nada de Konva, Fabric, Three.js, Socket.io, servidor próprio.

## 2. Rotas

```
/mesa                → lista "Minhas mesas" + campo "Entrar com código" (todo mundo vê)
/mesa/[id]           → a mesa (canvas + painéis). Só membros não banidos (ou mestre dona)
```
Link **Mesa** no `Nav` para todos os logados. Middleware: `/mesa` protegido igual `/fichas`.

## 3. Modelo de dados (Supabase)

Todas as tabelas novas com RLS. "Membro" = linha em `table_members` com `banned = false`. "Mestre da mesa" = `tables.owner_id = auth.uid()` (e o owner sempre tem `profiles.role = 'mestre'`). Crie funções `security definer` auxiliares: `is_table_member(table_id)`, `is_table_gm(table_id)`.

- **tables**: `id`, `name`, `code` (texto único, 6 chars A-Z0-9 sem ambíguos 0/O/1/I), `owner_id`, `session_open bool default false`, `default_scene_id` (cena "padrão" — a fita amarela do Roll20), `initiative jsonb default '{"entries":[],"current":0,"round":1}'`, `created_at`.
- **table_members**: `table_id`, `user_id`, `role` (`'jogador' | 'espectador'`, default `'jogador'`), `scene_id` (nullable — se preenchido, o jogador está separado do grupo nessa cena), `banned bool default false`, `joined_at`. PK (`table_id`,`user_id`). Entrada **só** via RPC `join_table(p_code text)` (security definer): acha a mesa pelo código, recusa se banido, insere como jogador (quem já é membro mantém o papel; a dona não vira membro), retorna o id. Ninguém lê `tables.code` exceto o mestre: a coluna não tem privilégio de `select`, a mestra lê pela RPC `get_my_table_codes()`, e por isso `select('*')` em `tables` falha (use `TABLE_COLUMNS`, de `src/lib/vtt/queries.ts`). `profiles` libera a leitura entre quem divide mesa (`shares_table_with`), para mostrar nomes e cores. `profiles.color` (`^#[0-9a-fA-F]{6}$`, nula = gerada do id com `userColor`) é a cor da pessoa no ping, na régua e no avatar; cada um grava a sua em ⋯ Configurações. A cor vem sempre do banco (`store.peopleColors`, relido em `member:changed`), nunca da presença nem do evento de ping, que qualquer um forjaria. `tables.scene_transition` (`'corte' | 'fade' | 'simbolo'`, default `fade`) é o estilo da transição.
- **assets** (biblioteca **global**, compartilhada entre mesas): `id`, `kind` (`'mapa' | 'token' | 'addon' | 'adereco' | 'audio_ambiente' | 'audio_sfx' | 'cutscene'`), `name`, `storage_key`, `url`, `thumb_url` (só `mapa` e `adereco`), `mime`, `size_bytes`, `width`, `height`, `duration_s`, `tags text[]`, `status` (`'approved' | 'pending' | 'rejected'`), `visibility` (`'mestre' | 'jogadores'`, default `'mestre'`), `uploaded_by`, `created_at`. Upload de jogador nasce `pending`; da mestra nasce `approved` e `visibility = 'mestre'`; aprovar um envio de jogador o deixa em `'jogadores'`. Jogador lê os próprios `pending` e, entre os `approved`, os `'jogadores'` e os em uso numa cena que ele vê (`is_asset_in_my_scene`: mapa da cena ou objeto **não oculto**). A Biblioteca tem um toggle "Visível pros jogadores" por item, e o painel Colocar lista o que o RLS devolve. Pode enviar quem é mestre ou `jogador` não banido em alguma mesa (`can_upload_asset()`); jogador só envia imagem. `url` e `thumb_url` são únicas e presas ao host do Blob, e `thumb_url` fica em `thumbs/` (`url` nunca): apagar uma linha apaga essas URLs, então nenhuma linha pode apontar para o arquivo de outra.
  A biblioteca estática (seção 6) **não tem linha aqui**, e as constraints de `url` continuam só aceitando o Blob. Por isso `scenes.map_asset_id` e `scene_objects.asset_id` não têm FK: guardam um id de `assets` ou um id do manifest. O trigger `detach_deleted_asset` faz o que as FKs faziam ao apagar um asset (apaga os objetos, limpa o mapa da cena), e `can_place_asset(id, kind)` só recusa id que existe em `assets` com outro tipo, sem aprovação ou que o usuário não pode ler (colocar um asset escondido o liberaria).
- **scenes**: `id`, `table_id`, `name`, `folder` (texto livre, pra agrupar), `sort`, `map_asset_id`, `meters_per_px` (calibração da régua), `ambient jsonb` (camadas de som salvas), `weather jsonb` (efeitos de tela salvos), `fog` (fase 11), `created_at`.
- **`scenes.ambient`**: `[{id, assetId, volume, target}]`, até 12 camadas na interface e 4 KB no banco (`is_valid_ambient`). `target` nulo é todos na cena; preenchido, só aquela pessoa, e só se estiver na cena. **A coluna guarda segredo, então `authenticated` não tem `select` nela:** `scenes` tem privilégio de leitura por coluna (coluna nova precisa de `grant select`, e `select('*')` falha), e todo mundo lê pela RPC `my_scene_ambient(p_scene)`, que filtra as camadas para quem não é a mestra.
- **`tables.audio`**: `{volume, fadeMs, sfxStop}`. Volume geral da mestra (0 a 100, vale para todos), fade (0,5 a 10 s, padrão 2 s) e contador de "Parar todos os SFX". Só a dona grava. Fica fora de `TABLE_COLUMNS`: quem lê é o `AudioSync`, e sem a migração só o som deixa de funcionar.
- **audio_cues**: `id`, `table_id`, `asset_id` (sem FK, como `scene_objects`), `target_user` (nulo = todos), `created_at`. Um SFX disparado é uma linha, apagada 2 min depois no próximo insert. Só a mestra insere; o RLS só mostra ao jogador as de todos e as dele. `my_audio_asset_ids()` entra em `my_visible_asset_ids` e `my_scene_static_asset_ids`: som de camada audível e SFX dos últimos 2 min são legíveis para quem vai ouvir, mesmo com `visibility = 'mestre'`.
- **scene_objects**: `id`, `scene_id`, `asset_id`, `kind` (`'token' | 'adereco' | 'addon'`), `x`, `y`, `rotation` (rad), `scale`, `flip_x bool`, `flip_y bool`, `z int`, `parent_id` (nullable, anexo), `local` jsonb (offset/rot relativos ao pai quando anexado), `caption jsonb` (`{text,color,stroke,strokeWidth,glow,glowColor,obfuscated}`), `effects jsonb` (ver abaixo), `conditions text[]`, `character_id` (nullable, vínculo com ficha), `npc_id` (nullable), `hidden bool` (só mestre vê), `created_by`, `updated_at`.
  Objeto anexado: `local` = `{x,y,rotation,scale,flipX,flipY}` e as colunas `x/y/...` ficam sem efeito até desanexar. `scene_id`, `asset_id`, `kind` e `created_by` não aceitam update (privilégio por coluna); `updated_at`, campos só da mestra (`hidden`, `character_id`, `npc_id`) e ciclos de anexo são conferidos pelo trigger `guard_scene_object`. Objeto nasce solto (`parent_id` e `local` não têm privilégio de insert).
- **drawings**: `id`, `scene_id`, `author_id`, `points` (`double precision[]` achatado, simplificado, até 8000 coordenadas), `color`, `width`, `created_at`.
- **pending_placements**: `id`, `asset_id`, `scene_id`, `x`, `y`, `scale`, `created_by`, `created_at`. Arquivo solto no mapa por jogador: só ele vê, semitransparente. A RPC `approve_asset(p_asset)` aprova o asset, vira cada colocação em `scene_objects` (mantendo o autor) e devolve as cenas afetadas; recusar apaga o asset e o cascade leva a colocação. Arquivo solto no mapa entra como `token`.
- **RLS sem função por linha:** quando a política olha muitas linhas, use `(select auth.uid())` e `(select public.is_mestre())`, que rodam uma vez, e `coluna in (select public.my_visible_scene_ids())` (também `my_gm_scene_ids`, `my_visible_asset_ids`) no lugar de `can_view_scene(coluna)`. Essas funções repetem as regras de `can_view_scene`: mudou uma, muda a outra.
- Quem vê o quê: `my_scene(table)` (sessão aberta; jogador = `scene_id` ou cena padrão; espectador = cena padrão), `can_view_scene`, `can_edit_scene` (espectador não edita), `is_scene_gm`. `scenes` só mostra ao jogador a cena em que ele está. Duplicar cena é a RPC `duplicate_scene` (copia objetos, anexos e desenhos). Ao criar a primeira cena, ela vira a padrão; apagar a padrão promove outra. **RLS e `insert().select()`:** o RETURNING passa pela política de SELECT, e função `stable` não enxerga a linha inserida pelo próprio comando. Por isso a política de SELECT de uma tabela nunca pode depender só de função que consulta essa mesma tabela: `scenes_select` testa `is_table_gm(table_id)` antes de `can_view_scene(id)`. `supabase/rls.test.ts` roda o `schema.sql` num Postgres embutido (PGlite) e cobre esse insert em cada tabela; toda tabela nova entra lá.
- **npcs**: `id`, `table_id`, `name`, `plane`, `tier`, `nd`, `attributes jsonb` (7 valores: FOR, CON, DES, INT, EDU, CAR, POD), `hp_max`, `hp_current`, `damage_die`, `x_bonus`, `attack_slots jsonb` (`[{name, damage}]`), `turns`, `xp`, `notes`, `created_at`. RLS: só a mestra da mesa, nem leitura para jogadores. `scene_objects.npc_id` tem FK `on delete set null` (apagar o NPC solta o token). Criar pela tabela de `src/lib/vtt/creature-tiers.ts` (dados aprovados, não alterar), via `buildNpcFromTier`; depois tudo é editável. Mudar dado ou X reescreve só os golpes que ainda seguiam a fórmula. `restore_scene_object` traz o vínculo só para a mestra e só se o NPC ainda existe; jogador recupera o token sem vínculo.
- **`tables.initiative`**: `{entries, current, round, notation}`, com entrada `{id, name, value, objectId, turn, turns}`. Todo membro lê (`notation` padrão `1d20`), só a dona grava. Criatura de N turnos entra N vezes. **A coluna não guarda segredo:** token oculto ou de legenda ofuscada entra como `???`, e o nome de verdade só aparece no painel da mestra, lido do que ela tem na memória. Token sem isso entra com a legenda, o NPC, a ficha ou o nome do arquivo, nesta ordem, e todos veem.
- **`scene_objects.conditions`**: id da lista padrão (`src/lib/vtt/conditions.ts`) ou `custom:{emoji}:{texto}` (até 24 caracteres). Valor desconhecido é ignorado ao desenhar: qualquer jogador grava a coluna.
- **`scene_objects.effects`**: `[{type: 'spell' | 'effect', id, color?}]`, array de até 4 KB. Qualquer jogador grava a coluna: ao desenhar valem só os ids conhecidos, 12 por objeto, e magia só no `appliesTo` certo (`resolveEffects`).
- **`scenes.weather`**: `[{type: 'chuva' | 'neve' | 'nevoa' | 'fuligem', on, intensity}]`, array de até 4 KB. A intensidade (0 a 100) fica guardada com o efeito desligado.
- **`scenes.lighting`**: `{on, preset: 'noite' | 'escuridao' | 'crepusculo' | 'penumbra' | 'custom', color, intensity}` ou nula, validada no banco. `duplicate_scene` copia.
- **chat_messages**: `id`, `table_id`, `author_id`, `author_name`, `character_id`, `character_name`, `kind` (`'text' | 'roll' | 'whisper' | 'system'`), `body`, `roll` jsonb (`{notation,groups,modifier,total,math,label}`), `hidden`, `whisper_to`, `deleted`, `created_at`. O trigger `guard_chat_message` preenche `author_name` e `character_name` a partir do banco (só com ficha própria, ou qualquer uma para a mestra da mesa), recusa `system` de quem não é mestra e sussurro para quem não está na mesa, e ao apagar limpa `body` e `roll`. Update só em `deleted`, e só para `true`. Quem rola sorteia no próprio navegador, como o resto do site: o resultado não é conferido pelo servidor. O `/shiu` é sempre para uma pessoa da mesa (membros não banidos e a mestra), nunca para um personagem: o autocomplete e o parser só conhecem nomes de exibição.
- **table_documents**: `id`, `table_id`, `category` (`'carta' | 'prova' | 'pista' | 'referencia'`), `title`, `storage_key`, `url`, `mime`, `size_bytes`, `status` (`'approved' | 'pending'`), `uploaded_by`, `shown_at`, `created_at`. Membro lê os `approved` e os próprios `pending`; a mestra lê tudo. Mestra insere em qualquer categoria, já `approved`; jogador só `referencia` e `pending`; espectador não insere (`table_upload_role(p_table)` devolve `'gm'`, `'player'` ou nulo). Só a mestra faz update, e só de `status` e `shown_at`. Apagar: mestra qualquer um, jogador os próprios, mesmo aprovados. Recusar é apagar.
- **table_reports**: `id`, `table_id`, `title`, `storage_key`, `url`, `mime`, `size_bytes`, `author_id`, `character_id`, `character_name`, `created_at`. Todo membro lê, sem aprovação; mestra e jogador inserem; apagar como nos documentos. `character_name` é copiado pelo trigger `guard_table_report` (ficha própria, ou qualquer uma para a mestra da mesa): jogador não lê a ficha dos outros, e o nome fica se a ficha for apagada.
- Nas duas, `url` é única e presa à pasta (`documento/` ou `relatorio/`): apagar a linha apaga o arquivo, então nenhuma linha aponta para o arquivo de outra, nem de `assets`. Nenhuma política olha `session_open`: tudo vale com a sessão fechada. Apagar uma mesa ainda não apaga estes arquivos no Blob (não há tela de apagar mesa).

Toda migração nova vai em `supabase/migrations/0NN_*.sql` **e** é refletida em `supabase/schema.sql`. Toda migração termina com `notify pgrst, 'reload schema';`. A mestra roda o SQL à mão no SQL Editor — ao final de cada fase, imprima o SQL que ela precisa rodar.

## 4. Permissões

| Ação | Mestre | Jogador | Espectador |
|---|---|---|---|
| Criar/editar/apagar mesa, código, cenas, mapas | ✅ | ❌ | ❌ |
| Abrir/fechar sessão, mover jogadores entre cenas, expulsar/banir, trocar papel | ✅ | ❌ | ❌ |
| Ver o canvas | ✅ (qualquer cena) | ✅ (só a cena dele, sessão aberta) | ✅ (cena padrão, sessão aberta) |
| Mover/girar/redimensionar/espelhar/legenda/anexar **qualquer** token | ✅ | ✅ | ❌ |
| Ocultar objeto (leva junto os anexados), vincular NPC | ✅ | ❌ | ❌ |
| Apagar objeto | ✅ | só os que criou | ❌ |
| Efeitos e magias no token, condições | ✅ | ✅ | ❌ |
| Desenhar / apagar o próprio desenho / apagar tudo | ✅ / ✅ / ✅ | ✅ / ✅ / ❌ | ❌ |
| Copiar, colar e duplicar objeto | ✅ | ✅ (nasce visível, sem ficha nem NPC) | ❌ |
| Ping, régua | ✅ | ✅ | ✅ |
| Chat, rolagens | ✅ | ✅ | ✅ (escreve; não tem ficha) |
| Som, efeitos de tela, cutscene, iniciativa | ✅ | ❌ | ❌ |
| Subir imagem no mapa / referência | direto | vai pra aprovação | ❌ |
| Apagar qualquer arquivo/documento/mensagem | ✅ (menos os fixos de `public/vtt/`, que ninguém apaga pelo site) | os próprios (asset da biblioteca: só enquanto `pending`) | os próprios (msgs) |

Sessão **fechada**: canvas mostra "A sessão ainda não começou" pra jogadores/espectadores; chat, documentos e relatórios continuam acessíveis. A mestra sempre vê tudo.

## 5. Tempo real

- **Um canal por mesa**: `supabase.channel('mesa:'+tableId, { config: { private: true, presence: { key: userId } } })`. Use Realtime Authorization (policies em `realtime.messages`) pra só membros/mestre conseguirem entrar. Se o projeto não suportar, documente e use canal público com nome contendo o UUID da mesa.
- **Presence**: `{ userId, name, role, sceneId, ready? }` — mostra quem está online e em qual cena.
- **Broadcast** (tipado num único `type VttEvent` em `src/lib/vtt/events.ts`): `obj:drag` (transitório, throttle 50 ms, só posição), `obj:upsert`, `obj:delete`, `scene:assign`, `scene:refresh`, `session:state`, `member:changed`, `table:refresh`, `ping`, `ruler` (transitório, throttle 100 ms, some em 5 s sem atualização), `draw:add`, `draw:delete`, `initiative:refresh`, `npc:refresh`, `audio:*`, `fx:weather` (só `sceneId`), `doc:refresh`, `doc:show`, `cutscene:*`, `asset:pending`, `asset:resolved`.
- **Fonte da verdade é o banco.** Ao entrar: carrega snapshot (mesa, cena, objetos, desenhos). Ação persistente = escreve no banco **e** faz broadcast do resultado (com `updated_at`); quem recebe aplica se `updated_at` for mais novo (last-write-wins). Arrastar: broadcast `obj:drag` durante o movimento, persiste uma vez no `pointerup`.
- Qualquer membro pode enviar no canal, então `session:state`, `member:changed`, `table:refresh`, `scene:assign`, `scene:refresh`, `initiative:refresh`, `npc:refresh`, `fx:weather`, `doc:*` e `asset:*` são só avisos: quem recebe relê o banco em vez de confiar no payload (o toast de pendente só aparece se o banco confirmar um item novo). `obj:upsert` e `draw:add` levam a linha, validada na chegada (`isValidObject`, `isValidDrawing`); a URL da imagem nunca viaja: sai de `assets`, pelo RLS.
- **Segredo não viaja no canal**, que todo membro recebe: objeto oculto e qualquer mudança em cena sem plateia (`isSceneLive`) saem como `scene:refresh {sceneId}`, e o RLS decide o que cada um relê. Sem `obj:drag` nesses casos. Dado de NPC nunca entra no canal: `NpcSync` só existe no navegador da mestra e `npc:refresh` não leva dado. A barrinha de HP do token sai do store dela, onde está a tabela.
- Iniciativa (`InitiativeSync`) e NPC (`NpcSync`) ficam fora de `SceneSync`: não são da cena. Aparecem na hora, gravam agrupados (250 e 400 ms) e não aceitam releitura com edição pendente. A iniciativa fica em `store.initiative`, não em `table`, para o snapshot da mesa não sobrescrever o que ainda está salvando.
- **Documentos e relatórios** (`DocSync`, `src/lib/vtt/docs/doc-sync.ts`): as listas ficam em `store.documents` e `store.reports`, só com metadados, carregadas em `requestIdleCallback` ao abrir a mesa. "Mostrar a todos" não leva o documento no canal: a mestra grava `table_documents.shown_at` e emite `doc:show`; quem recebe relê e só abre o que tem `shown_at` mais novo que o último lido, então um jogador não abre nada na tela dos outros forjando o aviso. Entrar ou reconectar atualiza a referência sem abrir o que ficou para trás. Se o item aberto for apagado, o visualizador fecha. Pendente de jogador sai como `asset:pending` (mesma fila e mesmo toast da Biblioteca); o resto, como `doc:refresh`.
- Tudo o que muda a cena passa por `SceneSync` (`src/lib/vtt/scene-sync.ts`); o canvas e os painéis só chamam seus métodos e leem o store.
- Efeitos e magias viajam na linha do objeto (`obj:upsert`), ou como `scene:refresh` em objeto oculto ou cena sem plateia. O clima aparece na hora para a mestra, grava agrupado (250 ms, uma gravação por vez) e só então sai `fx:weather`; quem recebe relê só `scenes.weather` da própria cena. Releitura não passa por cima do clima ainda não gravado.
- Iluminação segue a mesma via do clima (`queueSceneFx`, 250 ms, aviso `fx:weather`, e quem recebe relê `weather` e `lighting`).
- **Som** (`AudioSync`, `src/lib/vtt/audio/audio-sync.ts`; howler em `audio/engine.ts`): áudio nunca viaja, e `audio:ambient {sceneId}`, `audio:settings` e `audio:sfx` são só avisos, sem som nem alvo: quem recebe relê o banco. Assim um jogador não dispara som para os outros, e nem o aviso revela quem recebeu um sussurro. O ambiente é o da cena vista: entrar no meio, trocar de cena ou de separação relê e chega ao novo estado por diferença (`planAmbient`), com fade; som presente nas duas cenas continua tocando. Ambiente e ajustes da mestra soam na hora e gravam agrupados (250 ms). SFX perdido durante uma queda de conexão não toca depois, nem o que demorar mais de 8 s para carregar. SFX com alvo não toca para a mestra.
- **Fade:** ambiente entra, sai e troca de cena no fade de `tables.audio`; volume muda em 0,4 s; "Parar todos os SFX" usa o mesmo fade. O SFX **entra sem fade**: um stinger perderia o ataque.
- **Carga do som:** só carrega o que toca. Som parado há mais de 2 min é descarregado (`unload`), com timer só enquanto houver som parado. Acima de 3 min (`duration_s`) toca por streaming (`html5`), para não ocupar dezenas de MB decodificado; a emenda do loop só é perfeita abaixo disso. Cada asset tem um arquivo só, então não há fallback automático de formato: prefira ogg/opus, e use mp3 se algum aparelho não tocar.
- Reconexão: ao voltar o status `SUBSCRIBED`, relê a mesa e depois a cena. **Sempre nessa ordem**, também em `scene:assign` (`VttShell`): o RLS só mostra ao jogador a cena em que ele está, então ler as cenas com a padrão antiga no store daria "cena nenhuma", e o canvas desmontaria no meio da troca.
- **Transição entre cenas** (`SceneTransition`, `scene-transition.ts`; tela em `SceneTransitionOverlay`): local de cada cliente, disparada por `loadViewedScene` quando a cena vista muda de uma para outra (inclusive a mestra abrindo outra cena). Cobre, lê a cena nova, troca no store, espera as texturas e dois quadros (`engine.sceneLoaded`, o envio para a GPU fica escondido) e revela, com teto de 4 s. Fade 0,3 + 0,5 s; símbolo 0,3 + 0,7 + 0,5 s; modo leve encurta e tira a escala. Corte não cobre nada. Entrar na primeira cena (sessão abrindo) é corte: o canvas ainda não existe. É DOM, só `opacity` e `transform`, sobre o mapa e sob o HUD. O símbolo é `/icon.svg` (`src/app/icon.svg`); `NEXT_PUBLIC_ORDER_SYMBOL_URL` troca o caminho.
- **Desfazer/refazer** (`src/lib/vtt/history.ts`, aplicado por `SceneSync`): cada pessoa tem a própria pilha, em memória, de até 20 passos; some ao recarregar ou trocar de cena. Cada comando guarda antes e depois, e desfazer é aplicar o inverso pela mesma via (grava e transmite), então os outros veem. Desfaz mover, girar, redimensionar, espelhar, legenda, condições, efeitos e magias, vínculo de NPC, anexar/desanexar, ocultar/mostrar, criar, colar e apagar objeto, desenhar e apagar o próprio desenho. Não desfaz mudança de cena, clima, calibração, biblioteca, chat, iniciativa, ficha de NPC, ordem (frente/trás) nem "apagar todos os desenhos". Objeto apagado volta pela RPC `restore_scene_object` (mesmo id, anexo, legenda, efeitos e condições; se o pai sumiu, volta solto onde estava). Passo cujo alvo já não existe é pulado com um aviso. Atalhos: Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y (Cmd no Mac), ignorados em campo de texto.
- Chat usa `postgres_changes` em `chat_messages` filtrado por `table_id` (RLS se aplica), num canal próprio com tópico único (`chat:{tableId}:{uuid}`), fora do canal privado da mesa: um erro na tabela do chat não pode derrubar o canvas. Mesmo esquema para `characters` (Ficha Rápida e `CharacterSheet`), onde só `hp_current`, `mana_current`, `sanity_current`, `inventory` e `money` são mesclados (`src/lib/resource-sync.ts`): campo com mudança local não salva não é sobrescrito, e o save só envia o que mudou desde o último confirmado. `inventory` é uma coluna só: se as duas abas mexerem na lista dentro do mesmo intervalo de gravação, vale a última lista inteira.
- Toda rolagem da Mesa passa por `ChatSync.roll`: vai para o chat e para `dice_rolls`. O personagem que rola é o escolhido na Ficha Rápida, também no `/r`; sem escolha, sai só o nome de usuário no chat e em `/rolagens`. NPC e iniciativa passam `actor` e não levam a ficha escolhida. Ataque de NPC sai escondido por padrão, com toggle no painel.

## 6. Arquivos (Vercel Blob)

- `src/lib/storage/` com uma interface `StorageProvider` (`isConfigured`, `createUploadToken`, `ownsUrl`, `stat`, `delete(urls[])`) e a implementação **Vercel Blob**. Manter a interface pra dar pra trocar de provedor no futuro sem mexer no resto. Variável: `BLOB_READ_WRITE_TOKEN`. O Blob store está conectado ao projeto por OIDC, então a variável **não** é criada automaticamente: ela foi adicionada à mão nas variáveis de ambiente da Vercel (local via `vercel env pull`).
- **Client upload** (o arquivo vai do navegador direto pro Blob, sem passar pela função da Vercel): route handler `POST /api/upload` usando `handleUpload` do `@vercel/blob/client`. Em `onBeforeGenerateToken`: validar a sessão Supabase (server client), papel, `kind`, `allowedContentTypes` e `maximumSizeInBytes` por tipo; pathname `{kind}/{uuid}.{ext}` (`addRandomSuffix: true`).
- **Não depender de `onUploadCompleted`** (não roda em localhost). Fluxo: cliente chama `upload()` → recebe `{ url, pathname }` → chama `POST /api/assets` (ou `POST /api/table-files`, para documento e relatório) que valida de novo (tamanho e tipo reais via `head()`, nunca o que o cliente declarou) e cria a linha no banco (`assets`, `table_documents` ou `table_reports`) com `status` conforme o papel.
- `upload()` esconde a mensagem de erro do servidor: o cliente consulta `GET /api/upload` (`{ configured }`) antes de enviar, para mostrar "Ligue o Blob store na Vercel — veja LEIA-ME".
- `DELETE /api/upload/[id]`: só mestre (ou dono de item pendente/próprio) — `del()` do arquivo e da miniatura no Blob e apaga a linha. Blob primeiro: se falhar, a linha fica para tentar de novo, e a resposta diz o motivo (credencial recusada, cota).
- Documento e relatório: pastas `documento/` e `relatorio/`, sem miniatura (a lista mostra ícone). `/api/upload` confere o papel na mesa (`table_upload_role`), não `can_upload_asset`. O tipo vem da extensão, porque no Windows o navegador manda `type` vazio para .md e .m4a. Apagar é `DELETE /api/table-files/{documents|reports}/[id]`, Blob primeiro, como em `assets`. Baixar passa por um blob local, para o arquivo sair com o título (`download` não vale entre origens); sem isso, cai em `?download=1`.
- **Sempre passar `token` para `head()` e `del()`.** O SDK 2.x prefere OIDC ao `BLOB_READ_WRITE_TOKEN` quando há `VERCEL_OIDC_TOKEN` e `BLOB_STORE_ID` no ambiente, e o upload usa sempre o token: sem isso, cada operação poderia usar uma credencial diferente.
- **Economia de cota (Hobby):** nunca usar `list()` do Blob (conta como operação avançada; a lista vem sempre do banco); servir os arquivos direto pela URL pública (cache da CDN); `Cache-Control` longo (`cacheControlMaxAge` de 1 ano — os nomes são únicos). Se a cota estourar, o Blob fica bloqueado até o mês virar (não cobra) — mostrar erro claro no upload.
- **Antes de subir, o cliente reduz imagens** com `createImageBitmap` + `OffscreenCanvas` (fallback `<canvas>`) para **WebP q≈0.85**: mapa até **4096 px** no maior lado; token/addon até **512 px**; adereço até **1024 px**; referência até 2048 px. Guarda `width/height`. Safari não codifica WebP e envia PNG, por isso o servidor aceita WebP, PNG e JPEG.
- **Miniatura:** toda imagem (mapa, token, addon, adereço) gera também uma miniatura de até **96 px** (WebP q≈0.75, limite de 1 MB), enviada como segundo arquivo em `thumbs/{kind}/{uuid}.{ext}`. A biblioteca, Cenas e a fila de aprovação mostram só a miniatura; sem miniatura mostram um ícone. O arquivo cheio só carrega no canvas. Asset antigo sem miniatura: o navegador da mestra gera em segundo plano, um por vez, e registra em `POST /api/assets/[id]/thumb`. Mapa e adereço antigos ficam com a de 256 px que já têm.
- Limites: imagem 15 MB antes da compressão; áudio (ogg/mp3/m4a; recusar wav) 8 MB; PDF 20 MB; docx/md/txt 10 MB; cutscene (webm/mp4) 40 MB.
- Upload com barra de progresso (`onUploadProgress` do `upload()`), arrastar-e-soltar e seleção múltipla ("upload em lote").

### Biblioteca estática (`public/vtt/`)

- Originais commitados em `public/vtt/{mapas,tokens,addons,adereços,sons-ambiente,sfx}/` (só a mestra) e `public/vtt/jogadores/{mesmas pastas}/` (liberados para jogadores); subpastas valem. Imagem: webp/png/jpg; áudio: ogg/mp3/m4a. Cutscene não tem pasta.
- `scripts/vtt-manifest.mjs` roda no `npm run build` e em `npm run vtt:manifest`:
  - Cada arquivo sai em `public/vtt/_built/{hash do conteúdo}.{webp|ogg|mp3|m4a}`. Imagem acima do limite (mapa 4096 px, token/addon 512 px, adereço 1024 px) é reduzida, e toda imagem sai em WebP (WebP que já cabe é copiado sem reencodar). Áudio é só copiado.
  - Toda imagem ganha `_built/{hash}-t96.webp` de 96 px: a biblioteca nunca carrega o arquivo cheio.
  - O manifest vai para `generated/vtt-manifest.json`, fora de `public/`: `id`, `kind`, `name`, `visibility`, `path`, `thumb`, `mime`, `size_bytes`, `width`, `height`, `duration_s` e, só em áudio, `tags`. Mapa com `<nome>.meta.json` ao lado (saída do gerador, seção 12) ganha `meters_per_px` (corrigido se o manifest reduziu a imagem) e o nome vira o `title` do YAML (+ variante); o `.meta.json` em si não vira item.
  - Arquivo já gerado não é refeito, sobras de `_built/` são removidas. Formato errado ou arquivo ilegível é ignorado com aviso. `generated/` e `_built/` ficam no `.gitignore`; em dev, sem rodar o script, a biblioteca mostra só o Blob.
- **`GET /api/vtt/static`** é o catálogo por papel: mestra recebe tudo, os demais os itens `jogadores`. Manifest em cache de módulo; resposta `private, max-age=60`, `ETag` e `Vary: Cookie` (trocar de conta no mesmo navegador não pode reaproveitar a lista da mestra). **`GET /api/vtt/static/in-use`** (`no-store`) devolve ao jogador os itens só da mestra em uso nas cenas que ele vê (RPC `my_scene_static_asset_ids`). As duas ficam fora do middleware e fazem uma chamada ao Supabase cada: `getSession` só acha o token, quem confere é o PostgREST (`is_mestre`); nunca usar o `user` da sessão como prova. O manifest não vai para o bundle do cliente. Sem esse "em uso", um mapa só da mestra ficaria em branco para os jogadores. Só conta mapa de cena e objeto não oculto **criado pela dona da mesa**: o banco não conhece o manifest, então um jogador que adivinhasse o id poderia inserir um objeto com ele e liberar o arquivo.
- **Segredo por URL:** os arquivos de `_built/` são públicos para quem tem a URL, e a proteção é o nome imprevisível. O middleware responde 404 para todo `/vtt/` fora de `_built/`, que senão serviria os originais por nome. `_built/` vai com `X-Robots-Tag: noindex` e cache imutável. Quem já recebeu uma URL continua podendo abri-la. Os originais ficam no histórico do Git: o repositório precisa ser privado para valer como segredo.
- **Sem linha no banco:** o cliente junta a lista da rota ao que vem de `assets`, nos painéis e em `fetchAssets` (`src/lib/vtt/assets/static.ts`). É isso que impede apagar: `DELETE /api/upload/[id]` não acha linha. A UI mostra o selo "fixo" e não abre o editor; item fixo não tem renomeação nem toggle (a pasta decide a visibilidade), e tags só as de subpasta, em áudio.
- O `id` é um UUID v5 do caminho relativo, sem o prefixo `jogadores/`: liberar um arquivo não quebra o que já está em cena. **Renomear ou mover para outra pasta muda o id**: objetos e mapas que usavam o antigo ficam sem imagem (a linha fica) até o caminho voltar. Se o mesmo caminho existir nos dois lados, vale o da mestra.

## 7. Regras de desempenho (obrigatórias)

1. A rota `/mesa/[id]` carrega Pixi, howler, pdf.js e mammoth **por import dinâmico**; nada disso entra no bundle do resto do site.
2. **Render sob demanda**: nenhum ticker do Pixi roda. `VttEngine.invalidate()` pede um quadro; animações entram com `addAnimation` e mantêm o rAF só enquanto existem. A entrada é própria (o `EventSystem` do Pixi fica sem elemento alvo) e `Ticker.system` fica parado, avançado só em `frame`, porque ele pediria um rAF por quadro para sempre. Parado = 0 quadros e 0 rAF (a legenda ofuscada usa `setInterval`, não rAF contínuo, e troca entre 6 quadros pré-renderizados).
3. `resolution = min(devicePixelRatio, 2)`; em **modo leve**, `min(dpr, 1.25)` e animação a 30 fps. Fora dele, animação com intervalo mínimo de 11 ms: 90 Hz passa inteiro, 144 Hz não desenha 144 quadros.
4. **Modo leve**: liga sozinho se `navigator.hardwareConcurrency <= 4`, `navigator.deviceMemory <= 4`, ou se a média de FPS ficar < 40 por 5 s com efeito ativo (pergunta antes com um aviso "Ativar modo leve?", uma vez por visita e só para quem nunca escolheu no menu; `FpsMonitor`). O usuário pode ligar/desligar na barra de ferramentas (salvo em `localStorage`, try/catch). Modo leve corta partículas em ~70%, usa 1 camada de chuva/neblina, legendas ofuscadas trocando uma vez por segundo, sem glow animado (o Pulsar fica parado).
5. Partículas: **pool** reaproveitado (`Particle` do Pixi), uma única textura-atlas gerada em runtime com `Graphics` (refeita se o contexto WebGL for restaurado), um `ParticleContainer` por emissor, filho do container do dono: posição, giro, escala e flip vêm da hierarquia. Teto global de partículas: 1200 (normal) / 300 (leve). Efeito fora da tela não emite; com nada animado na tela, não há rAF nenhum. Brilho é só um sprite e não pede quadro. Chuva e névoa usam texturas próprias, porque `TilingSprite` não ladrilha recorte de atlas.
6. Chuva e neblina com **TilingSprite** rolando (barato), não com milhares de partículas.
7. Nada de filtros caros do Pixi (Blur/Glow em tempo real). "Brilho" = sprite radial pré-renderizado com blend aditivo.
8. Texturas: destruir ao trocar de cena (mapa antigo via `Assets.unload`). Cache LRU de texturas de token (`TextureStore`, 40 sem uso).
9. React só pros painéis (HUD). O canvas é atualizado pelo store (zustand `subscribe`), **sem re-render do React por frame**.
10. Gestos no touch: 1 dedo arrasta token / desenha (conforme ferramenta), 2 dedos = pan + pinça de zoom, **pressionar e segurar 450 ms = menu de contexto** (igual botão direito).
11. Toda fase termina medindo: abrir a mesa com 1 mapa 4096 px + 15 tokens + chuva + 2 magias ativas no Chrome DevTools com CPU 4× slowdown — mirar ≥ 45 fps e < 300 MB de memória da aba. Reportar os números.

## 7A. Interface da Mesa

> **Fase 12:** o layout abaixo (trilhos, painel de Cenas) foi reorganizado no estilo Roll20. O que vale agora está na seção 13; o resto desta seção continua valendo onde a 13 não diz outra coisa.

Mapa sempre em tela cheia; nada empurra o canvas. Tudo flutua por cima (`FLOATING` e `FLOATING_PANEL`, em `src/components/vtt/hud.tsx`), com o visual do site. Blur só com mouse: no tablet ele pesaria sobre o WebGL.

- **Barra superior** (`TopBar`): voltar, nome, bolinha da sessão; à direita, avatares online (na mestra, abrem Membros e código) e Abrir/Encerrar sessão.
- **Cenas:** o painel tem o seletor "Transição entre cenas", da mesa inteira.
- **Trilhos** (`PanelRail`): direito para todos (Chat, Ficha Rápida, Biblioteca, Iniciativa, Documentos, Relatórios; espectador não vê Ficha nem Biblioteca; a mestra não tem Iniciativa aqui) e esquerdo só da mestra (Cenas, NPCs, Iniciativa, Som, Efeitos de tela). Um painel de ~360 px por lado, todos começam fechados, e clicar no mesmo ícone fecha. O painel só monta quando é aberto pela primeira vez e depois fica montado.
- **Touch** (variante `desk` falsa: sem mouse ou menos de 1024 px): os trilhos viram uma barra fixa embaixo, o painel vira folha de 70% da altura (fecha arrastando para baixo ou no ícone), um por vez no total. Alvos de toque ≥ 44 px.
- **Ícones:** `lucide-react`, importados um a um. Nenhum emoji, fora o que a pessoa escolhe em uma condição personalizada. Os ícones de condição são traços próprios, em `conditions.ts`, usados pelo menu e pelo canvas (`engine/marker-art.ts`). Todo ícone tem `aria-label` e dica (`IconButton`); dentro de área com rolagem a dica é o `title` nativo, porque o balão seria cortado.
- **Barra de ferramentas** (`MapToolbar`): no topo, centralizada: Selecionar, Mover mapa, Desenhar, Borracha, Régua, Ping, Desfazer, Refazer. Opções em popover colado à ferramenta ativa. Cor pessoal, modo leve e volume ficam em ⋯, no canto inferior esquerdo (`SettingsMenu`).
- **Biblioteca** (`LibraryPanel`, dados em `LibrarySync`): a lista inteira fica em `store.library`, carregada em paralelo (`assets` + catálogo) em `requestIdleCallback` ao abrir a mesa, com as miniaturas da primeira tela. Abrir, trocar de aba e buscar não fazem requisição; só relê em upload, aprovação, `asset:resolved`, `scene:assign`, troca de cena do jogador e reconexão. `?debug=perf` na URL da mesa escreve os tempos no console. Único lugar para ver, colocar e gerenciar. Chips por tipo, busca por nome, lista virtualizada com miniatura de 40 px e selo "fixo". Mestra: olho (visível pros jogadores) e ⋯ (renomear, tags, apagar com confirmação), mais a seção Aprovações, com contador também no ícone. Jogador: só token, adereço e addon. Soltar arquivos em qualquer parte do painel envia.
- **Régua:** chip de escala no canto inferior direito ("1 m ≈ X px" ou "Régua não calibrada"). A mestra clica nele, ou em "Calibrar agora" na ferramenta Régua, e entra no guia de dois passos (`CalibrationGuide`), que não cobre o mapa.
- **Menu do token:** o que ainda não existe fica oculto, não desabilitado. Cada fase acrescenta o seu item. Vincular NPC e Adicionar à iniciativa só aparecem em objeto do tipo `token`. Condições: token tem todas, addon só Arma travada e Personalizada (`conditionsForKind`), adereço não tem.
- **Copiar e colar:** Ctrl+C e Ctrl+V (Cmd no Mac), ignorados em campo de texto e com texto marcado; "Duplicar" no menu de contexto. A cópia fica na memória de `SceneSync` e vale para outra cena da mesma mesa. Leva imagem, transformação, legenda, efeitos, condições e os anexos com a mesma posição relativa, sem ficha nem NPC. Copiar um anexo faz um objeto solto. Cola no cursor; sem cursor sobre o mapa, ao lado do original ou, em outra cena, no meio da tela. Passa por `restore_scene_object`, porque o insert normal não aceita anexo, efeitos nem condições, e essa RPC já aplica `can_edit_scene`, `can_place_asset` e o trigger. Um Ctrl+Z apaga a cópia inteira. Limite conhecido: cópia feita por jogador de item fixo só da mestra depende de outro objeto da mestra usando o mesmo arquivo (ver "em uso", seção 6).
- **Ficha Rápida:** seção Mochila (`QuickBackpack`) com itens, peso/limite e dinheiro. Adiciona (nome e peso), remove e edita dinheiro; a descrição só se lê aqui e se escreve na ficha.
- **Magias ▸ e Efeitos ▸** (token e addon; adereço não tem): toggle que fica ligado até alguém desligar. A busca de magias acha todas; a de outro alvo não liga, e a lista diz onde ela funciona. Magias em `fx/spells.ts`, presets em `fx/presets.ts`: distâncias em unidades de meia imagem do dono, preset novo é só mais um objeto. Brilho e Pulsar têm cores fixas para escolher.
- **Som** (`SoundPanel`, só mestra): volume geral, fade, camadas da cena aberta (volume, alvo e remover) e grade de SFX com alvo, busca, categoria e favoritos (favoritos em `localStorage`). Cada pessoa tem o próprio volume e mudo em ⋯ (`vtt:audio`, em `localStorage`), que não afeta os outros.
- **Categorias de som** (`AUDIO_CATEGORIES`): tags fixas, filtro no Som e na Biblioteca. Na Biblioteca, enviar em lote com um filtro de som aberto usa aquele tipo, e com uma categoria marcada a aplica aos arquivos. Item fixo ganha as tags das subpastas: `public/vtt/sfx/Passos/x.ogg` entra em Passos.
- **Efeitos de tela** (`WeatherPanel`, só mestra): clima da cena aberta, cumulativo, em espaço de tela sobre o mapa e sob o HUD. Trocar de cena ou de intensidade chega ao alvo por fade.
- **Iluminação** (`fx/lighting.ts`, mesmo painel): um sprite de tela cheia em `multiply`, acima de mapa e tokens e abaixo do clima. Sem filtro, e parado não pede quadro. O Crepúsculo usa uma textura de gradiente de 2×64 px esticada. Alpha máximo 0,95. Trocar de cor apaga, troca e acende. Vale também para a mestra. Fase 11: a lanterna fura trocando a textura de `darkness` por uma RenderTexture com furos em `erase`.
- **Marcas no token** (camada própria do canvas, tamanho fixo na tela, sem girar junto): condições em arco acima (6 + "+N", nome ao passar o mouse ou tocar), anel do turno atual (sprite pré-renderizado) e, só para a mestra, barrinha de HP do NPC na base.
- **Documentos** (`DocumentsPanel`): filtros Todos, Cartas, Provas, Pistas e Referências. A mestra envia na categoria do filtro aberto (sem filtro, em Cartas); jogador, só em Referências (PDF, imagem, áudio), e vê o próprio envio como "Aguardando aprovação". Imagem é reduzida a 2048 px no envio. Pendentes aparecem para a mestra aqui e em Aprovações, na Biblioteca, com contador no ícone da Biblioteca.
- **Relatórios** (`ReportsPanel`): .docx, .pdf, .md ou .txt, com título e personagem opcional, sem aprovação, mais novo primeiro. Espectador só lê.
- **Visualizador** (`DocumentViewer`): tela cheia, acima do HUD e abaixo do "Entrar na sessão", com baixar e fechar; cada um fecha o seu. Imagem e PDF usam `ZoomPan` (pinça, roda, duplo clique e botões, por CSS). PDF: pdf.js, uma página em canvas por vez, com teto de 12 MP (5 MP no modo leve), `disableAutoFetch` e `isEvalSupported: false`; nunca `<iframe>`. .docx: mammoth, e o HTML sempre passa por DOMPurify. .md: `react-markdown` sem HTML cru. .txt: UTF-8, com fallback para Windows-1252.
- **Worker do pdf.js:** `scripts/copy-pdf-worker.mjs` (no `dev` e no `build`) copia o worker para `public/pdfjs/` com a versão no nome, fora do Git. Pelo webpack, o Terser do Next 14 quebra o build ao minificar o `.mjs`. Usa o build `legacy` do `pdfjs-dist` 4.x, para aparelhos com navegador mais antigo. Ao atualizar o pacote, o caminho acompanha `pdfjs.version`.
- **Regra geral:** todo estado vazio ou bloqueado diz o que fazer e onde.

## 8. Estrutura de pastas sugerida

```
src/app/mesa/page.tsx
src/app/mesa/[id]/page.tsx            (server: checa membro, carrega snapshot)
src/components/vtt/                   (HUD React: painéis, menus, modais)
src/lib/vtt/                          (store, events, realtime, engine Pixi)
src/lib/vtt/engine/                   (stage, camera, input, textures, caption-art)
src/lib/vtt/fx/                       (partículas, presets, clima)
src/lib/vtt/audio/
src/lib/storage/
```

## 9. Convenções

- Tudo tipado; nada de `any` novo.
- Toda string de UI em pt-BR.
- Testes Vitest pras funções puras (parser de dados, cálculos de NPC, transformações de anexo, simplificação de traço, régua).
- Cada fase: `npm run lint`, `npm test`, `npm run build` passando. Sem push. Resumo final + SQL a rodar + números de desempenho.

## 10. Símbolos dos elementos (site inteiro)

- `src/components/elements/ElementSymbol.tsx`: os 11 símbolos alquímicos em SVG (grid 100×100, traço em `currentColor` na cor de `ELEMENT_COLORS`). **Desenhos aprovados pela mestra: não alterar a geometria.** Props: `size` (px), `glow`, `pulse`, `inline` (1em, alinhado ao texto), `decorative` (`aria-hidden`, para quando o nome vem escrito ao lado).
- **Glow é estático** (CSS `drop-shadow` em 2 camadas na cor do elemento, `glowFilter`). Sombra, Sangue, Água e Terra são escuras demais para o fundo: o glow delas é um halo claro translúcido, e mesmo sem glow levam um contorno claro de 1 px. `pulse` é uma animação única de 0,7 s (`.element-symbol-pulse`, só `transform`) ao subir de nível, desligada com `prefers-reduced-motion`. Nada de animação contínua.
- Onde aparece: ficha → Elementos e Fragmentos (com glow, 30 px na barra, 20 px no "+ Adicionar elemento"; só os elementos que a ficha tem); sem glow, 18–20 px, na legenda do Mosaico (elementos com nível > 0), ao lado do seletor de elemento das Magias e na Ficha Rápida da Mesa (que por isso lê `character_elements(element, level)`).
- MDX: `mdx-components.tsx` registra `ElementSymbol` (inline e decorativo por padrão) e `ElementsTable` (tabela "Os 11 elementos" de Regras). Símbolo inline só onde a palavra é **o elemento**, nunca em uso comum ("arma de fogo", "sede por sangue").
- `public/simbolos/{elemento}.svg`: os mesmos desenhos soltos, cor fixa e fundo transparente, para uso fora do site. São gerados do componente: `UPDATE_SYMBOLS=1 npx vitest run src/components/elements` regrava, e o teste falha se os arquivos divergirem do componente.

## 11. Desempenho do site fora da Mesa

- **Supabase fora do primeiro carregamento:** componente cliente que só fala com o banco depois de montar ou de um clique usa `loadSupabase()` de `src/lib/supabase/lazy.ts`, nunca `import { createClient }` estático (~60 KB gz). Formulários chamam `preloadSupabase()` num `useEffect` (baixa no ocioso). O `Nav` já carrega o cliente por `import()` em toda página.
- **Nada de framer-motion no primeiro carregamento** das páginas comuns: animação simples (largura de barra, entrada de aviso ou resultado) é CSS em `globals.css`, só `transform`/`opacity` (a largura da barra de fragmentos é a exceção, e só muda quando os fragmentos mudam). Toda animação CSS nova entra no bloco `prefers-reduced-motion` de lá. framer-motion fica para `MosaicFrame` e `DiceToastStack` (ambos `dynamic`) e `/rolagens`.
- **Ficha** (`CharacterSheet`): seções `memo` recebem só a fatia que usam, callbacks estáveis (`patch`, `handlers`), save agrupado de 700 ms; aba fora da ativa não monta. Coluna nova da ficha entra em `SHEET_COLUMNS` (`src/app/fichas/[id]/page.tsx`): nenhum `select('*')` em tela de usuário.
- Fontes por `next/font` (`display: swap`), só pesos usados. Lexend e Cormorant são variáveis: tirar peso não reduz bytes, só o intervalo declarado.

## 12. Gerador de mapas (`maps/`)

Mapas táticos top-down gerados a partir de YAML, no estilo dos mapas do Dungeon Alchemist (`public/vtt/jogadores/mapas/`): texturas fotográficas, sombra de dia já desenhada, muito detalhe. Roda só local, em Node (`@napi-rs/canvas` + `sharp`); nada disso entra no site.

- **Pastas:** `maps/specs/*.yaml` (um mapa por arquivo), `maps/assets/textures.json` (material → textura, ajustes, licença), `maps/assets/textures/` (baixadas, fora do Git), `maps/assets/props/<tipo>.png` (opcional: troca o desenho procedural daquele tipo, ver o README da pasta), `maps/src/` (motor), `maps/out/` (prévias, fora do Git).
- **Comandos:** `npm run maps:assets` baixa as texturas (`-- --force` rebaixa); `npm run maps:build -- <id|arquivo|all> [--variant <id|base>] [--seed <n>] [--png]`; `npm run maps:watch -- <id>` regera ao salvar o YAML; `npm run maps:preview` abre `http://localhost:4178` com os mapas lado a lado e seletor de variante. Depois de gerar, `npm run vtt:manifest` põe os mapas na Biblioteca.
- **YAML:** metros, origem no canto superior esquerdo, x → leste, y → sul. `rect`/`area`/`scatter_area` são `[x0, y0, x1, y1]`; `circle`/`scatter_*` são `[cx, cy, r]`. `rot` em graus no sentido horário, 0 = frente para o norte. `sun.azimuth_deg` é de bússola (135 = luz de sudeste, sombra para noroeste). Arco de `terraces`: 0° = leste, 90° = norte (anti-horário na tela). Balcão (`path` + `depth`): `path` é a linha do meio. Validação com zod: o erro diz arquivo, linha e campo, e lista os tipos conhecidos. A disposição do YAML é da mestra; o motor só faz **ajuste fino** (empurra móvel para fora da parede, tira objeto de parede de cima de janela/porta) e avisa no log quanto moveu.
- **Saída:** `public/vtt/mapas/cineres/<id>.webp` (visibility `mestra`; `jogadores` vai para `public/vtt/jogadores/mapas/cineres/`), `<id>.<variante>.webp` para cada variante com `add`/`remove` (variante sem mudança, como "noite", não é gerada), e `<id>[.<variante>].meta.json` com `{ id, title, variant, seed, size_m, px_per_m, meters_per_px, width, height }`. Maior lado ≤ 4096 px: se passar, `px_per_m` cai e o log avisa.
- **Régua calibrada:** o manifest copia `meters_per_px` do meta para o item estático; criar cena com esse mapa (ou trocar o mapa da cena para ele) grava `scenes.meters_per_px` (`presetMetersPerPx`, `SceneSync.mapPresetScale`). Mapa sem meta continua nascendo sem calibração.
- **Camadas, nesta ordem:** chão (material com duas cópias do ladrilho misturadas por ruído, textura secundária e variação de tom; material em grade só desloca por ladrilho inteiro; borda natural esfiapada) com o detalhe do material (trevo, flores, tufos, folhas, ervas nas juntas, remendos) → decalques (trilha, arrasto, pegadas, musgo do chão) → muros de pedra/terraços → edificação (piso, paredes derivadas dos cômodos, portas, janelas, ou telhado de quatro águas com cumeeira, calha, chaminé, antena, lona) → objetos → vegetação (copa por cima de tudo) → luz.
- **Luz:** cada desenho escreve cor e altura (coluna cheia, volume flutuante com topo e base, ou campo analítico em float para telhado, pedra e copa). A sombra é um raymarch para o sol numa grade reduzida (~200 passos até a altura máxima, ≤ 3 Mpx) com penumbra que abre com a distância; AO pela diferença entre a altura local e a média da vizinhança; relevo pela normal do mapa de alturas; o terreno (`terrain: bowl`) só entra no sombreamento, exagerado, sem curva de nível. Dentro de casa a sombra é mais clara (luz rebatida). Alturas: parede 2,8 m, porta 2,1 m, peitoril 0,9 m, mesa ~0,77 m, carro ~1,5 m, beiral = andares × 3 m + 0,4.
- **Semente:** `seed` do YAML ou hash do `id`; `--seed` sobrepõe. Cada camada usa um gerador derivado com nome (`rng.fork`), então mexer num objeto não muda as folhas do outro lado do mapa. Mesma semente = mesma imagem (teste em `maps/src/maps.test.ts`).
- **Regras invioláveis:** nenhum texto, número, logotipo ou letra legível (placa, cartaz, jornal e viatura têm só manchas e faixas); sem grade; vista exatamente de cima.
- **Texturas:** só CC0, de Poly Haven e ambientCG, 1K, cor + AO (multiplicada na cor). `size_m` de cada textura é o tamanho real: é ela que põe 25 cm de tijolo em 25 cm. Textura que faltar vira cor lisa com aviso.
- **Novo tipo:** objeto em `maps/src/props/*.ts` (registro `PropDef`: `needs`, `size`, `phase`, `draw`), feature em `features.ts`, vegetação em `vegetation.ts` (`SPECIES`), material em `textures.json`. O schema lê os registros: tipo novo já valida.

## 13. Interface no estilo Roll20 (Fase 12)

Reorganização de layout e fluxo. Realtime, banco, assets, áudio, chat e rolagens não mudaram: os painéis são os mesmos componentes, em outro lugar.

### Layout

- **Saíram** os trilhos (`PanelRail`: `IconRail`, `PanelHost`, `RailBottomBar`) e o painel de Cenas (`ScenesPanel`). No celular não há mais barra inferior.
- **Canto superior esquerdo** (`TopBar`): voltar, nome e bolinha da sessão. Logo abaixo (ao lado, no celular), só para a mestra, `GmHud`: botão do **HUD da mestra** e botão **Páginas** (atalho `P`, ignorado em campo de texto e com Ctrl/Alt/Cmd).
- **Barra lateral direita** (`RightSidebar`): fixa na direita, ícones-aba no topo. Recolhida, vira uma tira de 48 px com os ícones; aberta, tem largura de 280 a 560 px (arrastar a borda esquerda, padrão 360). Aberta/fechada e largura em `vtt:ui:sidebar`, aba ativa em `vtt:ui:sidebar-tab` (`localStorage`, try/catch).
  - A barra **flutua sobre o mapa**: o canvas continua em tela cheia e não é redimensionado ao abrir, fechar ou mudar a largura. O espaço ocupado vai para a variável CSS `--vtt-right` no elemento raiz da Mesa (escrita direto no DOM, sem re-render do `VttShell`), usada pela barra de ferramentas (centralizada no que sobra; no desktop nunca à esquerda de 30rem, para não cobrir o título), pela faixa de avisos, pelo chip de escala, pelo grupo direito do topo e pelos toasts. Arrastar a borda só mexe no estilo e grava no `pointerup`.
  - **Celular** (fora da variante `desk`): fechada por padrão (não lê o "aberta" salvo), com a tira de ícones no meio da borda direita. Aberta, é uma gaveta de até 26rem por cima do mapa, com fundo que fecha ao tocar. Colocar um item pela Biblioteca fecha a gaveta.
  - Cada aba (e subaba) só monta na primeira abertura e depois fica montada, como antes.
- **Abas**, nesta ordem: **Chat** (`ChatPanel`, padrão, badge de não lido); **Ficha rápida** (`QuickSheet` + `QuickBackpack`; espectador não tem); **Biblioteca** (só mestra, contador de aprovações); **Documentos e relatórios** (subabas `DocumentsPanel` e `ReportsPanel`, `vtt:ui:docs-tab`); **Som e efeitos de tela** (só mestra, subabas `SoundPanel` e `WeatherPanel`, `vtt:ui:media-tab`). Jogador vê Chat, Ficha rápida e Documentos e relatórios. `chatVisible` = barra aberta na aba Chat. `EffectsMenus` continua sendo o menu de magias/efeitos do token (menu de contexto), não um painel.
- **Jogador perdeu a Biblioteca** (antes colocava token, adereço e addon por ela). Soltar arquivo direto no mapa continua funcionando no desktop.
- **HUD da mestra** (`GmHud`): painel flutuante, não modal, com subabas Iniciativa (`InitiativePanel`) e NPCs (`NpcPanel`; `NpcLinkModal` continua montado no `VttShell`). Fecha no botão ou no X. Aberto e subaba em `vtt:ui:gm-hud`. No celular vira folha inferior de 60%.
- **Iniciativa do jogador** (`InitiativeStrip`): sem a aba, quem não é a mestra vê uma faixa compacta, só leitura, sob a barra de ferramentas, só quando há entradas: rodada e até 6 nomes a partir do turno atual, "+N" para o resto. Os nomes já vêm da coluna (`???` para oculto/ofuscado).
- **Para onde foi o resto:** Membros e código continuam nos avatares do topo (mestra); Aprovações continuam na Biblioteca; ⋯ (cor, modo leve, volume) no canto inferior esquerdo; chip de escala no canto inferior direito.

### Páginas

No banco continua `scenes`; na interface é **Página**. A "cena padrão" (`tables.default_scene_id`) é a **fita dos jogadores** (Party Ribbon).

- **Overlay** (`pages/PagesOverlay`, import dinâmico, só a mestra; `store.pagesOpen`): modal quase em tela cheia. Esc fecha o que estiver por cima (menu, modal, depois o overlay); campo de texto não fecha. Coluna esquerda: Todas, pastas (um nível só) com contador, Nova pasta, Arquivadas. Topo: busca (sem acento nem caixa) e "+ Criar página". Centro: grade de cards médios (~10,5rem) com a miniatura do mapa (a de 96/256 px que já existe, `object-cover`). Em "Todas" sem busca, as pastas aparecem como cards de pasta e só as páginas soltas aparecem; com busca, procura em tudo do lado escolhido (arquivadas ou não). Regras puras em `src/lib/vtt/pages.ts` (testes em `pages.test.ts`).
- **Clicar num card leva só a mestra** (`gmSceneChoice`) e fecha o overlay. Os jogadores não mudam.
- **Fita:** bandeirinha amarela "Jogadores" no card da página da fita. Arrastar a fita para outro card, ou "Mover jogadores para cá", chama `SceneSync.movePartyTo`: zera `table_members.scene_id` de todos e grava `default_scene_id`, com um único `scene:assign`. Cada cliente aplica a transição configurada sozinho, como antes.
- **Separar grupo saiu da interface.** `table_members.scene_id` continua no banco (e no RLS) sem uso pela UI; `movePartyTo` o limpa.
- **Menu do card** (⋯ no hover, sempre visível no touch, e clique direito): Mover jogadores para cá, Configurações, Renomear (no próprio card), Duplicar, Mover para pasta, Arquivar/Desarquivar, Apagar. A página da fita não pode ser arquivada nem apagada (menu desabilitado, e `SceneSync.setArchived`/`deleteScene` recusam com aviso). Apagar e apagar pasta pedem confirmação em `ConfirmDialog` (nunca `window.confirm`).
- **Arrastar e soltar** (só mouse; no touch ficam as opções do menu): card sobre card reordena (`reorderScenes`; em outra pasta, leva para a pasta do alvo); card sobre pasta (card ou coluna) move para ela; sobre "Todas", tira da pasta; sobre "Arquivadas", arquiva. Tipos próprios no `dataTransfer` (`application/x-vtt-page`, `application/x-vtt-ribbon`).
- **Pastas:** a ordem e as pastas vazias ficam em `tables.scene_folders` (jsonb, lista de nomes); `scenes.folder` continua sendo o nome da pasta de cada página. Renomear pasta atualiza as páginas e a lista; apagar pasta devolve as páginas para "Todas" (nenhuma página é apagada). Pasta que só existe em alguma página (de antes da Fase 12) entra no fim da lista, em ordem alfabética. Pastas e calibrações são lidas por `SceneSync.loadPagesMeta` a cada abertura do overlay.
- **Arquivar:** `scenes.archived`. Arquivar a página aberta pela mestra a devolve para onde está a fita.
- **Faixa "Você está em / Jogadores em"** (`SceneViewBanner`): só para a mestra, quando a página vista não é a da fita. Botões "Voltar para os jogadores" (limpa `gmSceneChoice`) e "Trazer jogadores pra cá" (`movePartyTo`).
- **Criar página** (`pages/CreatePageModal`): nome, pasta (padrão: a pasta aberta) e "Em branco" (sem mapa, fundo neutro de 2000 px) ou "A partir de um mapa" (grade de miniaturas da Biblioteca, só mapas, com busca; escolher preenche o nome se estiver vazio). Depois de criar, só a mestra vai para a página nova; a fita só se mexe se for a primeira página da mesa.
- **Configurações da página** (`pages/PageSettingsModal`): nome e pasta; mapa (trocar ou remover, com confirmação); escala e grade; iluminação (`LightingSection`, a mesma do painel de Efeitos); nota sobre o som ambiente (já era da página, `scenes.ambient`: monta-se na aba Som com a página aberta); transição.
- **Transição continua da mesa inteira** (`tables.scene_transition`), agora nas Configurações da página com a nota "vale para todas as páginas". Por página não funcionaria: o cliente do jogador escolhe a cobertura antes de ler a página nova, e o RLS só deixa ele ler a página depois de estar nela.

### Escala automática (Dungeon Alchemist)

- Padrão da mesa: **1 quadrado = 1,5 m** (`TILE_METERS`). O chip mostra "1 quadrado (1,5 m) ≈ X px".
- **Não dá para inferir pelo pixel:** os exports do Dungeon Alchemist chegam reduzidos (os de `public/vtt/jogadores/mapas/` têm 4096×2309; o upload e o manifest cortam em 4096 px), então o tamanho do quadrado em pixels se perde, e o nome do arquivo não traz nada. Nenhuma heurística.
- **A calibração fica no mapa:** tabela `map_calibrations (asset_id, meters_per_px)`, sem FK (vale para id de `assets` e do manifest), só a mestra lê e grava. Calibrar a página (régua, chip, configurações) grava `scenes.meters_per_px` e também o mapa (`SceneSync.saveScale`).
- **Ao criar a página ou trocar o mapa**, a escala vem de `map_calibrations` e, sem ela, do `meters_per_px` do manifest (mapas do gerador, seção 12). Sem nenhuma, a página nasce e abre o guia de calibração uma vez.
- **Guia de calibração** (`CalibrationGuide`): arrastar e dizer a medida em **quadrados** (padrão) ou metros; ou digitar a **largura do mapa inteiro em quadrados** (o Dungeon Alchemist mostra esse número, e ele continua valendo depois de reduzir a imagem): `meters_per_px = quadrados × 1,5 / largura da imagem` (`metersPerPxFromTiles`). O mesmo campo está nas Configurações da página.

### Grade e mapa travado

- **Grade** (`scenes.grid_visible`, toggle nas Configurações, só com régua calibrada): `Graphics` no `mapLayer`, acima do mapa e abaixo de tudo o que é interativo, linhas a cada 1,5 m a partir do canto do mapa. Redesenhada só quando muda (célula ou tamanho do mapa); parada não pede quadro. Quadrado menor que 8 px na imagem não desenha.
- **Mapa sempre travado:** a imagem fica no `mapLayer` e nunca é objeto: `objectAt` só olha `scene_objects`, e `isPlaceableKind` recusa `mapa`. Nem a mestra seleciona, arrasta ou redimensiona. Trocar só pelas Configurações da página.

### Banco (migração 022)

- `scenes.archived boolean not null default false` e `scenes.grid_visible boolean not null default false`, com `grant select` (privilégio por coluna). `duplicate_scene` copia `grid_visible`; a cópia nasce desarquivada.
- `tables.scene_folders jsonb not null default '[]'`, conferida por `is_valid_scene_folders` (lista de textos de 1 a 80 caracteres, até 4 KB), com `grant select/update`. Fica fora de `TABLE_COLUMNS`.
- `map_calibrations`, RLS `is_mestre()` em tudo, `anon` sem privilégio.
- **Sem a migração** a Mesa continua abrindo: `fetchScenes` cai para as colunas antigas (`42703`/`PGRST204`) e preenche `archived`/`grid_visible` com `false`; arquivar, grade e pastas avisam qual arquivo rodar. Nenhuma política existente mudou.

## 14. V.M. — Visão da Mestra (Fase 13)

Painel só da mestra em `/vm`: grupos de personagens em cards, atualizando em tempo real. Fica fora da Mesa e não muda a ficha.

### Rolagens

- **A página `/rolagens` saiu** (link, rota e `LiveRollsFeed`). As rolagens da Mesa aparecem no chat da sessão.
- **`dice_rolls` continua recebendo gravações** de `logDiceRoll` (`ChatSync.roll` e `DiceToast` da ficha), mas nada lê a tabela. Rolagem feita na ficha fora da Mesa só ia para lá: hoje ela não aparece em lugar nenhum. A tabela não foi dropada (decisão da mestra).

### Acesso

- Link **V.M.** no menu do topo só com `profiles.role = 'mestre'`.
- `src/app/vm/page.tsx` confere o papel no servidor e chama `notFound()` para quem não é mestra; o middleware manda quem está sem login para `/login`. O RLS de `gm_groups` é a terceira barreira.

### Banco (migração 023)

- **`gm_groups`**: `id`, `owner_id` (default `auth.uid()`, FK `profiles` on delete cascade), `name` (1–80), `sort_order`, `created_at`. Cada mestra tem os próprios grupos.
- **`gm_group_members`**: `group_id` (on delete cascade), `section` (`pj`|`npc`), `character_id` (FK `characters` on delete cascade) **ou** `npc_id` (FK `npcs` on delete cascade), `sort_order`. Exatamente um alvo; NPC da Mesa só na seção `npc`; o mesmo personagem só uma vez por grupo (índices únicos parciais), mas pode estar em vários grupos. Apagar o personagem tira ele de todos os grupos; apagar o grupo não apaga ninguém.
- **RLS**: grupo é `owner_id = (select auth.uid()) and (select is_mestre())`; membro passa por `exists` no grupo e, ao gravar, no personagem/NPC (pelo RLS deles). `anon` sem privilégio.
- **Realtime**: `character_elements` e `npcs` entraram na publication `supabase_realtime` (`characters` já estava). O RLS de leitura já existente (`characters_select`, `character_elements_select`, `profiles_select` com `is_mestre()`; `npcs_gm_all`) não mudou.

### NPCs

- Duas fontes: **fichas do site da própria mestra** (`characters.owner_id = ela`, card completo, clicável, subtítulo "NPC") e **NPCs da Mesa** (`npcs` das mesas que ela mestra). NPC da Mesa não tem mana, sanidade, foto nem elementos: o card mostra só Vida (máximo de `hp_max`), tier/ND, a mesa e os atributos (array na ordem FOR, CON, DES, INT, EDU, CAR, POD), e **não tem clique** (não existe página de ficha dele).

### Card (`src/components/vm/VmCard.tsx`, só leitura)

- Foto redonda (`image_url` válido por `VALID_IMAGE_URL`) ou círculo com a inicial. Nome; embaixo, o `display_name` do dono (PJ) ou "NPC".
- Vida, Mana e Sanidade: só o número atual. **Máximos de `getEffectiveMaxes`** (nível pelos elementos + atributos + `resource_mods`), como a ficha — as colunas `*_max` não valem. Cor: padrão de cada recurso; `< 50%` amarelo; `< 25%` vermelho (`resourceTone`). Máximo no `title` ("24 / 40").
- Tags de elemento: `ElementSymbol` + nome + nível, cor do elemento, maior nível primeiro, nível 0 escondido.
- Rodapé: FOR, DES, CON, INT, EDU, POD, CAR.
- Clique abre `/fichas/[id]` na mesma aba. Setas ← → e ✕ ficam fora do link (no desktop, aparecem no hover/foco).
- Grade: 1 coluna no celular, 2 a partir de `md`, 3 a partir de `xl`.

### Tempo real (`src/components/vm/useVmGroup.ts`)

- Um canal por grupo aberto; trocar de grupo remove o anterior. A chave do canal são os ids (reordenar não reassina).
- `characters` UPDATE e `character_elements` INSERT/UPDATE com filtro `in.(ids do grupo)`; `npcs` UPDATE com `id=in.(…)`.
- DELETE não aceita filtro e, sem `replica identity full`, só traz o id: `character_elements` DELETE é casado com os ids que o grupo já tem (o resto é ignorado); `characters`/`npcs` DELETE tiram o card da tela (o FK já tirou do grupo). Não usamos `replica identity full` para não espalhar a linha apagada.
- A ficha grava `characters` antes de `character_elements`, por isso as duas tabelas são assinadas em vez de reler no UPDATE.
- **Queda**: `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` marca o canal como caído; ao voltar a `SUBSCRIBED`, ao ficar visível ou no evento `online`, relê o grupo inteiro (e reassina se caiu). Aba escondida por mais de 5 s também relê ao voltar. Sem polling.
- Estado em `Record<id, …>`: um evento troca só aquela entrada; os cards são `memo` com props planas e callbacks estáveis, então os outros não re-renderizam.

### Interface (`GmView`)

- Abas de grupo, **+ Novo grupo** e menu ⋯ (renomear, mover para esquerda/direita, apagar). Apagar confirma no `ConfirmDialog` da Mesa; renomear/criar e o seletor usam `VmModal`. Nenhum diálogo nativo.
- Último grupo aberto em `localStorage` (`vm:last-group`, com try/catch).
- Seletor de membro com busca (foto, nome, nome do perfil); fica aberto para adicionar vários; quem já está no grupo aparece marcado.
- Estados: sem grupos (botão "Criar primeiro grupo"), seção vazia (botão "+ Adicionar PJ/NPC" no título da seção), erro de carga com "Tentar de novo".

## 14. Hover e seleção múltipla (Fase 12b)

### Hover

- Só com a ferramenta **Selecionar**, mouse (no touch não há hover) e quem pode editar (espectador não). O `EngineInput` guarda a última posição e faz **no máximo um hit-test por quadro** (`requestAnimationFrame`), com os mesmos bounds de `objectAt`; parado, nada roda.
- Cursor: `grab` sobre objeto, `grabbing` arrastando; nas alças, `nwse-resize`/`nesw-resize` conforme a diagonal real do canto (vale com o objeto girado) e uma seta curva em SVG (`ROTATE_CURSOR`, reserva `grab`) na alça de giro; `default` no resto. Com a Mão (ou Espaço), sempre `grab`/`grabbing` e nada recebe hover. Outras ferramentas, anexar, colocar e calibrar continuam em `crosshair`.
- Contorno de hover (`VttEngine.setHover`): um `Graphics` próprio na `uiLayer`, cor pergaminho com alpha 0,55, mais fino que o de seleção, redesenhado só quando muda o objeto sob o mouse (ou o objeto/zoom muda). Objeto já selecionado não ganha hover. O **mapa nunca** recebe hover: não é objeto.
- Jogador recebe hover e pega **qualquer objeto que vê**, como sempre (SPEC §4: mover é de todos; apagar, só o que criou).

### Seleção

- `store.selectedIds: string[]` substituiu `selectedId`. `soleSelectedId(state)` dá o único selecionado, para o que só faz sentido com um (alças, legenda, anexar).
- Clique seleciona só o objeto. **Shift ou Ctrl/Cmd + clique** põe ou tira da seleção, sem arrastar. Clique sem arrastar num item de um grupo, no soltar, deixa só ele.
- **Caixa de seleção** (mouse): arrastar no vazio. Só vale depois da folga do clique (10 px); antes disso é clique, e clique no vazio limpa a seleção (com Shift/Ctrl, mantém). Retângulo crimson com preenchimento de 12% (`VttEngine.setMarquee`). Ao soltar, entra tudo que **encosta** na caixa: teste de separação de eixos entre os 4 cantos girados do objeto e a caixa (`polygonTouchesBox`, `src/lib/vtt/selection.ts`), então o canto vazio de um objeto girado não conta. Com Shift/Ctrl, soma à seleção que havia.
- **Touch:** toque seleciona; **segurar 450 ms no vazio** e arrastar faz a caixa (vibra de leve, se o aparelho deixar); segurar sobre objeto continua abrindo o menu; arrastar um dedo no vazio sem segurar não faz nada; dois dedos continuam pan e pinça.
- **Esc** limpa. **Ctrl+A** (Cmd+A) seleciona todos os objetos da página e passa para Selecionar.
- **Limite de 50** (`MAX_SELECTION`, o mesmo da RPC). Caixa e Ctrl+A que passem disso ficam com os 50 primeiros (de cima para baixo) e mostram o aviso "Seleção limitada a 50 objetos (havia N)."; Shift+clique além do limite não entra e mostra o mesmo aviso.
- Desenho: com vários, cada um ganha o contorno crimson; as alças só aparecem com exatamente um.
- **Escalar o grupo** (acréscimo): com 2 ou mais, aparece também a caixa do grupo (retângulo alinhado aos eixos que envolve todos, `VttEngine.groupBounds`) com 4 cantos, sem alça de giro. Arrastar um canto escala todas as raízes a partir do centro da caixa: cada uma multiplica a escala pelo mesmo fator, e a distância até o centro também, então ninguém encosta em ninguém. Nenhum objeto passa do mínimo de escala de sempre. Os outros veem o resultado ao soltar (como na alça de um objeto só), numa gravação e num passo de desfazer.
- **Teclado só no mapa:** setinhas e Ctrl+A só valem com o foco no mapa (ou em lugar nenhum); na barra lateral as setinhas rolam a lista e o Ctrl+A seleciona texto. Com o overlay de Páginas aberto, nenhum atalho do mapa vale (Delete não apaga nada escondido atrás dele).

### Grupo

- **Raízes:** objeto anexado a outro que também está na seleção vai junto com o pai e não se move sozinho (`selectionRoots`); senão andaria duas vezes. Copiar, duplicar e girar também usam as raízes.
- **Arrastar** qualquer selecionado move todas as raízes pelo mesmo deslocamento no mundo, mantendo a posição relativa. Não há snap na grade (não existia).
- **Delete/Backspace:** apaga o que a pessoa pode apagar; o resto fica, com aviso ("Apagando 2 de 5: você só pode apagar o que criou.").
- **Q/E** giram cada raiz em torno do próprio centro.
- **Setinhas** (novo): 1 quadrado (1,5 m) com a régua calibrada, ou 10 px de tela sem ela; **Shift** dá o passo fino (2 px de tela). Movem na hora e transmitem como arraste; gravam uma vez, 350 ms depois da última tecla (`SceneSync.nudge`), num passo só.
- **Ctrl+C / Ctrl+V / Duplicar:** copia cada família (raiz + anexos) e cola mantendo a posição relativa ao primeiro; a seleção vira o que foi colado.
- **Menu de contexto** num item do grupo (2 ou mais): "N objetos selecionados", girar, duplicar, Condições ▸ (só as que valem para todos os tipos; marcada = todos têm; tocar liga em todos se algum não tem, desliga se todos têm), Ocultar/Mostrar todos (mestra, leva as famílias), Apagar N (ou "N de M"). Legenda, anexar, NPC, magias, efeitos e transformações só com um. "Token selecionado" na Iniciativa aceita vários (só os do tipo token).
- **Desfazer:** mover, girar, setinhas, condição, ocultar, apagar, colar e duplicar um grupo são **um passo só** (`batch`). Desfazer/refazer um `batch` só de patches grava numa chamada.

### Rede

- **Arrastando:** `obj:drag-many {sceneId, items: [{id, x, y}]}`, até 50, com o mesmo throttle de 50 ms do arraste de um: um broadcast por tique para o grupo inteiro (um objeto só continua saindo como `obj:drag`). Objeto oculto ou página sem plateia não entra no evento, como antes. Quem recebe valida (array, até 50, números finitos), ignora o que está na própria mão e aplica num `setState` só.
- **Ao soltar:** a RPC `patch_scene_objects(p_patches jsonb)` (migração 023) grava o grupo inteiro numa chamada e devolve as linhas; sai **um** `obj:upsert-many {objects}` com as linhas visíveis de página com plateia, e um `scene:refresh` por página para o que é segredo. Quem recebe valida cada linha (`isValidObject`), aplica last-write-wins e faz um `setState` só.
- A RPC é `security invoker`: roda com as permissões de quem chama, então o RLS de `scene_objects`, o privilégio por coluna e o trigger `guard_scene_object` valem como num update comum (jogador não oculta, espectador não muda nada, linha que o RLS esconde não muda nem volta). Grava só `x, y, rotation, scale, flip_x, flip_y, local, hidden, conditions`; lote com outro campo cai para um update por objeto. Recusa mais de 50 itens ou formato errado (`invalid_patches`). Sem a migração, o cliente faz um update por objeto em paralelo e avisa uma vez.
- `SceneSync.interacting` é um conjunto: tudo o que está na mão (arrasto, alças, setinhas) não aceita evento de fora até o banco responder, e a releitura mantém esses objetos como estão na tela.
- Ocultar uma família com mais de 50 grava em partes de 50, mas continua um passo só.

### Banco (migração 023)

- Só a função `patch_scene_objects(jsonb) returns setof scene_objects`, `security invoker`, `execute` só para `authenticated`. Nenhuma política nem privilégio mudou. Testes em `supabase/rls.test.ts` ("seleção múltipla").

## 15. Névoa de guerra (Fase 11)

> Versão 2 do prompt 11, feita sobre a UI das fases 12 e 12b. A lanterna (cone que revela temporariamente) ficou para outra fase.

### Ligar, desligar e duplicar

- A névoa é **por página** e fica em `scenes.fog`, a coluna que existia desde a 010 sem uso. Nula = sem névoa. **Página nova nasce sem névoa.**
- Interruptor "Névoa de guerra" nas **Configurações da página** (`FogSection`, em `pages/PageSettingsModal`). **Ligar grava a máscara toda coberta**, do tamanho do mapa da página (ou 2000 px, página em branco). **Desligar pede confirmação** e grava nula: o que foi revelado se perde. Os traços de névoa daquela página saem da pilha de desfazer (`SceneSync.dropFogHistory`).
- Página que não está aberta: as Configurações só perguntam se há névoa (`select('fog_w:fog->w')`), sem baixar a máscara.
- **Duplicar página copia a névoa**: `duplicate_scene` já copiava `fog`.
- Trocar o mapa da página não mexe na máscara: ela se estica sobre o mapa novo.

### Formato (`src/lib/vtt/fog/mask.ts`, funções puras com testes)

- `{ v: 1, w, h, bits }`: grade de **1/8 do mapa** (`FOG_CELL_PX = 8`; 4096×2309 vira 512×289), lado de 1 a 1024. **1 bit por célula** (1 = revelado), em base64 com padding: no máximo ~43 KB, então cabe no jsonb e **não usa o Blob**.
- Na memória é um `Uint8Array` de um byte por célula, **mutável**, no `FogSync`. Fica fora do store e do React; o store só tem `fogOn` e o contador `fogRev`.
- **A névoa não entra em `fetchScenes`** (20 páginas seriam ~1 MB para a mestra). Ela vem em `fetchSceneBundle`, junto com objetos e desenhos, e `SceneSync.loadViewedScene` entrega a máscara ao `FogSync` **antes** de pôr os objetos no store. O jogador nunca vê a página descoberta por um quadro, nem um token que deveria estar escondido.
- Pincel (`stampCircle`/`stampSegment`, carimbos a cada meio raio, sem buraco em traço rápido), retângulo (`fillRect`) e polígono (`fillPolygon`, varredura par-ímpar pelo centro da célula). Cada um devolve só o retângulo de células mudado.

### Sincronia (`src/lib/vtt/fog/fog-sync.ts`)

- **Canal próprio `nevoa:{mesa}`** (`joinFogChannel`, em `realtime.ts`), privado e sem presença. **Todo membro lê, só a mestra da mesa escreve**: a política `vtt_channel_write` de `realtime.messages` usa `can_write_table_topic`, que para `nevoa:` exige `is_table_gm`.
  - O broadcast do Supabase não diz quem enviou, e um campo `userId` no payload seria forjável. Quem garante a origem é o servidor, que **recusa `fog:patch` de jogador**, então ninguém apaga nem revela a névoa na tela dos outros, nem por um instante. O canal `mesa:` não mudou.
- `fog:patch {sceneId, patch: {x, y, w, h, bits}}`: o retângulo de células mudado, com **throttle de 50 ms** durante o traço e um envio final ao soltar. O mesmo evento serve para pincel, retângulo, polígono, revelar/cobrir tudo e desfazer/refazer. Quem recebe valida o recorte (inteiros, dentro da máscara, tamanho exato de bits, `payloadToRegion`) e escreve na hora.
- **Gravação agrupada**: 600 ms depois da última mudança, uma gravação por vez. Depois de gravar sai `fog:saved {sceneId}`, e quem recebe relê `scenes.fog`: **o banco é a fonte da verdade**. Ligar e desligar também emitem `fog:saved`.
- Ao reconectar o canal da névoa, a página vista relê a coluna. Releitura e `scene:refresh` não passam por cima do que a mestra tem na tela e o banco ainda não tem (traço em andamento, mudança não gravada ou gravação a caminho, `FogSync.busy`).
- Trocar de página com mudança não gravada grava a página anterior antes (a gravação guarda qual página era).

### Como cada um vê (`engine/fog-layer.ts`)

- A máscara vira uma **textura pequena** (um pixel por célula, num `<canvas>`) esticada sobre o mapa. O **filtro linear** da GPU faz a borda suave e, fora do modo leve, ainda entra uma **média 3×3 na CPU** (`paintAlpha`). **No modo leve, a borda é menos suave** (sem a média).
  - Só o retângulo mudado é repintado, no máximo **uma vez por quadro** (`scheduleFog`, um rAF), e a textura sobe uma vez por quadro. Parada, a névoa não pede quadro nenhum. Fora do mapa também fica coberto (moldura de 4 retângulos).
- Camada no mundo: acima de mapa, adereços, tokens, legendas, marcas, desenhos e efeitos; abaixo da camada "por cima da névoa", de pings, réguas, alças e prévias. **Ping e régua de todos aparecem por cima da névoa** e não revelam nada.
- **Mestra:** tom escuro (`#0d0a0b`) a 50%. **Jogador e espectador:** preto total.
- **"Ver como jogador"** (olho no grupo Névoa, `store.fogPlayerView`, local): a mestra vê a névoa opaca e some para ela o que some para os jogadores. Nessa visão ela não tem token próprio: os tokens dos jogadores que estiverem cobertos também somem para ela.

### O que fica escondido

- Só para quem vê a névoa opaca (`seesPlayerFog`). Objeto cuja caixa no mundo (o retângulo girado, pela caixa alinhada que o envolve) **não toca nenhuma célula revelada** sai de `renderedObjects`: não é desenhado, não tem legenda, condição, efeito nem anel de turno.
  - Também fica fora de `objectAt` (clique, hover, menu de contexto), de `objectsInBox` (caixa da 12b), de Shift/Ctrl+clique e do **Ctrl+A** (`VttEngine.selectableIds`). Se entrar na névoa estando selecionado, sai da seleção (e o menu de contexto fecha).
  - Parcialmente revelado, aparece inteiro.
- **Por família** (`classifyFog`, `fog/rules.ts`): o anexo não flutua sem o pai, então a família aparece se qualquer membro dela estiver revelado.
- **Desenho** inteiro sob a névoa fica invisível pela caixa dos pontos mais a espessura, com a caixa guardada por desenho.
- **Token do próprio jogador** (`isOwnObject`): vinculado a uma ficha dele (`characters.owner_id`, lido uma vez ao abrir a mesa em `store.myCharacterIds`) **ou criado por ele** (`created_by`; ex.: o falcão da Áma, sem ficha). Ele nunca some para o jogador.
  - Se estiver inteiramente coberto, a família sobe para `liftedLayer`, por cima da névoa, com legenda e condições, e em volta continua preto. Revelado, fica na ordem de sempre.
  - Ficha vinculada depois de abrir a mesa só conta ao recarregar.
- O cálculo roda em `syncScene` (objetos mudaram) e a cada repintura da névoa, e só redesenha a cena se o conjunto de escondidos ou de "por cima" mudou.

### Ferramentas da mestra (`FogTools`, na `MapToolbar`)

- Grupo **Névoa** depois das ferramentas, **só para a mestra e só com a névoa ligada na página vista**: ferramenta Névoa (`tool: 'fog'`) e o olho "Ver como jogador". Desligar a névoa com a ferramenta na mão volta para Selecionar.
- O popover tem:
  - **Pincel, Retângulo e Polígono**;
  - **Revelar / Cobrir**;
  - slider de tamanho do pincel (8 a 400 px **de tela**, como a espessura do desenho);
  - **Revelar tudo** e **Cobrir tudo**, confirmados em `ConfirmDialog`, aberto por portal no `body` porque a barra tem `transform`;
  - uma linha de ajuda.
- **Pincel:** arrastar pinta, e um círculo segue o mouse. **`[` e `]`** mudam o tamanho um quarto por vez.
- **Retângulo:** arrastar mostra a caixa, e soltar aplica.
- **Polígono:** clique ponto a ponto. Fecha com **duplo clique, Enter ou clique no primeiro ponto**; Backspace tira o último ponto e Esc cancela. Menos de 3 pontos não faz nada. No touch, cada toque é um ponto e tocar no primeiro fecha; dois toques seguidos não enquadram o mapa.
- **Alt** segurado inverte revelar/cobrir no pincel, no retângulo e no primeiro ponto do polígono. Com a ferramenta Névoa ativa, Alt+clique não faz ping; nas outras, continua fazendo.
- No touch, segurar com a ferramenta Névoa não abre menu de contexto. Dois dedos continuam pan e pinça, e o que o pincel já pintou fica e vira um passo.
- **Desfazer:** comando `fog` em `history.ts` (`{sceneId, before, after}`, o mesmo recorte de células). Um traço, um retângulo, um polígono ou um "tudo" é **um passo** na mesma pilha de 20 do Ctrl+Z e passa pela mesma via (transmite e grava). Passo de outra página ou de máscara que mudou de tamanho é pulado com o aviso de sempre.

### Limite de segurança

- **A névoa esconde na tela, não é segredo.** A linha do objeto escondido continua chegando ao jogador pelo RLS, e a máscara inteira também (ele lê `scenes.fog`). Quem abrir o DevTools vê os tokens sob a névoa e o mapa inteiro, que já era público pela URL.
- Fazer isso no RLS custaria consultar a máscara por linha. **Para segredo de verdade, use "Ocultar"** (§4), que o RLS garante. Decisão da mestra.

### Banco (migração 024)

- `is_valid_fog(jsonb)` e o check `scenes_fog_check` (`not valid`: só confere o que for gravado daqui em diante). Exige formato, lados de 1 a 1024, tamanho exato do base64 e **padding exato**, porque só o tamanho deixaria passar 3 bytes onde cabe 1.
- `can_access_table_topic` passa a aceitar `nevoa:{uuid}` (membro ou mestra) e a nova `can_write_table_topic` (`nevoa:` só a mestra; o resto igual à leitura). `vtt_channel_write` passa a usar a nova função. Nenhuma política de tabela mudou.
- Sem a migração, a névoa funciona na mestra (a coluna e as permissões já existiam), mas os jogadores não recebem `fog:patch` ao vivo, porque o Realtime não conhece o tópico `nevoa:`. Eles só veem a névoa ao recarregar ou trocar de página.
- Testes em `supabase/rls.test.ts` ("névoa (migração 024)"): quem grava e quem lê, formato, duplicar, canal e rodar de novo sobre o schema pronto.

## 16. Dinheiro, espelhar e inventário da party (Fase 14)

### Campo de dinheiro (`components/money/MoneyControl.tsx`, na ficha e na Ficha rápida)

- Input de **texto** com `inputMode="decimal"` (o `type="number"` não aceitava vírgula). Parse em `src/lib/money.ts`, funções puras com testes.
- **Vírgula ou ponto:** o último separador é decimal se tiver 1 ou 2 dígitos depois; com exatamente 3, é de milhar. `1.759` = 1759, `1,5` = 1,5, `1.759,99` = `1,759.99` = 1759,99. Os outros separadores só valem como milhar, em grupos de 3; o resto é inválido (`1.7599`, `1.75.9`, `abc`).
- **Setas** (teclado): US$ 1, com **Shift** US$ 10. Não descem abaixo de zero.
- **`+50` / `-30` + Enter** soma/subtrai do valor atual. Passa pela RPC e entra no histórico. Se a conta der negativo, aparece um aviso discreto e nada é gravado.
- **Dívida de propósito:** `=-30` grava −30. Número sem sinal troca o valor (sem histórico, como antes).
- **"Movimentar"** (ícone ±) abre um popover com Quantia, Motivo (opcional, 80 caracteres) e **− Gastar / + Receber**. Aplica na hora e fecha. Na Ficha rápida, dentro da Mesa, o popover tem também **Depositar no caixa / Sacar do caixa**.
- **"Ver histórico"** embaixo do campo: as últimas 20 movimentações (data, ±, valor, motivo, quem). Só o que passou pela RPC entra: Gastar/Receber, `+N`/`-N`, depósito e saque. As setas e o valor digitado direto não entram.

### Mochila: quantidade e peso negativo

- `InventoryItem.qty` é opcional; item antigo conta como 1. **O peso é por unidade** e a carga é `Σ peso × qtd`.
- **O peso aceita negativo e decimal**, com vírgula ou ponto (`WeightInput`). Usa teclado de texto, porque o decimal do iPhone não tem o sinal de menos. Exemplo: mochila militar −2.
- **A carga exibida nunca fica abaixo de 0** (`getInventoryWeight`). Peso negativo aparece em **verde** (`WeightBadge`, `−2`).

### Espelhar

- No lucide 1.x, `FlipHorizontal2` é apelido de `triangles-centerline-dashed-horizontal`: linha horizontal com triângulos em cima e embaixo, ou seja, o desenho do *vertical*. Os ícones foram trocados entre si.
- **A ação estava certa** e não mudou: horizontal = `flipX` (`scale.x = −1`), vertical = `flipY`.

### Inventário da party (`components/vtt/PartyPanel.tsx`)

- **Por mesa.** Fica na aba Ficha rápida, em duas subabas no topo: **Minha ficha** e **Party** (`UI_KEYS.sheetTab`). Fora da Mesa não existe.
- **Itens:** nome, quantidade, peso (opcional, só informativo, não conta pra carga de ninguém), observação (200 caracteres) e quem adicionou (`added_by_name`, posto pelo trigger: o cliente não escolhe).
  - Ações: adicionar, editar inline, −/+ quantidade, remover (o primeiro toque vira "Remover mesmo").
  - Busca a partir de 16 itens.
- **Caixa (US$):** o mesmo `MoneyControl`, sem campo editável. Gastar/Receber, e com uma ficha escolhida "Sacar pra X" / "Depositar de X". Histórico com quem mexeu e de qual ficha.
- **Mover:**
  - Na mochila, cada item ganha o botão "Mandar pra party" (ícone de grupo).
  - Na party, cada item ganha "Pegar pra mim", que vai pra ficha escolhida na Ficha rápida.
  - Com quantidade maior que 1, aparece "Quantos?" inline (`QtyPrompt`, padrão: todos).
  - Item igual (nome sem diferenciar maiúsculas, peso e observação) soma na mesma linha, em vez de duplicar.
- **Quem pode:**
  - Ver: mestra e todo membro.
  - Mexer: mestra e jogadores (`table_upload_role`). Espectador não mexe, e na interface nem tem a aba Ficha rápida.
  - Quem não é da mesa não vê nada.
- **Tempo real:** `postgres_changes` em `party_items` (INSERT/UPDATE filtrados por `table_id`; DELETE sem filtro, só pelo id) e `party_cash`. Ao (re)conectar, relê tudo.

### Corrida com o save automático

- Mover dinheiro ou itens é RPC `security definer`, numa transação só, que devolve `{inventory, money, backpack_rev}`.
- Antes da RPC, o cliente **grava o que está pendente**. Depois, aplica o retorno como valor local **e** salvo.
- **`characters.backpack_rev`:** um trigger sobe a versão a cada mudança de `inventory`/`money`, venha de onde vier, e ignora o valor que o cliente manda.
  - O save automático (ficha e Ficha rápida) grava a mochila com `.eq('backpack_rev', <a que conhece>)` (`lib/character-save.ts`). Se uma RPC, outra aba ou outra pessoa mexeu antes, o update não pega linha: o cliente relê a mochila, avisa e salva o resto sem ela. Assim, dinheiro antigo não volta e item enviado pra party não reaparece na mochila.
  - Ao receber evento remoto, `nextBackpackRev` só adota a versão nova se o remoto não mexeu no campo com edição local pendente.
- **Um save por vez:** os saves da mesma ficha entram numa fila, pra dois em paralelo não usarem a mesma versão.

### Foto do personagem

- **Não havia limite de tamanho** em lugar nenhum. O que barrava links do Drive, Discord e Pinterest era o regex `VALID_IMAGE_URL`, que exigia extensão de imagem no fim.
- Agora vale `isValidImageUrl`: `http(s)://` e até **2048** caracteres, sem exigir extensão. Link que não for imagem cai no placeholder pelo `onError` do `<img>`.
- `CharacterImage` usa `<img>` comum (não `next/image`), então não há `remotePatterns` barrando domínio. NPC não tem campo de imagem, e o token usa asset enviado, não URL.

### Banco (migração 025)

- `characters`: check `char_length(image_url) <= 2048`, coluna `backpack_rev` e trigger `bump_backpack_rev`.
- **Tabelas:** `character_money_log`, `party_items`, `party_cash` (`money >= 0`) e `party_money_log`.
  - Os dois históricos guardam só as últimas 20 movimentações (a RPC apaga as mais antigas).
  - RLS:
    - histórico da ficha: dono ou mestra (`(select auth.uid())`);
    - party: `is_table_gm` / `is_table_member` pra ler e `table_upload_role` pra escrever.
  - Caixa e históricos só mudam pelas RPCs: `select` é a única permissão do cliente. Em `party_items`, insert e update só nas colunas editáveis.
- **RPCs:** `move_character_money`, `party_cash_move` (Gastar/Receber; com ficha, Depositar/Sacar), `party_send_item` (confere índice e nome, que podem ter mudado) e `party_take_item`.
  - Todas travam a ficha antes da linha da party, então nunca esperam uma pela outra em ciclo.
  - Os erros chegam como texto (`saldo_insuficiente`, `caixa_insuficiente`, `item_mudou`, …) e viram mensagem em português em `callMoneyRpc`.
- As três tabelas da party entram na publication do Realtime.
- **Sem a migração, a ficha não salva**, porque o save pede `backpack_rev`. Aplicar antes de subir o app.
- Testes em `supabase/rls.test.ts` ("dinheiro e party (migração 025)"): versão e save com versão velha, saldo e histórico, permissões (jogador, mestra, espectador, de fora), mover com quantidade parcial, caixa, URL longa e rodar de novo.
