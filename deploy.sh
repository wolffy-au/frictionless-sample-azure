#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(dirname "$0")/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-MyRG-centralus}"
LOCATION="${LOCATION:-centralus}"

if [[ -z "${DB_ADMIN_PASSWORD:-}" ]]; then
  read -r -s -p "SQL administrator password: " DB_ADMIN_PASSWORD
  printf '\n'
fi

if [[ -z "$DB_ADMIN_PASSWORD" ]]; then
  echo "DB_ADMIN_PASSWORD must not be empty." >&2
  exit 1
fi

echo "Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "Deploying infrastructure..."
STATIC_WEB_APP_NAME=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep \
  --parameters location="$LOCATION" dbAdminPassword="$DB_ADMIN_PASSWORD" \
  --query 'properties.outputs.staticWebAppName.value' \
  --output tsv)

echo "Building the API..."
npm --prefix api ci
npm --prefix api run build

echo "Writing build version..."
BUILD_VERSION=$(git describe --tags --always --dirty)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{\n  "version": "%s",\n  "builtAt": "%s"\n}\n' "$BUILD_VERSION" "$BUILD_TIME" > public/version.json
echo "Build version: $BUILD_VERSION ($BUILD_TIME)"

echo "Getting the Static Web App deployment token..."
SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.apiKey \
  --output tsv)

if [[ -z "$SWA_CLI_DEPLOYMENT_TOKEN" || "$SWA_CLI_DEPLOYMENT_TOKEN" == "None" ]]; then
  echo "Could not retrieve a deployment token for '$STATIC_WEB_APP_NAME'." >&2
  exit 1
fi

export SWA_CLI_DEPLOYMENT_TOKEN
echo "Deploying the frontend and API..."
npm --prefix api exec -- swa deploy ./public \
  --api-location ./api \
  --api-language node \
  --api-version 24 \
  --deployment-token "$SWA_CLI_DEPLOYMENT_TOKEN" \
  --app-name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --subscription-id "$(az account show --query id --output tsv)" \
  --tenant-id "$(az account show --query tenantId --output tsv)" \
  --env production

echo "Deployment finished. Open the Static Web App and the API will create the demo table and three sample rows on first request."
