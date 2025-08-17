param()

# ====== CONFIG ======
$PROJECT_ID = "studious-matrix-469221-g4"
$REGION = "southamerica-east1"
$BUCKET = "trakto-videos-469221"
$SA_NAME = "trakto-videos-uploader"
$SA_EMAIL = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
$KEY_PATH = "C:\keys\gcs-sa.json"
# ====================

Write-Host ">> set project"
gcloud config set project $PROJECT_ID | Out-Null

Write-Host ">> enable apis (storage, iam)"
gcloud services enable storage.googleapis.com iam.googleapis.com

Write-Host ">> create bucket if missing (UBLA on)"
$bucketExists = 0 -eq (gcloud storage buckets describe "gs://$BUCKET" *> $null; $LASTEXITCODE)
if (-not $bucketExists) {
  gcloud storage buckets create "gs://$BUCKET" --location=$REGION --uniform-bucket-level-access
} else {
  Write-Host "   bucket já existe: gs://$BUCKET"
}

Write-Host ">> create service account if missing"
$saExists = (gcloud iam service-accounts list --format="value(email)" --filter="email=$SA_EMAIL") -ne ""
if (-not $saExists) {
  gcloud iam service-accounts create $SA_NAME --display-name="Trakto Videos Uploader"
} else {
  Write-Host "   SA já existe: $SA_EMAIL"
}

Write-Host ">> bind SA -> bucket (roles/storage.objectAdmin)"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/storage.objectAdmin"

Write-Host ">> create key file if missing"
if (-not (Test-Path "C:\keys")) { New-Item -ItemType Directory -Path "C:\keys" | Out-Null }
if (-not (Test-Path $KEY_PATH)) {
  gcloud iam service-accounts keys create $KEY_PATH --iam-account=$SA_EMAIL
} else {
  Write-Host "   chave já existe em $KEY_PATH"
}

Write-Host ""
Write-Host "OK ✅"
Write-Host "Adicione/ou confirme seu .env da API:"
Write-Host ""
Write-Host "GCS_BUCKET=$BUCKET"
Write-Host "GOOGLE_APPLICATION_CREDENTIALS=$KEY_PATH"
Write-Host "GCS_SIGNED_URL_EXPIRES=3600"
Write-Host ""
Write-Host "Smoke:"
Write-Host "  npm run gcs:smoke:cp && npm run gcs:smoke:ls"
Write-Host "  npm run gcs:url"
