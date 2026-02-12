#!/usr/bin/env bash
set -euo pipefail

echo "== Railway preflight (n8n project) =="

required_files=(
  "Dockerfile"
  "railway.toml"
  "README.md"
  "n8n/workflows/kommo_webhook_workflow.json"
  "n8n/workflows/kommo_reconcile_workflow.json"
  "sql/001_schema.sql"
  "sql/002_views.sql"
)

missing=0
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[ERROR] Missing file: $f"
    missing=1
  else
    echo "[OK] $f"
  fi
done

if [[ $missing -eq 1 ]]; then
  echo
  echo "Preflight failed: faltan archivos requeridos."
  exit 1
fi

echo
latest_commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
branch_name="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

echo "Git branch: ${branch_name:-unknown}"
echo "Git commit: ${latest_commit:-unknown}"

echo
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[WARN] Hay cambios sin commit. Railway NO los va a ver hasta commitear/pushear."
  else
    echo "[OK] Working tree limpio."
  fi
fi

echo
cat <<'MSG'
Si Railway muestra en logs:
  The app contents that Railpack analyzed contains:
  ./
  └── .gitkeep

Significa que Railway está construyendo una fuente vacía.
Checklist rápido:
1) Confirmar que el commit está pusheado a GitHub (no solo local).
2) En Railway > Service > Settings > Source:
   - Repo correcto
   - Branch correcta
   - Root Directory = .
3) Trigger Deploy nuevamente desde ese commit.
MSG
