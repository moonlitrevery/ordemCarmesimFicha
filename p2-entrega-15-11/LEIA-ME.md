# Entrega P2 — material gerado em 15/11/2026

- `P2_TQS_Apendices_Ordem_Carmesim.docx` / `.pdf` — Apêndices A–M preenchidos + anexos.
- `P2_TQS_Metricas_Ordem_Carmesim.xlsx` — métricas com fórmulas e gráficos (pasta 11).
- `patches/` — 9 commits (CI, testes de integração, correção do DEF-01, TDD RED/GREEN/REFACTOR, Postman, SonarQube).
- `aplicar-e-publicar.sh` — aplica os commits numa branch `p2-testes` e envia um por um ao GitHub.
- `evidencias/` — logs de execução, não funcionais (Lighthouse, tempos, capturas) e análise de qualidade.

## Passos que dependem de vocês
1. Commitar o estado atual da pasta e rodar `bash p2-entrega-15-11/aplicar-e-publicar.sh` (Git Bash).
2. GitHub → Settings → Secrets → Actions: criar `TEST_USER_EMAIL` e `TEST_USER_PASSWORD` (conta fictícia de jogador). `SUPABASE_URL` e `SUPABASE_ANON_KEY` já existem.
3. Rodar `supabase/migrations/022_profiles_role_lock.sql` no SQL Editor do Supabase (corrige o DEF-01).
4. Actions → "Qualidade — SonarQube" → Run workflow, no primeiro e no último commit da branch.
5. Prints das execuções vermelhas e verdes do CI → pasta 12.
