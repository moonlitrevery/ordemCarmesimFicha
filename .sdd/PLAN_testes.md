# Plano de execução — testes manuais (Ordem Carmesim)

| Campo | Valor |
|-------|-------|
| **Fonte** | `docs/casos-teste-manuais.md` (24 casos) |
| **Fase atual** | Somente planejamento. **Não executar** até URL, credenciais e respostas das pendências. |
| **Tipo** | Manual, só interface no navegador |
| **Fora de escopo** | Alterar código; Playwright; Selenium; chamadas diretas a API; `npm test` / Vitest |

---

## 1. Objetivo

Percorrer os 24 casos na interface, na ordem descrita na seção 5, comparando o que a tela mostra com o **Resultado esperado** de cada CT.

Depois da execução (fase futura), registrar por caso:

- Resultado obtido
- Status: OK / Falha / Bloqueado
- Observações

O local desse registro segue P4 (tipo A): os campos já existentes em `docs/casos-teste-manuais.md`.

---

## 2. Como a interação será feita

Quando a execução for autorizada:

1. Abrir a URL informada (o documento de casos prevê `http://localhost:3000` com `npm run dev`; a URL efetiva será a que for fornecida).
2. Clicar, digitar, navegar pela barra de endereço e recarregar a página (F5) **somente na UI**.
3. Observar URL, textos, botões habilitados/desabilitados, redirecionamentos e indicadores visíveis.
4. Não inspecionar rede, não chamar Supabase/API, não automatizar o DOM por script de teste.

Leitura de código neste planejamento serviu só para **localizar rótulos e rotas** já existentes na UI, alinhados ao que os casos já pedem. Não altera o critério de aceite: o critério continua sendo o de `docs/casos-teste-manuais.md`.

---

## 3. O que a UI já expõe (conferido no código das telas)

Usado apenas para saber **onde clicar** quando o caso não nomeia o controle com precisão.

| Área | O que aparece na interface |
|------|----------------------------|
| `/` deslogado | Título “Ordem Carmesim”; texto “Compêndio de lore, regras e fichas interativas para a mesa.”; botões **Entrar** (`/login`) e **Criar conta** (`/cadastro`). `Nav` não renderiza em `/`, `/login` e `/cadastro`. |
| `/login` | Formulário **Entrar** com E-mail e Senha; botão **Entrar**. Senha no formulário tem `minLength={6}` (relevante para CT-06: senha incorreta ainda precisa ter 6+ caracteres, senão o envio nem ocorre). Mensagem mapeada no código para credencial inválida: “E-mail ou senha inválidos.” Destino pós-login: query `next` ou `/fichas`. |
| `/cadastro` | **Nome de exibição**, **E-mail**, **Senha** (`minLength={6}`), botão **Cadastrar**. |
| Menu autenticado | **Fichas**, **Lore**, **Regras**; **Rolagens** só se o perfil tiver papel mestre; botão **Sair**. |
| `/fichas` (jogador) | Subtítulo “Suas fichas de personagem.”; **+ Nova Ficha**; cards com nome; **Apagar** no card se o usuário for dono. |
| `/fichas/nova` | Campo **Nome do personagem** (`required`); **Criar ficha**. |
| Ficha `/fichas/[id]` | Abas: Elementos e Fragmentos; Magias e Poderes Passivos; Armas; Inventário; Maldições; Feitos Históricos; Anotações; História do Personagem; Mosaico. Indicador de save: “Salvando…” / “Salvo”. Botão flutuante `aria-label="Rolar dados"`. Ícones de dado junto a atributos/perícias (`QuickRollButton`). |
| Modal apagar | Passo 1: **Cancelar** / **Continuar**. Escape e clique no fundo fecham. Passo 2: digitar o nome; **Apagar definitivamente** desabilitado se o nome não coincidir (trim). |
| Lore | Índice: História, Estrutura, Cargos, Planos de Existência, Líderes → `/lore/historia`, `/lore/estrutura`, etc. |
| Regras | Índice: Atributos, Perícias, Elementos e Fragmentos, Arcanas, Armas e Runas, Tabela de Armas, Itens Amaldiçoados. |
| Rolador flutuante | Campo de notação, botão **Rolar**. Erro visível no código: “Use o formato XdY+Z (ex: 2d6+3)”. |
| `/rolagens` | Página do feed se `role = mestre`; senão redireciona para `/fichas`. |
| Ficha inexistente | `notFound()` na página `/fichas/[id]`. |

Rotas protegidas (middleware): `/fichas`, `/lore`, `/regras`, `/rolagens` → `/login?next=<path>` se deslogado. Usuário logado em `/`, `/login`, `/cadastro` → `/fichas`.

---

## 4. Pendências

| ID | Situação |
|----|----------|
| **P1** | Tipo A (seção 8). Base: `http://localhost:3000` via `npm run dev`. |
| **P2** | **Atuada.** Ver seção 9. CT-03 alterado: não cria conta nova. |
| **P3** | Tipo A na seção 8, redigida para o CT-03 antigo (cadastro de usuário novo). Com o CT-03 atual, confirmação de e-mail **não** é pré-condição deste caso. |
| **P4** | Tipo A (seção 8). Registrar em `docs/casos-teste-manuais.md`. |
| **P5** | **Atuada.** Ver seção 9. A conta que será passada é **mestre** e pode criar e apagar fichas. |

---

## 5. Ordem proposta

A ordem segue dependências dos casos (deslogado → cadastro sem conta nova → login da conta mestre → fichas → exclusão → lore/regras → rolagens de mestre). Nomes e notações são os **exemplos já escritos** em `docs/casos-teste-manuais.md`.

### Bloco A — público / deslogado

| Ordem | CT | Ação na UI |
|-------|----|------------|
| 1 | **CT-01** | Abrir `/`. Conferir título, texto, **Entrar** e **Criar conta**. Confirmar ausência do menu Fichas/Lore/Regras. |
| 2 | **CT-02** | **Entrar** → URL `/login` e formulário. Voltar a `/`. **Criar conta** → `/cadastro` e formulário. |
| 3 | **CT-04** | Em `/cadastro`, nome e e-mail, senha `12345`, tentar **Cadastrar**. Esperado: bloqueio; permanece em `/cadastro`. |
| 4 | **CT-03** | Em `/cadastro`, nome, **e-mail já cadastrado** (o da conta que será passada) e senha ≥ 6. **Cadastrar**. Esperado: nenhuma conta nova; não completar cadastro inédito; permanecer em `/cadastro` com erro **ou** não seguir o fluxo antigo de jogador recém-criado. |
| 5 | **CT-06** | Em `/login`, e-mail existente + senha errada com **pelo menos 6 caracteres**. Esperado: “E-mail ou senha inválidos.” (ou equivalente); permanece em `/login`. |
| 6 | **CT-08** | Deslogado, abrir `/fichas`, `/lore`, `/regras`. Esperado: `/login?next=...` em cada uma. |

### Bloco B — sessão da conta mestre (criar/apagar fichas)

| Ordem | CT | Ação na UI |
|-------|----|------------|
| 7 | **CT-05** | `/login` com a conta **mestre** que será passada. Esperado: `/fichas` e menu autenticado. |
| 8 | **CT-09** | Ainda logado: abrir `/login`, `/cadastro`, `/`. Esperado: redirecionar para `/fichas`. |
| 9 | **CT-10** | `/fichas` → **+ Nova Ficha** → nome `Personagem CT-10` → **Criar ficha**. Conferir `/fichas/[id]`, voltar à listagem e ver o card. |
| 10 | **CT-12** | Abrir `/fichas`, observar listagem e abrir um card. O texto do caso ainda cita subtítulo de **jogador** (“Suas fichas de personagem.”); com conta mestre a UI mostra “Visão de mestre — todas as fichas da campanha.” Registrar o que a tela mostrar frente ao texto do CT-12. |
| 11 | **CT-11** | Abrir `/fichas/nova`, deixar **Nome do personagem** vazio, tentar **Criar ficha**. Esperado: `required`; permanece na rota; nenhuma ficha nova. |
| 12 | **CT-13** | Na ficha criada no CT-10, alterar ocupação ou nome; esperar o indicador; F5; conferir persistência. |
| 13 | **CT-14** | Clicar cada aba listada no caso e a aba **Mosaico**. Conferir conteúdo, sem tela em branco. |
| 14 | **CT-20** | Clicar o ícone de dado de um atributo ou perícia. Esperado: toast com 1d20, bônus e total. |
| 15 | **CT-21** | Abrir o botão flutuante de dados; notação `1d20` ou `2d6+3`; **Rolar**. Conferir total e breakdown. |
| 16 | **CT-22** | No mesmo rolador, `abc` ou `d20++`; tentar rolar. Esperado: mensagem no formato `XdY+Z`; sem sucesso. |
| 17 | **CT-15** | Em `/fichas`, **Apagar** na ficha `Personagem CT-10` → **Cancelar**. Ficha permanece. |
| 18 | **CT-16** | **Apagar** → **Continuar** → nome diferente. **Apagar definitivamente** desabilitado; ficha permanece. |
| 19 | **CT-17** | Anotar nome e URL da ficha do CT-10; **Apagar** → **Continuar** → nome exato → **Apagar definitivamente**. Some da lista; URL antiga → 404 ou equivalente. |
| 20 | **CT-18** | Menu **Lore**; lista do caso; abrir `/lore/historia` e `/lore/estrutura`; usar nav lateral se existir. |
| 21 | **CT-19** | **Regras**; lista do caso; abrir `/regras/atributos` e `/regras/pericias`. |
| 22 | **CT-24** | Com a mesma conta mestre: menu com **Rolagens**; `/rolagens` carrega e **não** redireciona para `/fichas`. |

### Bloco C — encerrar sessão

| Ordem | CT | Ação na UI |
|-------|----|------------|
| 23 | **CT-07** | **Sair**. URL `/login`. Abrir `/fichas` → login de novo (com `next` se aparecer). |
| 24 | **CT-23** | O caso exige conta **jogador**. Com a conta informada sendo **mestre**, este CT **não** se executa nessa sessão: o menu **terá** **Rolagens** e `/rolagens` **não** redireciona para `/fichas`. Sem outra conta de jogador, status **Bloqueado**. |

**CT-05** entra no início do bloco B porque o CT-03 **não** autentica mais uma conta nova. A conta de execução dos CTs autenticados é a de **mestre** (P5 / seção 9).

---

## 6. Critério de status (fase de execução)

| Status | Quando usar |
|--------|-------------|
| **OK** | Resultado obtido coincide com o esperado do CT. |
| **Falha** | A UI divergiu do esperado (rota, texto, bloqueio, persistência). |
| **Bloqueado** | Não foi possível executar o passo (sem URL, sem conta, sem ficha, ambiente fora). |

Não completar Resultado obtido / Status / Observações neste arquivo de plano.

---

## 7. O que não será feito

- Mudar arquivos de aplicação, schema ou conteúdo MDX.
- Testes E2E automatizados (`tests/e2e`), unitários, ou Postman.
- Julgar “placeholder de lore/regras” como falha: o CT-18 diz que placeholder é aceitável se a página renderizar.
- Completar P1–P5 com valores genéricos.

---

## 8. Detalhamento das pendências

Catálogo de como cada pendência da seção 4 pode ser resolvida. Tipos:

| Tipo | Significado |
|------|-------------|
| **A** | Resolve-se analisando o padrão do projeto (estrutura, docs ou estado atual). |
| **B** | O desenvolvedor precisa escolher como o teste será conduzido. |
| **C** | Depende de informação fora do projeto e fora do escopo do dev (regra de negócio / dados da campanha). |

Para cada pendência: tipo, motivo da catalogação e o campo de encaminhamento (resolução no projeto, opções para o dev, ou texto para quem cuida da regra de negócio).

### P1 — URL do ambiente

| Campo | Conteúdo |
|-------|----------|
| **Tipo** | **A** |
| **Por que desta catalogação** | O próprio repositório já fixa o ambiente dos testes manuais. Em `docs/casos-teste-manuais.md` o campo **Ambiente previsto** é `npm run dev` em `http://localhost:3000`. O `README.md` e o `package.json` descrevem o mesmo comando `npm run dev`. A suíte em `tests/e2e/README.md` usa o mesmo padrão (`BASE_URL=http://localhost:3000` como padrão). Não é uma regra de campanha nem uma escolha em aberto no artefato de teste: a URL alvo já está no padrão do projeto. |
| **Encaminhamento (A)** | Tratar a base dos testes manuais como `http://localhost:3000`, com a aplicação subida por `npm run dev` na raiz do repositório, como já está escrito em `docs/casos-teste-manuais.md`. Qualquer outra origem (preview/produção) **não** está nesse documento de casos; se o ambiente local não estiver no ar, isso é bloqueio de execução, não lacuna de especificação. |

### P2 — Contas (e-mail novo, jogador, mestre e reúso do CT-03)

| Campo | Conteúdo |
|-------|----------|
| **Tipo** | **B** |
| **Por que desta catalogação** | O código e o `README.md` descrevem *como* uma conta nasce (tela `/cadastro`, papel padrão jogador) e *como* alguém vira mestre (`update public.profiles set role = 'mestre'…`). Os casos CT-03, CT-05, CT-23 e CT-24 dizem *quais papéis* entram em cada fluxo. O que o repositório **não** decide é o procedimento de teste: quais endereços e senhas usar nesta execução, se o cadastro do CT-03 vira a conta de jogador dos CTs seguintes, e se a conta mestre já existe ou será promovida na hora. Isso é escolha de condução do teste, não estrutura do app nem regra narrativa da mesa. |
| **Encaminhamento (B)** | O desenvolvedor precisa definir o procedimento. Opções (nenhuma está adotada neste plano): |
| | **Opção 1** — Executar o CT-03 com um e-mail ainda não cadastrado e, se a sessão nascer, usar **essa mesma conta** como jogador nos CTs do bloco B (CT-05, CT-12, CT-23 etc.). Ter à parte uma segunda conta já com `role = mestre` só para o CT-24. |
| | **Opção 2** — Usar **duas contas já existentes** (jogador e mestre). O CT-03 (e o e-mail do CT-04, se precisar) usa um terceiro e-mail descartável, só para validar o cadastro, sem reutilizar essa sessão no restante da suíte. |
| | **Opção 3** — Criar as três identidades **durante a janela de teste**: um cadastro para o CT-03/jogador; outro cadastro depois promovido a mestre pelo SQL do `README.md`; e-mail extra só se o CT-04 exigir identidade distinta. |
| | **Opção 4** — Seguir o desenho de `tests/e2e/README.md` (usuário fictício fixo via variáveis de ambiente no projeto de teste) e ainda assim cadastrar um e-mail novo só no CT-03, sem misturar com o usuário fixo. |

### P3 — Confirmação de e-mail após cadastro

| Campo | Conteúdo |
|-------|----------|
| **Tipo** | **A** |
| **Por que desta catalogação** | O comportamento esperado pelo CT-03 (ir para `/fichas` com menu autenticado) está alinhado ao que o projeto já documenta para teste. `SignupForm` chama `signUp` e em seguida `router.push('/fichas')`. `tests/e2e/README.md` instrui desligar **Confirm email** no Supabase de teste, porque com a confirmação ligada o `signUp` não devolve sessão e a ida a `/fichas` deixa de ser determinística. Isso é configuração de ambiente descrita no repositório, não uma decisão de campanha a pedir para o mestre. |
| **Encaminhamento (A)** | Para a execução manual coincidir com o CT-03, o projeto Supabase apontado pelo `.env.local` deve estar no mesmo padrão já escrito em `tests/e2e/README.md`: **Confirm email** desativado. Com isso, o cadastro válido deve autenticar e permitir checar `/fichas` e o menu. Se, no momento da execução, a tela não autenticar após **Cadastrar**, o desvio é do ambiente em relação a esse padrão (registrar como Falha ou Bloqueado no CT-03), não uma pendência nova de especificação. |

### P4 — Onde gravar Resultado obtido / Status / Observações

| Campo | Conteúdo |
|-------|----------|
| **Tipo** | **A** |
| **Por que desta catalogação** | `docs/casos-teste-manuais.md` já define o artefato de execução: seção **Colunas de execução (preencher depois)** e, em cada CT, os campos **Resultado obtido**, **Status** e **Observações** com placeholder. Não há no repositório outro modelo obrigatório de relatório, nem é regra da mesa de RPG. O local de registro já está no padrão do documento de casos. |
| **Encaminhamento (A)** | Preencher, na execução, os três campos **dentro de** `docs/casos-teste-manuais.md`, em cada caso CT-01 a CT-24, usando Status **OK / Falha / Bloqueado** como a seção 6 deste plano (que replica a legenda daquele arquivo). Não criar um segundo relatório a menos que o documento de casos seja alterado. |

### P5 — Permissão para criar e apagar fichas no ambiente

| Campo | Conteúdo |
|-------|----------|
| **Tipo** | **C** |
| **Por que desta catalogação** | A aplicação permite ao dono criar ficha e apagar após confirmar o nome; os CTs 10, 15, 16 e 17 descrevem exatamente esses cliques. O que o código **não** diz é se o banco ligado a essa instância contém fichas da campanha real que não podem ser destruídas, nem se o ambiente de teste é compartilhado com a mesa. Isso é dado e política da campanha, fora do repositório e fora do que o desenvolvedor decide só olhando o app. |
| **Encaminhamento (C)** | Texto para quem cuida da regra de negócio / dados da mesa: os testes manuais CT-10 e CT-15 a CT-17 **criam** uma ficha e, no CT-17, **apagá-la de forma definitiva** (some da listagem; a URL antiga deve resultar em 404). A análise não pode concluir esses casos — nem garantir que nenhuma ficha da campanha será tocada — enquanto não estiver definido: (1) se o ambiente usado é exclusivo de teste ou é o mesmo das fichas oficiais; (2) se existe alguma ficha que **não** pode ser apagada; (3) se a ficha criada no teste (o caso usa o nome `Personagem CT-10`) pode ser excluída ao final. Sem essa definição, CT-17 fica bloqueado e CT-10/15/16 só devem seguir se a criação de ficha também for permitida nesse ambiente. |

---

## 9. Atuação em P2 e P5 (2026-10-26)

Registro do que foi definido depois do catálogo da seção 8. O texto da seção 8 permanece como estava no momento da catalogação.

### P2 — CT-03 sem criar conta nova

- **Problema informado:** o Supabase usado pelo site limita quantas contas podem ser **criadas** por dia; essa cota já foi atingida hoje. O CT-03 original (“Cadastro com dados válidos”, e-mail inédito, sessão de jogador) **não é viável** nesta execução.
- **Alteração na especificação:** em `docs/casos-teste-manuais.md`, o CT-03 passou a **Cadastro com e-mail já cadastrado** (negativo). Usa o e-mail de uma conta **já existente**, não cria usuário novo e não depende da cota diária de sign-up.
- **O que o caso antigo cobria e este não cobre:** criação de conta, redirecionamento a `/fichas` após cadastro, papel padrão jogador (menu sem **Rolagens**). Papel jogador continua só no **CT-23**, que exige outra conta.
- **Contas nesta execução:** não se cadastra usuário novo. Login autenticado usa a conta que será passada (mestre). O e-mail dessa conta é o e-mail “já cadastrado” do CT-03.

### P5 — Criar e apagar fichas

- **Informação recebida:** a conta que será passada **pode criar e apagar fichas**, porque é conta de **mestre**.
- **Efeito nos casos:** CT-10 e CT-15 a CT-17 seguem com a ficha de teste `Personagem CT-10` criada nessa conta (dona da ficha, botão **Apagar** visível). Não apagar fichas da campanha que não sejam essa ficha de teste.
- **Listagem:** mestre vê “Visão de mestre — todas as fichas da campanha.” (CT-12 ainda descreve o subtítulo de jogador; na execução comparar com o que a UI da conta mestre mostrar).

### Efeito no CT-23

O CT-23 permanece na especificação como restrição de **jogador**. Com apenas a conta mestre, esse caso fica **Bloqueado** até existir conta de jogador — sem criar conta nova (mesma cota da P2).
