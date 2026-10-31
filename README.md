# Ordem Carmesim

Site de fichas, lore e regras para a campanha de RPG **Ordem Carmesim**.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Framer Motion
- Supabase (Auth + Postgres + RLS)
- Deploy: Vercel + Supabase (free tier)

## Setup local

1. Copie `.env.local.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. No SQL Editor do Supabase, rode `supabase/schema.sql`.

3. Crie a conta em `/cadastro`. Para virar mestre:

```sql
update public.profiles set role = 'mestre' where id = '<uuid-do-usuario>';
```

4. Rode:

```bash
npm install
npm run dev
```

## Conteúdo

Arquivos em `content/lore/*.mdx` e `content/regras/*.mdx` têm placeholders `{/* COLAR AQUI */}` — cole o texto narrativo neles.

## Nota Windows

Neste ambiente, o build do Next.js pode falhar no `realpath` nativo. O script `scripts/patch-next-realpath.mjs` (rodado no `postinstall`/`dev`/`build`) corrige isso automaticamente.

## Deploy na Vercel

1. No projeto da Vercel: **Settings → Environment Variables**, adicione (Production e Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = URL do projeto (Supabase → Settings → API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = chave `anon` / `public`

2. **Redeploy** depois de salvar as variáveis (o deploy anterior não as recebe sozinho).

3. No Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://seu-app.vercel.app`
   - Redirect URLs: `https://seu-app.vercel.app/**`

## Testes

- Unitários: `npm test` (Vitest, ex.: fórmula de HP máximo em `src/lib/calculations.test.ts`).
- E2E (Playwright/Python, autenticação): ver `tests/e2e/README.md`.
- Plano de testes completo: `docs/qa/plano-de-testes-ordem-carmesim.docx`.

## Rolagens ao vivo (mestra)

1. Rode `supabase/migrations/003_dice_rolls.sql` no SQL Editor.
2. No Supabase → Database → Replication, confirme que `dice_rolls` está no Realtime (o SQL já tenta adicionar).
3. Conta com `role = mestre` vê o link **Rolagens** no menu (`/rolagens`).

## LEIA-ME: ligar o Blob store (uploads da Mesa)

1. Na Vercel, abra o projeto → **Storage** → **Create** → **Blob**, com acesso **público**, e conecte ao projeto. Isso cria `BLOB_READ_WRITE_TOKEN`.
2. Faça um novo deploy para a variável valer em produção.
3. Para testar local, rode `vercel env pull .env.local` ou copie o token para o `.env.local` e reinicie o `npm run dev`.
4. Rode `supabase/migrations/008_vtt_assets.sql` no SQL Editor.

Se a cota do plano Hobby (1 GB armazenado, 10 GB de transferência por mês) estourar, o Blob bloqueia até o mês virar, sem cobrança.
