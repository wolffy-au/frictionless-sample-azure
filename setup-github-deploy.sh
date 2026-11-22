#!/usr/bin/env bash
# One-time setup for .github/workflows/deploy.yml.
#
# Lets GitHub Actions deploy this project without stored keys: creates a
# Microsoft Entra app registration with a federated credential that trusts
# only this repository's "production" environment, and gives it the
# Contributor role on the resource group. Then stores the settings in the
# repository's "production" environment.
#
# Requires az and gh, both signed in. Safe to re-run.
set -euo pipefail

# Git Bash on Windows rewrites arguments that start with "/" into Windows
# paths, which breaks resource IDs such as /subscriptions/...; keep them as-is.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")"

ENV_FILE=".env"
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

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
ENVIRONMENT=production
SUBJECT="repo:$REPO:environment:$ENVIRONMENT"

APP_NAME="github-deploy-${REPO#*/}"
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
TENANT_ID=$(az account show --query tenantId --output tsv)

echo "Creating the resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
RESOURCE_GROUP_ID=$(az group show --name "$RESOURCE_GROUP" --query id --output tsv)

echo "Creating the app registration and its service principal..."
CLIENT_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" --output tsv)
if [[ -z "$CLIENT_ID" ]]; then
  CLIENT_ID=$(az ad app create --display-name "$APP_NAME" --query appId --output tsv)
fi
if ! az ad sp show --id "$CLIENT_ID" > /dev/null 2>&1; then
  az ad sp create --id "$CLIENT_ID" --output none
fi
PRINCIPAL_ID=$(az ad sp show --id "$CLIENT_ID" --query id --output tsv)

echo "Letting $SUBJECT sign in as the app..."
if [[ -z "$(az ad app federated-credential list --id "$CLIENT_ID" \
  --query "[?subject=='$SUBJECT'].name" --output tsv)" ]]; then
  az ad app federated-credential create --id "$CLIENT_ID" --output none --parameters "{
    \"name\": \"github-$ENVIRONMENT\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$SUBJECT\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
fi

echo "Granting the app the role deploy.sh needs..."
# deploy.sh updates the resource group, deploys main.bicep into it and reads
# the Static Web App deployment token.
if [[ -z "$(az role assignment list --assignee "$PRINCIPAL_ID" --role Contributor \
  --scope "$RESOURCE_GROUP_ID" --query "[].id" --output tsv)" ]]; then
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal --role Contributor \
    --scope "$RESOURCE_GROUP_ID" --output none
fi

echo "Storing the settings in the $REPO \"$ENVIRONMENT\" environment..."
gh api --method PUT "repos/$REPO/environments/$ENVIRONMENT" --silent
gh variable set AZURE_CLIENT_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$SUBSCRIPTION_ID"
gh variable set RESOURCE_GROUP --repo "$REPO" --env "$ENVIRONMENT" --body "$RESOURCE_GROUP"
gh variable set LOCATION --repo "$REPO" --env "$ENVIRONMENT" --body "$LOCATION"
# Read from stdin so the password never appears on a command line.
printf '%s' "$DB_ADMIN_PASSWORD" |
  gh secret set DB_ADMIN_PASSWORD --repo "$REPO" --env "$ENVIRONMENT"

echo "Done. Pushing a version tag (git tag vX.Y.Z && git push origin vX.Y.Z) now deploys."
