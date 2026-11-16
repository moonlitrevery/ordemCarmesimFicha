# Testes de integração/API (Postman)

Coleção `ordem-carmesim.postman_collection.json` e ambiente `ordem-carmesim.postman_environment.json`.

## Pelo Postman
1. Importe os dois arquivos.
2. No ambiente, preencha `supabase_url`, `anon_key` (Supabase → Settings → API) e `test_email`/`test_password` de uma conta **fictícia de teste**.
3. Rode a pasta **Fichas e autenticação** com o Collection Runner, na ordem.

## Pela linha de comando (newman)
```bash
npx newman run tests/api/ordem-carmesim.postman_collection.json \
  -e tests/api/ordem-carmesim.postman_environment.json \
  --env-var anon_key=... --env-var test_email=... --env-var test_password=... \
  --folder "Fichas e autenticação" --reporters cli,junit --reporter-junit-export report/newman.xml
```

A pasta **Segurança** (API-14) só deve rodar com conta de **jogador** descartável: se o DEF-01 ainda estiver no banco, a conta vira mestre.
