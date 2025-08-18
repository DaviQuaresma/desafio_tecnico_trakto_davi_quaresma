param()
$ErrorActionPreference = "Stop"

# ====== CONFIG ======
$PROJECT_ID = "studious-matrix-469221-g4"
$REGION     = "southamerica-east1"
$BUCKET     = "trakto-videos-469221"
$SA_NAME    = "trakto-videos-uploader"
$SA_EMAIL   = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
$KEY_PATH   = "C:\keys\trakto-uploader.json"
$CORS_FILE  = "scripts\cors.json"
# ====================

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

Write-Host ">> ensure key file"
if (-not (Test-Path $KEY_PATH)) {
  gcloud iam service-accounts keys create $KEY_PATH --iam-account=$SA_EMAIL
} else {
  Write-Host "   chave já existe em $KEY_PATH"
}

Write-Host ">> set CORS no bucket (PUT do browser)"
if (Test-Path $CORS_FILE) {
  gcloud storage buckets update "gs://$BUCKET" --cors-file=$CORS_FILE
} else {
@"
[
  {
    "origin": ["http://localhost:5173"],
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
