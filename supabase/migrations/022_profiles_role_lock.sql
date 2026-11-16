-- DEF-01 (P2 — Testes e Qualidade): jogador conseguia virar mestre editando
-- o próprio perfil, porque a política profiles_update_own libera a linha
-- inteira, inclusive a coluna role.
-- Correção: o usuário logado só altera as colunas que o app usa.
-- O papel continua sendo trocado só pelo SQL Editor (README, passo 3).
-- Rode no SQL Editor do Supabase.

revoke update on public.profiles from anon, authenticated;
grant update (display_name, color) on public.profiles to authenticated;

notify pgrst, 'reload schema';
