set -euo pipefail

# ====== CONFIG ======
PROJECT_ID="studious-matrix-469221-g4"
REGION="southamerica-east1"
BUCKET="trakto-videos-469221"
SA_NAME="trakto-videos-uploader"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_PATH="C:/keys/gcs-sa.json"   # caminho Windows (funciona no Git Bash)
# ====================

echo ">> set project"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo ">> enable apis (storage, iam)"
gcloud services enable storage.googleapis.com iam.googleapis.com

echo ">> create bucket if missing (UBLA on)"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" --location="${REGION}" --uniform-bucket-level-access
else
  echo "   bucket já existe: gs://${BUCKET}"
fi

echo ">> create service account if missing"
if ! gcloud iam service-accounts list --format="value(email)" --filter="email=${SA_EMAIL}" | grep -q "${SA_EMAIL}"; then
  gcloud iam service-accounts create "${SA_NAME}" --display-name="Trakto Videos Uploader"
else
  echo "   SA já existe: ${SA_EMAIL}"
fi

echo ">> bind SA -> bucket (roles/storage.objectAdmin)"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

echo ">> create key file if missing"
# cria C:\keys e a chave
powershell.exe -Command "if(!(Test-Path 'C:\\keys')){ New-Item -ItemType Directory -Path 'C:\\keys' | Out-Null }"
if [ ! -f "/c/keys/gcs-sa.json" ]; then
  gcloud iam service-accounts keys create "${KEY_PATH}" --iam-account="${SA_EMAIL}"
else
  echo "   chave já existe em ${KEY_PATH}"
fi

cat <<EOF

OK 
Adicione/ou confirme seu .env da API:

GCS_BUCKET=${BUCKET}
GOOGLE_APPLICATION_CREDENTIALS=${KEY_PATH}
GCS_SIGNED_URL_EXPIRES=3600

Smoke:
  npm run gcs:smoke:cp && npm run gcs:smoke:ls
  npm run gcs:url
EOF
