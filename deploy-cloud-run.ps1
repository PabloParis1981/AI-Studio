$ErrorActionPreference = "Stop"

function Invoke-Gcloud {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GcloudArgs)
  & gcloud @Args
  if ($LASTEXITCODE -ne 0) { throw "Falló gcloud $($Args -join ' ')" }
}

Write-Host "AI Studio - publicación privada en Google Cloud Run" -ForegroundColor Cyan
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Falta Google Cloud CLI. Instalalo desde https://cloud.google.com/sdk/docs/install y volvé a ejecutar este archivo."
}
$active = (& gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null | Select-Object -First 1)
if (-not $active) { Invoke-Gcloud auth login }

$ProjectId = Read-Host "Pegá el ID del proyecto de Google Cloud"
if ([string]::IsNullOrWhiteSpace($ProjectId)) { throw "Falta el ID del proyecto." }
$Region = Read-Host "Región (Enter = southamerica-east1, São Paulo)"
if ([string]::IsNullOrWhiteSpace($Region)) { $Region = "southamerica-east1" }
$Bucket = Read-Host "Nombre único para guardar tus proyectos (Enter = $ProjectId-ai-studio-data)"
if ([string]::IsNullOrWhiteSpace($Bucket)) { $Bucket = "$ProjectId-ai-studio-data" }
$Bucket = $Bucket.ToLowerInvariant()

Invoke-Gcloud config set project $ProjectId
Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com
$ProjectNumber = (& gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()
if (-not $ProjectNumber) { throw "No pude obtener el número del proyecto." }
$ServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"

& gcloud storage buckets describe "gs://$Bucket" *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Gcloud storage buckets create "gs://$Bucket" --location=$Region --uniform-bucket-level-access
}
Invoke-Gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$ServiceAccount" --role="roles/storage.objectAdmin"

function Set-SecretVersion {
  param([string]$Name, [string]$Prompt, [switch]$Optional)
  $secure = Read-Host $Prompt -AsSecureString
  if ($Optional -and $secure.Length -eq 0) { return $false }
  if ($secure.Length -eq 0) { throw "El secreto $Name es obligatorio." }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($Name -eq "ai-studio-app-password" -and $plain.Length -lt 16) { throw "La contraseña debe tener al menos 16 caracteres." }
  & gcloud secrets describe $Name *> $null
  if ($LASTEXITCODE -ne 0) { Invoke-Gcloud secrets create $Name --replication-policy=automatic }
  $plain | & gcloud secrets versions add $Name --data-file=-
  if ($LASTEXITCODE -ne 0) { throw "No pude guardar el secreto $Name." }
  Invoke-Gcloud secrets add-iam-policy-binding $Name --member="serviceAccount:$ServiceAccount" --role="roles/secretmanager.secretAccessor"
  $plain = $null
  return $true
}

[void](Set-SecretVersion "ai-studio-app-password" "Creá una contraseña privada (mínimo 16 caracteres)")
$hasGemini = Set-SecretVersion "ai-studio-gemini-key" "Pegá tu clave GEMINI_API_KEY" -Optional
$secretBindings = "APP_PASSWORD=ai-studio-app-password:latest"
if ($hasGemini) { $secretBindings += ",GEMINI_API_KEY=ai-studio-gemini-key:latest" }

Write-Host "Publicando AI Studio. Esto puede tardar varios minutos..." -ForegroundColor Yellow
Invoke-Gcloud run deploy ai-studio --source . --region $Region --allow-unauthenticated --port 8080 --memory 2Gi --cpu 2 --timeout 900 --max 1 --concurrency 1 --set-env-vars "APP_ENV=production,DATA_DIR=/mnt/data/projects" --set-secrets $secretBindings --add-volume "name=projects,type=cloud-storage,bucket=$Bucket" --add-volume-mount "volume=projects,mount-path=/mnt/data"

$Url = (& gcloud run services describe ai-studio --region $Region --format="value(status.url)").Trim()
Write-Host ""
Write-Host "Publicación terminada: $Url" -ForegroundColor Green
Write-Host "Abrí esa dirección. El navegador te pedirá la contraseña privada que acabás de crear."
Write-Host "Tus proyectos se guardan en el bucket: gs://$Bucket"
