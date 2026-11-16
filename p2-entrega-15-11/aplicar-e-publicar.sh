#!/usr/bin/env bash
# Aplica os commits da P2 no repositório e envia um por um ao GitHub,
# para o GitHub Actions rodar o CI em cada commit (inclusive os que falham de propósito).
# Uso (Git Bash, na raiz do repositório ordemCarmesimFicha):
#   bash p2-entrega-15-11/aplicar-e-publicar.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "$(git status --porcelain -- . ':!p2-entrega-15-11')" ]; then
  echo "Há mudanças não commitadas. Faça antes: git add -A && git commit -m 'estado da pasta em 15/11/2026'"
  exit 1
fi
git switch -c p2-testes 2>/dev/null || git switch p2-testes
for p in "$DIR"/patches/*.patch; do
  echo ">> aplicando $(basename "$p")"
  git am --keep-cr "$p"
  git push -u origin p2-testes
  echo "   enviado; esperando 90 s para o Actions começar esta execução..."
  sleep 90
done
echo "Pronto. Veja as execuções em: https://github.com/moonlitrevery/ordemCarmesimFicha/actions"
