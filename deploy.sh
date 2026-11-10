#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Variables
RESOURCE_GROUP="MyRG-centralus"
LOCATION="centralus"
DB_PASSWORD="<your-sql-admin-password>"

echo "Creating Resource Group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

echo "Deploying Infrastructure via Bicep..."
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file main.bicep \
  --parameters dbAdminPassword=$DB_PASSWORD

echo "Deployment finished successfully!"
