#!/usr/bin/env bash
set -Eeuo pipefail

# ====== CONFIG ======
PROJECT_ID="studious-matrix-469221-g4"
REGION="southamerica-east1"
BUCKET="trakto-videos-469221"
SA_NAME="trakto-videos-uploader"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_PATH="C:/keys/trakto-uploader.json"  # caminho Windows (aceita / também)
CORS_FILE="./scripts/cors.json"
# ====================

to_unix() {
  # converte C:/x/y.json -> /c/x/y.json (Git Bash)
  local p="$1"
  if [[ "$p" =~ ^[A-Za-z]:/ ]]; then
    local drive="${p:0:1}"
    echo "/${drive,,}${p:2}"
  else
    echo "$p"
  fi
}

KEY_PATH_UNIX="$(to_unix "$KEY_PATH")"
KEY_DIR_UNIX="$(dirname "$KEY_PATH_UNIX")"

echo ">> set project"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo ">> enable apis (storage, iam)"
gcloud services enable storage.googleapis.com iam.googleapis.com

echo ">> ensure bucket (UBLA on)"
if gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  echo "   bucket já existe: gs://${BUCKET}"
else
  gcloud storage buckets create "gs://${BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

echo ">> ensure service account"
if gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
  echo "   SA já existe: ${SA_EMAIL}"
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Trakto Videos Uploader"
fi

echo ">> bind SA -> bucket (roles/storage.objectAdmin)"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --quiet

echo ">> ensure key dir: ${KEY_DIR_UNIX}"
mkdir -p "${KEY_DIR_UNIX}"

echo ">> ensure key file: ${KEY_PATH}"
if [ -f "${KEY_PATH_UNIX}" ]; then
  echo "   chave já existe em ${KEY_PATH}"
else
  gcloud iam service-accounts keys create "${KEY_PATH}" \
    --iam-account="${SA_EMAIL}"
fi

echo ">> set CORS no bucket (PUT do browser)"
if [ -f "${CORS_FILE}" ]; then
  gcloud storage buckets update "gs://${BUCKET}" --cors-file="${CORS_FILE}"
else
  # aplica um default se não existir
  TMP_CORS="$(mktemp)"
  cat > "${TMP_CORS}" <<JSON
[
  {
    "origin": ["http://localhost:5173"],
    "method": ["GET", "PUT", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
JSON
  gcloud storage buckets update "gs://${BUCKET}" --cors-file="${TMP_CORS}"
  rm -f "${TMP_CORS}"
fi

cat <<EOF

✅ OK

Adicione/valide o .env da API:

GCS_BUCKET=${BUCKET}
GOOGLE_APPLICATION_CREDENTIALS=${KEY_PATH}
GCS_SIGNED_URL_EXPIRES=3600

Dicas:
- Reinicie a API após mudar o .env.
- No GcsService, usei new Storage({ keyFilename }) pra forçar essa key.

Smokes (opcionais):
  npm run gcs:smoke:cp
  npm run gcs:smoke:ls
EOF
