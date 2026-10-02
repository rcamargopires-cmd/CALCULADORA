#!/usr/bin/env bash
set -euo pipefail

BACKUP_URI="${1:-}"
if [ -z "$BACKUP_URI" ]; then
  echo "Uso: MOTYQ_RESTORE_CONFIRM=RESTORE ./scripts/firestore-restore.sh gs://bucket/motyq-backups/<backup>"
  exit 1
fi

if [ "${MOTYQ_RESTORE_CONFIRM:-}" != "RESTORE" ]; then
  echo "Restauração bloqueada. Defina MOTYQ_RESTORE_CONFIRM=RESTORE após conferir projeto, database e backup."
  exit 1
fi

: "${GOOGLE_APPLICATION_CREDENTIALS:?Defina GOOGLE_APPLICATION_CREDENTIALS para a conta de serviço autorizada.}"

PROJECT_ID="${FIREBASE_PROJECT_ID:-gen-lang-client-0531247430}"
DATABASE_ID="${FIREBASE_DATABASE_ID:-ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b}"

echo "ATENÇÃO: iniciando restauração"
echo "Projeto:  $PROJECT_ID"
echo "Database: $DATABASE_ID"
echo "Backup:   $BACKUP_URI"

gcloud firestore import "$BACKUP_URI" \
  --project="$PROJECT_ID" \
  --database="$DATABASE_ID"

echo "Restauração concluída. Execute o Diagnóstico DMS antes de reabrir operações destrutivas."
