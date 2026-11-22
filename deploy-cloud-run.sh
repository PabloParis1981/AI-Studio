#!/usr/bin/env bash
set -euo pipefail

echo "AI Studio — publicación privada en Google Cloud Run"
command -v gcloud >/dev/null 2>&1 || { echo "Este script se ejecuta en Google Cloud Shell (gcloud)." >&2; exit 1; }

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  read -rp "ID del proyecto de Google Cloud: " PROJECT_ID
fi
[[ -n "$PROJECT_ID" ]] || { echo "Falta el ID del proyecto."; exit 1; }
gcloud config set project "$PROJECT_ID" >/dev/null

read -rp "Región [southamerica-east1]: " REGION
REGION="${REGION:-southamerica-east1}"
read -rp "Nombre único del bucket [${PROJECT_ID}-ai-studio-data]: " BUCKET
BUCKET="${BUCKET:-${PROJECT_ID}-ai-studio-data}"
BUCKET="$(printf '%s' "$BUCKET" | tr '[:upper:]' '[:lower:]')"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/storage.objectAdmin"

read -rsp "Contraseña privada para AI Studio (mínimo 16 caracteres): " APP_PASSWORD
echo
[[ ${#APP_PASSWORD} -ge 16 ]] || { echo "La contraseña debe tener al menos 16 caracteres."; exit 1; }
read -rsp "Clave GEMINI_API_KEY: " GEMINI_API_KEY
echo
[[ -n "$GEMINI_API_KEY" ]] || { echo "La clave Gemini es necesaria para usar Gemini."; exit 1; }

put_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor" >/dev/null
}
put_secret ai-studio-app-password "$APP_PASSWORD"
put_secret ai-studio-gemini-key "$GEMINI_API_KEY"
unset APP_PASSWORD GEMINI_API_KEY

echo "Desplegando el servicio..."
gcloud run deploy ai-studio \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --max 1 \
  --concurrency 1 \
  --set-env-vars "APP_ENV=production,DATA_DIR=/mnt/data/projects" \
  --set-secrets "APP_PASSWORD=ai-studio-app-password:latest,GEMINI_API_KEY=ai-studio-gemini-key:latest" \
  --add-volume "name=projects,type=cloud-storage,bucket=$BUCKET" \
  --add-volume-mount "volume=projects,mount-path=/mnt/data"

URL="$(gcloud run services describe ai-studio --region "$REGION" --format='value(status.url)')"
echo
echo "AI Studio publicado: $URL"
echo "El navegador pedirá la contraseña privada que configuraste."
echo "Almacenamiento persistente: gs://$BUCKET"
