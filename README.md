# Azure SQL demo

This demo deploys a Free Azure Static Web App, an Azure SQL free-tier database,
and a TypeScript Functions API. The page calls `/api/items`; on its first request,
the API creates `dbo.DemoItems` and inserts three sample rows if the table is empty.

## Deploy

From Bash with Azure CLI and Node.js/npm available:

```bash
az login
bash deploy.sh
```

The script prompts for the SQL administrator password unless `DB_ADMIN_PASSWORD`
is set in the environment. It deploys the Bicep resources, builds the API, obtains
the Static Web App deployment token using Azure CLI, then uses `npx` to publish
`public/` and `api/` with the Node.js 20 Functions runtime.

The SQL free tier pauses the database for the rest of the month when its free
compute limit is reached. The API will be unable to serve data until the free
allowance resets.
