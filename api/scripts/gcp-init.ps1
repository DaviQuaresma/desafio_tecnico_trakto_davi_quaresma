param()
$ErrorActionPreference = "Stop"

# ====== CONFIG ======
$PROJECT_ID = "studious-matrix-469221-g4"
$REGION     = "southamerica-east1"
$BUCKET     = "trakto-videos-469221"
$SA_NAME    = "trakto-videos-uploader"
$SA_EMAIL   = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
$KEY_PATH   = "..\secrets\gcp_sa.json"
$CORS_FILE  = "..\cors.json"
# ====================

# Verifica se está autenticado no gcloud
try {
    gcloud auth list --filter=status:ACTIVE --format="value(account)" | Out-Null
} catch {
    Write-Host "Você não está autenticado no Google Cloud CLI."
    Write-Host "Execute: gcloud auth login"
    exit 1
}

Write-Host ">> set project"
gcloud config set project $PROJECT_ID | Out-Null

Write-Host ">> enable apis (storage, iam)"
gcloud services enable storage.googleapis.com iam.googleapis.com

Write-Host ">> ensure bucket (UBLA on)"
$bucketExists = $true
try { gcloud storage buckets describe "gs://$BUCKET" | Out-Null } catch { $bucketExists = $false }
if (-not $bucketExists) {
  gcloud storage buckets create "gs://$BUCKET" --location=$REGION --uniform-bucket-level-access
} else {
  Write-Host "   bucket já existe: gs://$BUCKET"
}

Write-Host ">> ensure service account"
$saExists = $true
try { gcloud iam service-accounts describe $SA_EMAIL | Out-Null } catch { $saExists = $false }
if (-not $saExists) {
  gcloud iam service-accounts create $SA_NAME --display-name "Trakto Videos Uploader"
} else {
  Write-Host "   SA já existe: $SA_EMAIL"
}

Write-Host ">> bind SA -> bucket (roles/storage.objectAdmin)"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/storage.objectAdmin" `
  --quiet

Write-Host ">> ensure key dir"
$dir = Split-Path -Parent $KEY_PATH
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

Write-Host ">> gerar nova chave da service account"
if (Test-Path $KEY_PATH) { Remove-Item $KEY_PATH }
gcloud iam service-accounts keys create $KEY_PATH --iam-account=$SA_EMAIL

Write-Host ">> set CORS no bucket (PUT do browser)"
if (Test-Path $CORS_FILE) {
  gcloud storage buckets update "gs://$BUCKET" --cors-file=$CORS_FILE
} else {
@"
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
"@ | Set-Content -Path "$env:TEMP\cors.json" -Encoding UTF8
  gcloud storage buckets update "gs://$BUCKET" --cors-file "$env:TEMP\cors.json"
}
Write-Host ""
Write-Host "✅ OK"
Write-Host ""
Write-Host "Adicione ao .env da API:"
Write-Host "GCS_BUCKET=$BUCKET"
Write-Host "GOOGLE_APPLICATION_CREDENTIALS=$KEY_PATH"
Write-Host "GCS_SIGNED_URL_EXPIRES=3600"