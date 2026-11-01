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
- **table_documents** e **table_reports**: por mesa. (fase 8)

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
- **Broadcast** (tipado num único `type VttEvent` em `src/lib/vtt/events.ts`): `obj:drag` (transitório, throttle 50 ms, só posição), `obj:upsert`, `obj:delete`, `scene:assign`, `scene:refresh`, `session:state`, `member:changed`, `table:refresh`, `ping`, `ruler` (transitório, throttle 100 ms, some em 5 s sem atualização), `draw:add`, `draw:delete`, `initiative:refresh`, `npc:refresh`, `audio:*`, `fx:weather` (só `sceneId`), `doc:show`, `cutscene:*`, `asset:pending`, `asset:resolved`.
- **Fonte da verdade é o banco.** Ao entrar: carrega snapshot (mesa, cena, objetos, desenhos). Ação persistente = escreve no banco **e** faz broadcast do resultado (com `updated_at`); quem recebe aplica se `updated_at` for mais novo (last-write-wins). Arrastar: broadcast `obj:drag` durante o movimento, persiste uma vez no `pointerup`.
- Qualquer membro pode enviar no canal, então `session:state`, `member:changed`, `table:refresh`, `scene:assign`, `scene:refresh`, `initiative:refresh`, `npc:refresh`, `fx:weather` e `asset:*` são só avisos: quem recebe relê o banco em vez de confiar no payload (o toast de pendente só aparece se o banco confirmar um item novo). `obj:upsert` e `draw:add` levam a linha, validada na chegada (`isValidObject`, `isValidDrawing`); a URL da imagem nunca viaja: sai de `assets`, pelo RLS.
- **Segredo não viaja no canal**, que todo membro recebe: objeto oculto e qualquer mudança em cena sem plateia (`isSceneLive`) saem como `scene:refresh {sceneId}`, e o RLS decide o que cada um relê. Sem `obj:drag` nesses casos. Dado de NPC nunca entra no canal: `NpcSync` só existe no navegador da mestra e `npc:refresh` não leva dado. A barrinha de HP do token sai do store dela, onde está a tabela.
- Iniciativa (`InitiativeSync`) e NPC (`NpcSync`) ficam fora de `SceneSync`: não são da cena. Aparecem na hora, gravam agrupados (250 e 400 ms) e não aceitam releitura com edição pendente. A iniciativa fica em `store.initiative`, não em `table`, para o snapshot da mesa não sobrescrever o que ainda está salvando.
- Tudo o que muda a cena passa por `SceneSync` (`src/lib/vtt/scene-sync.ts`); o canvas e os painéis só chamam seus métodos e leem o store.
- Efeitos e magias viajam na linha do objeto (`obj:upsert`), ou como `scene:refresh` em objeto oculto ou cena sem plateia. O clima aparece na hora para a mestra, grava agrupado (250 ms, uma gravação por vez) e só então sai `fx:weather`; quem recebe relê só `scenes.weather` da própria cena. Releitura não passa por cima do clima ainda não gravado.
- Iluminação segue a mesma via do clima (`queueSceneFx`, 250 ms, aviso `fx:weather`, e quem recebe relê `weather` e `lighting`).
- Reconexão: ao voltar o status `SUBSCRIBED`, relê a mesa e depois a cena. **Sempre nessa ordem**, também em `scene:assign` (`VttShell`): o RLS só mostra ao jogador a cena em que ele está, então ler as cenas com a padrão antiga no store daria "cena nenhuma", e o canvas desmontaria no meio da troca.
- **Transição entre cenas** (`SceneTransition`, `scene-transition.ts`; tela em `SceneTransitionOverlay`): local de cada cliente, disparada por `loadViewedScene` quando a cena vista muda de uma para outra (inclusive a mestra abrindo outra cena). Cobre, lê a cena nova, troca no store, espera as texturas e dois quadros (`engine.sceneLoaded`, o envio para a GPU fica escondido) e revela, com teto de 4 s. Fade 0,3 + 0,5 s; símbolo 0,3 + 0,7 + 0,5 s; modo leve encurta e tira a escala. Corte não cobre nada. Entrar na primeira cena (sessão abrindo) é corte: o canvas ainda não existe. É DOM, só `opacity` e `transform`, sobre o mapa e sob o HUD. O símbolo é `/icon.svg` (`src/app/icon.svg`); `NEXT_PUBLIC_ORDER_SYMBOL_URL` troca o caminho.
- **Desfazer/refazer** (`src/lib/vtt/history.ts`, aplicado por `SceneSync`): cada pessoa tem a própria pilha, em memória, de até 20 passos; some ao recarregar ou trocar de cena. Cada comando guarda antes e depois, e desfazer é aplicar o inverso pela mesma via (grava e transmite), então os outros veem. Desfaz mover, girar, redimensionar, espelhar, legenda, condições, efeitos e magias, vínculo de NPC, anexar/desanexar, ocultar/mostrar, criar, colar e apagar objeto, desenhar e apagar o próprio desenho. Não desfaz mudança de cena, clima, calibração, biblioteca, chat, iniciativa, ficha de NPC, ordem (frente/trás) nem "apagar todos os desenhos". Objeto apagado volta pela RPC `restore_scene_object` (mesmo id, anexo, legenda, efeitos e condições; se o pai sumiu, volta solto onde estava). Passo cujo alvo já não existe é pulado com um aviso. Atalhos: Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y (Cmd no Mac), ignorados em campo de texto.
- Chat usa `postgres_changes` em `chat_messages` filtrado por `table_id` (RLS se aplica), num canal próprio com tópico único (`chat:{tableId}:{uuid}`), fora do canal privado da mesa: um erro na tabela do chat não pode derrubar o canvas. Mesmo esquema para `characters` (Ficha Rápida e `CharacterSheet`), onde só `hp_current`, `mana_current`, `sanity_current`, `inventory` e `money` são mesclados (`src/lib/resource-sync.ts`): campo com mudança local não salva não é sobrescrito, e o save só envia o que mudou desde o último confirmado. `inventory` é uma coluna só: se as duas abas mexerem na lista dentro do mesmo intervalo de gravação, vale a última lista inteira.
- Toda rolagem da Mesa passa por `ChatSync.roll`: vai para o chat e para `dice_rolls`. O personagem que rola é o escolhido na Ficha Rápida, também no `/r`; sem escolha, sai só o nome de usuário no chat e em `/rolagens`. NPC e iniciativa passam `actor` e não levam a ficha escolhida. Ataque de NPC sai escondido por padrão, com toggle no painel.

## 6. Arquivos (Vercel Blob)

- `src/lib/storage/` com uma interface `StorageProvider` (`isConfigured`, `createUploadToken`, `ownsUrl`, `stat`, `delete(urls[])`) e a implementação **Vercel Blob**. Manter a interface pra dar pra trocar de provedor no futuro sem mexer no resto. Variável: `BLOB_READ_WRITE_TOKEN`. O Blob store está conectado ao projeto por OIDC, então a variável **não** é criada automaticamente: ela foi adicionada à mão nas variáveis de ambiente da Vercel (local via `vercel env pull`).
- **Client upload** (o arquivo vai do navegador direto pro Blob, sem passar pela função da Vercel): route handler `POST /api/upload` usando `handleUpload` do `@vercel/blob/client`. Em `onBeforeGenerateToken`: validar a sessão Supabase (server client), papel, `kind`, `allowedContentTypes` e `maximumSizeInBytes` por tipo; pathname `{kind}/{uuid}.{ext}` (`addRandomSuffix: true`).
- **Não depender de `onUploadCompleted`** (não roda em localhost). Fluxo: cliente chama `upload()` → recebe `{ url, pathname }` → chama `POST /api/assets` (ou a rota da tabela certa) que valida de novo (tamanho e tipo reais via `head()`, nunca o que o cliente declarou) e cria a linha no banco (`assets`, `table_documents` ou `table_reports`) com `status` conforme o papel.
- `upload()` esconde a mensagem de erro do servidor: o cliente consulta `GET /api/upload` (`{ configured }`) antes de enviar, para mostrar "Ligue o Blob store na Vercel — veja LEIA-ME".
- `DELETE /api/upload/[id]`: só mestre (ou dono de item pendente/próprio) — `del()` do arquivo e da miniatura no Blob e apaga a linha. Blob primeiro: se falhar, a linha fica para tentar de novo, e a resposta diz o motivo (credencial recusada, cota).
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
  - O manifest vai para `generated/vtt-manifest.json`, fora de `public/`: `id`, `kind`, `name`, `visibility`, `path`, `thumb`, `mime`, `size_bytes`, `width`, `height`, `duration_s`.
  - Arquivo já gerado não é refeito, sobras de `_built/` são removidas. Formato errado ou arquivo ilegível é ignorado com aviso. `generated/` e `_built/` ficam no `.gitignore`; em dev, sem rodar o script, a biblioteca mostra só o Blob.
- **`GET /api/vtt/static`** é o catálogo por papel: mestra recebe tudo, os demais os itens `jogadores`. Manifest em cache de módulo; resposta `private, max-age=60`, `ETag` e `Vary: Cookie` (trocar de conta no mesmo navegador não pode reaproveitar a lista da mestra). **`GET /api/vtt/static/in-use`** (`no-store`) devolve ao jogador os itens só da mestra em uso nas cenas que ele vê (RPC `my_scene_static_asset_ids`). As duas ficam fora do middleware e fazem uma chamada ao Supabase cada: `getSession` só acha o token, quem confere é o PostgREST (`is_mestre`); nunca usar o `user` da sessão como prova. O manifest não vai para o bundle do cliente. Sem esse "em uso", um mapa só da mestra ficaria em branco para os jogadores. Só conta mapa de cena e objeto não oculto **criado pela dona da mesa**: o banco não conhece o manifest, então um jogador que adivinhasse o id poderia inserir um objeto com ele e liberar o arquivo.
- **Segredo por URL:** os arquivos de `_built/` são públicos para quem tem a URL, e a proteção é o nome imprevisível. O middleware responde 404 para todo `/vtt/` fora de `_built/`, que senão serviria os originais por nome. `_built/` vai com `X-Robots-Tag: noindex` e cache imutável. Quem já recebeu uma URL continua podendo abri-la. Os originais ficam no histórico do Git: o repositório precisa ser privado para valer como segredo.
- **Sem linha no banco:** o cliente junta a lista da rota ao que vem de `assets`, nos painéis e em `fetchAssets` (`src/lib/vtt/assets/static.ts`). É isso que impede apagar: `DELETE /api/upload/[id]` não acha linha. A UI mostra o selo "fixo" e não abre o editor; item fixo não tem tags, renomeação nem toggle (a pasta decide a visibilidade).
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
- **Efeitos de tela** (`WeatherPanel`, só mestra): clima da cena aberta, cumulativo, em espaço de tela sobre o mapa e sob o HUD. Trocar de cena ou de intensidade chega ao alvo por fade.
- **Iluminação** (`fx/lighting.ts`, mesmo painel): um sprite de tela cheia em `multiply`, acima de mapa e tokens e abaixo do clima. Sem filtro, e parado não pede quadro. O Crepúsculo usa uma textura de gradiente de 2×64 px esticada. Alpha máximo 0,95. Trocar de cor apaga, troca e acende. Vale também para a mestra. Fase 11: a lanterna fura trocando a textura de `darkness` por uma RenderTexture com furos em `erase`.
- **Marcas no token** (camada própria do canvas, tamanho fixo na tela, sem girar junto): condições em arco acima (6 + "+N", nome ao passar o mouse ou tocar), anel do turno atual (sprite pré-renderizado) e, só para a mestra, barrinha de HP do NPC na base.
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
