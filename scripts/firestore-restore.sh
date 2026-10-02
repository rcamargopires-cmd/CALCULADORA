#!/usr/bin/env bash
set -euo pipefail

BACKUP_URI="${1:-}"
if [ -z "$BACKUP_URI" ]; then
  echo "Uso: ./scripts/firestore-restore.sh gs://bucket/motyq-backups/<backup>"
  exit 1
fi

: "${GOOGLE_APPLICATION_CREDENTIALS:?Defina GOOGLE_APPLICATION_CREDENTIALS para a conta de serviço autorizada.}"

gcloud firestore import "$BACKUP_URI" \
  --project=gen-lang-client-0531247430 \
  --database=ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b \
  --async

echo "Restauração solicitada. Acompanhe o status no Google Cloud Console."
