# Casos de Teste Manuais — Ordem Carmesim

| Campo | Valor |
|-------|-------|
| **Projeto** | Ordem Carmesim (fichas, lore e regras) |
| **Tipo de teste** | Manual (interação com a interface) |
| **Quantidade** | 24 casos |
| **Ambiente previsto** | `npm run dev` em `http://localhost:3000` |
| **Observação** | Este documento registra apenas a especificação. A execução ocorrerá depois, com credenciais e servidor ligados. |

## Histórico de alteração da especificação

| Data | Caso | O que mudou |
|------|------|-------------|
| 2026-10-26 | **CT-03** | Deixou de ser “Cadastro com dados válidos” (+). Motivo: o projeto Supabase em uso limita quantas contas novas podem ser criadas por dia, e essa cota já foi atingida. O caso passou a ser **Cadastro com e-mail já cadastrado** (−): usa um e-mail de conta existente, **não** cria usuário novo e cobre o formulário `/cadastro` sem consumir a cota. |

## Legenda

| Símbolo | Significado |
|---------|-------------|
| **(+)** | Caso de teste **positivo** (fluxo válido / comportamento esperado de sucesso) |
| **(-)** | Caso de teste **negativo** (entrada inválida, acesso negado ou bloqueio esperado) |

## Colunas de execução (preencher depois)

Para cada caso, após a execução, registrar:

- **Resultado obtido**
- **Status:** OK / Falha / Bloqueado
- **Observações**

---

## CT-01 — Exibir a página inicial (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-01 |
| **Nome** | Exibir a página inicial |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário deslogado; aplicação acessível |
| **Objetivo** | Verificar se a landing page pública apresenta a identidade da campanha e os atalhos de autenticação |

**Passos:**

1. Abrir a URL raiz (`/`).
2. Observar o conteúdo e os botões exibidos.
3. Confirmar que o menu autenticado (Fichas, Lore, Regras) **não** aparece.

**Resultado esperado:** Página com título “Ordem Carmesim”, texto introdutório do compêndio, botões **Entrar** e **Criar conta**. Sem barra de navegação autenticada.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-02 — Navegar da home para login e cadastro (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-02 |
| **Nome** | Navegar da home para login e cadastro |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário deslogado; página `/` aberta |
| **Objetivo** | Verificar se os links da home levam corretamente às telas de autenticação |

**Passos:**

1. Em `/`, clicar em **Entrar**.
2. Verificar que a URL é `/login` e o formulário de login está visível.
3. Voltar à home (ou abrir `/` novamente).
4. Clicar em **Criar conta**.
5. Verificar que a URL é `/cadastro` e o formulário de cadastro está visível.

**Resultado esperado:** Navegação correta para `/login` e `/cadastro`, com os respectivos formulários carregados.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-03 — Cadastro com e-mail já cadastrado (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-03 |
| **Nome** | Cadastro com e-mail já cadastrado |
| **Tipo** | Negativo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário deslogado; e-mail de uma conta **já existente** no ambiente (não usar e-mail novo) |
| **Objetivo** | Verificar que tentar cadastrar de novo com e-mail já usado não cria outra conta |

**Passos:**

1. Abrir `/cadastro`.
2. Preencher **Nome de exibição**, o **E-mail já cadastrado** e **Senha** com pelo menos 6 caracteres.
3. Clicar em **Cadastrar**.
4. Observar URL, mensagem no formulário e se o usuário permanece deslogado na tela de cadastro.

**Resultado esperado:** Nenhuma conta nova é criada. O usuário **não** completa um cadastro inédito. Permanece em `/cadastro` com a mensagem de erro devolvida pelo cadastro, **ou** não segue o fluxo de sucesso de conta recém-criada (redirecionamento a `/fichas` como jogador novo, menu sem **Rolagens**). A cota diária de criação de usuários do Supabase não deve ser consumida por este caso.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-04 — Cadastro com senha muito curta (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-04 |
| **Nome** | Cadastro com senha muito curta |
| **Tipo** | Negativo |
| **Prioridade** | Média |
| **Pré-condições** | Usuário deslogado; página `/cadastro` aberta |
| **Objetivo** | Verificar se o sistema impede cadastro com senha abaixo do mínimo |

**Passos:**

1. Preencher nome e e-mail válidos.
2. Informar senha com menos de 6 caracteres (ex.: `12345`).
3. Tentar clicar em **Cadastrar**.

**Resultado esperado:** Envio bloqueado pela validação do campo (`minLength`) ou mensagem de erro; conta **não** é criada; usuário permanece em `/cadastro`.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-05 — Login com credenciais válidas (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-05 |
| **Nome** | Login com credenciais válidas |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Conta existente (jogador ou mestre); usuário deslogado |
| **Objetivo** | Verificar autenticação bem-sucedida |

**Passos:**

1. Abrir `/login`.
2. Informar e-mail e senha corretos.
3. Clicar em **Entrar**.

**Resultado esperado:** Autenticação bem-sucedida; redirecionamento para `/fichas` (destino padrão); menu autenticado visível.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-06 — Login com credenciais inválidas (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-06 |
| **Nome** | Login com credenciais inválidas |
| **Tipo** | Negativo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário deslogado; página `/login` aberta |
| **Objetivo** | Verificar tratamento de falha de autenticação |

**Passos:**

1. Informar e-mail existente com senha incorreta (ou e-mail inexistente).
2. Clicar em **Entrar**.
3. Observar a mensagem e a URL.

**Resultado esperado:** Mensagem “E-mail ou senha inválidos.” (ou equivalente); usuário permanece em `/login`; não acessa `/fichas`.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-07 — Logout (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-07 |
| **Nome** | Logout |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado em qualquer página com menu (ex.: `/fichas`) |
| **Objetivo** | Verificar se o encerramento de sessão funciona e remove o acesso autenticado |

**Passos:**

1. Clicar em **Sair** no menu.
2. Verificar a URL após o logout.
3. Tentar abrir `/fichas` diretamente.

**Resultado esperado:** Redirecionamento para `/login`; acesso a `/fichas` redireciona novamente para login (com `next`, se aplicável).

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-08 — Acesso a rota protegida sem autenticação (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-08 |
| **Nome** | Acesso a rota protegida sem autenticação |
| **Tipo** | Negativo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário deslogado |
| **Objetivo** | Verificar bloqueio de áreas autenticadas |

**Passos:**

1. Com a sessão encerrada, abrir `/fichas` na barra de endereço.
2. Repetir para `/lore` e `/regras`.

**Resultado esperado:** Em cada caso, redirecionamento para `/login` com parâmetro `next` apontando para a rota original (ex.: `/login?next=/fichas`).

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-09 — Usuário logado redirecionado de páginas de autenticação (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-09 |
| **Nome** | Usuário logado redirecionado de páginas de autenticação |
| **Tipo** | Negativo |
| **Prioridade** | Média |
| **Pré-condições** | Usuário já autenticado |
| **Objetivo** | Verificar que login/cadastro/home pública não ficam acessíveis com sessão ativa |

**Passos:**

1. Estando logado, abrir `/login`.
2. Abrir `/cadastro`.
3. Abrir `/`.

**Resultado esperado:** Em todos os casos, redirecionamento para `/fichas`; formulários de auth não permanecem utilizáveis.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-10 — Criar nova ficha de personagem (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-10 |
| **Nome** | Criar nova ficha de personagem |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado; página `/fichas` acessível |
| **Objetivo** | Verificar criação de ficha e abertura da tela de edição |

**Passos:**

1. Em `/fichas`, clicar em **+ Nova Ficha**.
2. Informar um nome (ex.: `Personagem CT-10`).
3. Clicar em **Criar ficha**.
4. Observar a URL e o conteúdo da ficha.
5. Voltar a `/fichas` e verificar a listagem.

**Resultado esperado:** Redirecionamento para `/fichas/[id]` da ficha criada; ficha editável; card correspondente aparece na listagem.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-11 — Criar ficha sem nome (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-11 |
| **Nome** | Criar ficha sem nome |
| **Tipo** | Negativo |
| **Prioridade** | Média |
| **Pré-condições** | Usuário autenticado; página `/fichas/nova` aberta |
| **Objetivo** | Verificar bloqueio de criação sem nome do personagem |

**Passos:**

1. Deixar o campo **Nome do personagem** vazio.
2. Tentar clicar em **Criar ficha**.

**Resultado esperado:** Envio bloqueado pela validação `required` do formulário; usuário permanece em `/fichas/nova`; nenhuma ficha nova é criada.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-12 — Listar fichas do jogador (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-12 |
| **Nome** | Listar fichas do jogador |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Conta de **jogador** autenticada; ao menos uma ficha própria existente |
| **Objetivo** | Verificar listagem das fichas do usuário logado |

**Passos:**

1. Abrir `/fichas`.
2. Observar o título/subtítulo e os cards exibidos.
3. Abrir uma ficha clicando no card.

**Resultado esperado:** Subtítulo indicando “Suas fichas de personagem.”; cards das fichas do jogador; clique abre `/fichas/[id]` corretamente.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-13 — Editar ficha e verificar autosave (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-13 |
| **Nome** | Editar ficha e verificar autosave |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado; ficha existente aberta em `/fichas/[id]` |
| **Objetivo** | Verificar persistência automática de alterações na ficha |

**Passos:**

1. Alterar um campo visível (ex.: ocupação ou nome).
2. Aguardar alguns segundos e observar o indicador de salvamento.
3. Recarregar a página (F5).
4. Conferir se o valor alterado permanece.

**Resultado esperado:** Indicador passa por estado de salvamento e confirmação (salvo); após reload, o valor editado permanece persistido.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-14 — Navegar pelas abas da ficha (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-14 |
| **Nome** | Navegar pelas abas da ficha |
| **Tipo** | Positivo |
| **Prioridade** | Média |
| **Pré-condições** | Ficha aberta em `/fichas/[id]` |
| **Objetivo** | Verificar se as abas da ficha trocam de conteúdo sem erro de interface |

**Passos:**

1. Clicar, uma a uma, nas abas: Elementos e Fragmentos; Magias e Poderes Passivos; Armas; Inventário; Maldições; Feitos Históricos; Anotações; História (e demais abas visíveis).
2. Em cada aba, confirmar que o conteúdo correspondente é exibido.

**Resultado esperado:** Cada aba mostra sua seção correta; sem tela em branco ou erro evidente de layout.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-15 — Exclusão de ficha — cancelar (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-15 |
| **Nome** | Exclusão de ficha — cancelar |
| **Tipo** | Negativo |
| **Prioridade** | Média |
| **Pré-condições** | Usuário autenticado; ao menos uma ficha na listagem `/fichas` |
| **Objetivo** | Verificar que cancelar a exclusão não remove a ficha |

**Passos:**

1. Na listagem, clicar em **Apagar** na ficha de teste.
2. No modal, clicar em **Cancelar** (ou pressionar Escape / clicar fora, se disponível).
3. Verificar se a ficha ainda aparece na lista.

**Resultado esperado:** Modal fecha; ficha permanece na listagem; nenhuma exclusão ocorre.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-16 — Exclusão de ficha — nome incorreto (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-16 |
| **Nome** | Exclusão de ficha — nome incorreto |
| **Tipo** | Negativo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado; ficha existente na listagem |
| **Objetivo** | Verificar bloqueio da exclusão quando o nome digitado não confere |

**Passos:**

1. Clicar em **Apagar**.
2. Clicar em **Continuar** no primeiro passo do modal.
3. Digitar um nome **diferente** do nome do personagem.
4. Observar o botão **Apagar definitivamente**.

**Resultado esperado:** Botão de exclusão definitiva permanece desabilitado; ficha não é apagada.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-17 — Exclusão de ficha — confirmação correta (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-17 |
| **Nome** | Exclusão de ficha — confirmação correta |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado; ficha de teste que pode ser apagada |
| **Objetivo** | Verificar exclusão completa após confirmação válida |

**Passos:**

1. Anotar o nome e, se possível, o ID/URL da ficha.
2. Clicar em **Apagar** → **Continuar**.
3. Digitar o nome **exatamente** como exibido.
4. Clicar em **Apagar definitivamente**.
5. Verificar a listagem e tentar reabrir a URL antiga da ficha.

**Resultado esperado:** Ficha some da listagem; acesso à URL antiga resulta em página não encontrada (404) ou equivalente.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-18 — Consultar índice e páginas de Lore (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-18 |
| **Nome** | Consultar índice e páginas de Lore |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado |
| **Objetivo** | Verificar navegação do compêndio de lore |

**Passos:**

1. Abrir `/lore` pelo menu ou pela URL.
2. Confirmar a lista de páginas (História, Estrutura, Cargos, Planos de Existência, Líderes).
3. Abrir ao menos duas páginas (ex.: `/lore/historia` e `/lore/estrutura`).
4. Usar a navegação lateral, se disponível, para trocar de página.

**Resultado esperado:** Índice e páginas carregam sem erro; títulos coerentes; navegação entre páginas funciona. Conteúdo placeholder é aceitável se a página renderizar.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-19 — Consultar índice e páginas de Regras (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-19 |
| **Nome** | Consultar índice e páginas de Regras |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Usuário autenticado |
| **Objetivo** | Verificar navegação do compêndio de regras |

**Passos:**

1. Abrir `/regras`.
2. Confirmar a lista (Atributos, Perícias, Elementos e Fragmentos, Arcanas, Armas e Runas, Tabela de Armas, Itens Amaldiçoados).
3. Abrir ao menos duas páginas (ex.: `/regras/atributos` e `/regras/pericias`).

**Resultado esperado:** Índice e páginas carregam sem 404; navegação lateral (se houver) funciona.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-20 — Rolagem rápida na ficha (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-20 |
| **Nome** | Rolagem rápida na ficha |
| **Tipo** | Positivo |
| **Prioridade** | Média |
| **Pré-condições** | Ficha aberta; botões de rolagem rápida (dado) visíveis junto a atributos/perícias |
| **Objetivo** | Verificar rolagem rápida via interface da ficha |

**Passos:**

1. Clicar no ícone de dado associado a um atributo ou perícia.
2. Observar o feedback visual (toast/resultado).

**Resultado esperado:** Aparece resultado de rolagem (1d20 com bônus e total); sem erro de interface.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-21 — Rolador flutuante com notação válida (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-21 |
| **Nome** | Rolador flutuante com notação válida |
| **Tipo** | Positivo |
| **Prioridade** | Média |
| **Pré-condições** | Usuário autenticado em página com botão flutuante de dados (ex.: ficha) |
| **Objetivo** | Verificar rolagem manual com notação válida |

**Passos:**

1. Abrir o rolador flutuante de dados.
2. Informar ou selecionar uma notação válida (ex.: `1d20` ou `2d6+3`).
3. Executar a rolagem.
4. Observar o resultado exibido.

**Resultado esperado:** Resultado numérico coerente com a notação; breakdown/total visíveis conforme a UI.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-22 — Rolador flutuante com notação inválida (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-22 |
| **Nome** | Rolador flutuante com notação inválida |
| **Tipo** | Negativo |
| **Prioridade** | Média |
| **Pré-condições** | Rolador flutuante aberto |
| **Objetivo** | Verificar rejeição de notação de dados inválida |

**Passos:**

1. Informar uma notação inválida (ex.: `abc` ou `d20++`).
2. Tentar rolar.

**Resultado esperado:** Mensagem de erro orientando o formato `XdY+Z` (ex.: “Use o formato XdY+Z…”); nenhum resultado de rolagem válido é apresentado como sucesso.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-23 — Jogador não acessa a tela de Rolagens (-)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-23 |
| **Nome** | Jogador não acessa a tela de Rolagens |
| **Tipo** | Negativo |
| **Prioridade** | Alta |
| **Pré-condições** | Conta com papel de **jogador** (não mestre) autenticada |
| **Objetivo** | Verificar restrição da área exclusiva do mestre |

**Passos:**

1. Observar o menu: confirmar ausência do link **Rolagens**.
2. Digitar `/rolagens` na barra de endereço e acessar.

**Resultado esperado:** Link **Rolagens** não aparece no menu; acesso direto a `/rolagens` redireciona para `/fichas`.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## CT-24 — Mestre visualiza link e página de Rolagens (+)

| Campo | Conteúdo |
|-------|----------|
| **ID** | CT-24 |
| **Nome** | Mestre visualiza link e página de Rolagens |
| **Tipo** | Positivo |
| **Prioridade** | Alta |
| **Pré-condições** | Conta com `role = mestre` autenticada |
| **Objetivo** | Verificar acesso do mestre à área de rolagens ao vivo |

**Passos:**

1. Observar o menu autenticado.
2. Clicar em **Rolagens** (ou abrir `/rolagens`).
3. Verificar se a página do feed/área de rolagens carrega.

**Resultado esperado:** Link **Rolagens** visível no menu; página `/rolagens` carrega sem redirecionar para `/fichas`.

**Resultado obtido:** _(preencher na execução)_  
**Status:** _(preencher)_  
**Observações:** _(preencher)_

---

## Resumo dos 24 casos

| ID | Nome | Tipo |
|----|------|------|
| CT-01 | Exibir a página inicial | Positivo |
| CT-02 | Navegar da home para login e cadastro | Positivo |
| CT-03 | Cadastro com e-mail já cadastrado | Negativo |
| CT-04 | Cadastro com senha muito curta | Negativo |
| CT-05 | Login com credenciais válidas | Positivo |
| CT-06 | Login com credenciais inválidas | Negativo |
| CT-07 | Logout | Positivo |
| CT-08 | Acesso a rota protegida sem autenticação | Negativo |
| CT-09 | Usuário logado redirecionado de páginas de autenticação | Negativo |
| CT-10 | Criar nova ficha de personagem | Positivo |
| CT-11 | Criar ficha sem nome | Negativo |
| CT-12 | Listar fichas do jogador | Positivo |
| CT-13 | Editar ficha e verificar autosave | Positivo |
| CT-14 | Navegar pelas abas da ficha | Positivo |
| CT-15 | Exclusão de ficha — cancelar | Negativo |
| CT-16 | Exclusão de ficha — nome incorreto | Negativo |
| CT-17 | Exclusão de ficha — confirmação correta | Positivo |
| CT-18 | Consultar índice e páginas de Lore | Positivo |
| CT-19 | Consultar índice e páginas de Regras | Positivo |
| CT-20 | Rolagem rápida na ficha | Positivo |
| CT-21 | Rolador flutuante com notação válida | Positivo |
| CT-22 | Rolador flutuante com notação inválida | Negativo |
| CT-23 | Jogador não acessa a tela de Rolagens | Negativo |
| CT-24 | Mestre visualiza link e página de Rolagens | Positivo |

**Totais:** 14 positivos · 10 negativos · 24 manuais (somente UI)
