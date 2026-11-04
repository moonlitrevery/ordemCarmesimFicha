# Testes E2E (Playwright) — Autenticação

Suíte automatizada dos fluxos de **autenticação** do Ordem Carmesim: cadastro,
login (válido e inválido), logout e controle de acesso a rota protegida.
Complementa os testes unitários já existentes (`npm test`, Vitest) e o plano
de testes.

## 1. Pré-requisitos

- Um projeto Supabase **de teste** (separado do de produção/desenvolvimento
  pessoal), com o schema aplicado (`supabase/schema.sql` +
  `supabase/migrations/*.sql`).
- Em **Authentication → Providers → Email**, desative **"Confirm email"**.
  Sem isso, `supabase.auth.signUp` não devolve sessão ativa e o teste de
  cadastro fica não determinístico (o app tentaria navegar para `/fichas`
  sem sessão válida).
- Um usuário fictício já existente e confirmado nesse projeto de teste, para
  os testes de login/logout (crie pela própria tela `/cadastro` da aplicação
  ou pelo painel do Supabase).
- [uv](https://docs.astral.sh/uv/) e Node.js instalados (o uv baixa o Python
  3.9+ sozinho, se necessário).

## 2. Instalação

As dependências ficam em `pyproject.toml` (travadas em `uv.lock`); o uv cria
e gerencia o `.venv` automaticamente.

```bash
cd tests/e2e
uv sync
uv run playwright install chromium
```

## 3. Variáveis de ambiente

```bash
export BASE_URL=http://localhost:3000          # opcional, esse é o padrão
export TEST_USER_EMAIL="qa.fixo@example.com"    # usuário fictício confirmado
export TEST_USER_PASSWORD="SenhaDoUsuarioFixo"
```

No `.env.local` da raiz do projeto (Next.js), aponte para o **mesmo** projeto
Supabase de teste (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 4. Subir a aplicação

Em um terminal separado, na raiz do projeto:

```bash
npm install
npm run dev
```

## 5. Rodar os testes

```bash
cd tests/e2e
uv run pytest test_autenticacao.py -v
```

## Casos cobertos

| Teste | O que valida |
|---|---|
| `test_cadastro_com_dados_validos_autentica_o_usuario` | Cadastro com e-mail novo (gerado a cada execução) resulta em sessão ativa e redirecionamento para `/fichas`. |
| `test_login_com_credenciais_validas` | Login do usuário fixo de teste leva a `/fichas`. |
| `test_login_com_senha_incorreta_mostra_erro` | Senha errada exibe "E-mail ou senha inválidos." e permanece em `/login`. |
| `test_login_com_email_nao_cadastrado_mostra_erro` | E-mail inexistente exibe a mesma mensagem de erro. |
| `test_logout_encerra_a_sessao_e_redireciona_para_login` | "Sair" encerra a sessão; acesso posterior a `/fichas` volta a exigir login. |
| `test_acesso_a_rota_protegida_sem_sessao_redireciona_para_login` | Sem cookies de sessão, `/fichas` redireciona para `/login` (middleware). |

## Observações

- O app não usa `data-testid`; os seletores usam rótulos/roles visíveis na
  UI (`get_by_label`, `get_by_role`). Se o texto de um rótulo ou botão mudar,
  o teste correspondente precisa ser atualizado.
- Cada execução do teste de cadastro cria um novo usuário no projeto de
  teste (e-mail com sufixo aleatório). Limpe periodicamente a tabela
  `auth.users` / `profiles` do projeto de teste se isso incomodar.
- Esta suíte cobre só Autenticação. CRUD de ficha, edição/autosave e
  rolagem de dados estão descritos no plano de testes, mas ainda não
  automatizados — próximos candidatos naturais para expandir esta pasta.
