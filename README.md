# frictionless-sample-azure

A minimal, low-cost Azure sample: a Free Azure Static Web App, an Azure SQL
free-tier database, and a TypeScript Functions API, deployed with a single
script. The page calls `/api/items`; on its first request, the API creates
`dbo.DemoItems` and inserts three sample rows if the table is empty.

## Project layout

| Path | Contents |
| --- | --- |
| `main.bicep` | Infrastructure: Static Web App, Azure SQL server and free-tier database |
| `api/` | TypeScript Azure Functions API (`src/functions/items.ts`) |
| `public/` | Static frontend (`index.html`, `app.js`) |
| `deploy.sh` | Provisions the infrastructure, builds the API and publishes the app |

## Prerequisites

- An Azure subscription
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Node.js 24 and npm (the version is pinned in `.nvmrc` and `.node-version`)
- Bash and git

## Deploy

From Bash:

```bash
az login
bash deploy.sh
```

The script prompts for the SQL administrator password unless `DB_ADMIN_PASSWORD`
is set in the environment. It deploys the Bicep resources, builds the API, obtains
the Static Web App deployment token using Azure CLI, then uses `npx` to publish
`public/` and `api/` with the Node.js 20 Functions runtime.

The resource group and region default to `MyRG-centralus` and `centralus`.
Override them with environment variables:

```bash
RESOURCE_GROUP=my-rg LOCATION=eastus2 bash deploy.sh
```

Never commit the SQL password. `.env` is git-ignored if you want to keep local
settings there.

## Build version

Before publishing, the script writes `public/version.json` with the output of
`git describe --tags --always --dirty` and the UTC build time. The page footer
shows this so you can tell which build is live:

- Without tags, the version is the short commit hash, for example `abad415`.
- After tagging a release (`git tag v1.0.0`), it shows the distance from that
  tag, for example `v1.0.0-3-gabad415` (three commits after v1.0.0, at commit
  `abad415`). Push tags with `git push --tags` so other clones see them.
- A `-dirty` suffix means the deploy included uncommitted changes to tracked
  files.

Without the file, for example when opening `public/` locally, the footer reads
"development build".

## Free-tier limits

The SQL free tier pauses the database for the rest of the month when its free
compute limit is reached. The API will be unable to serve data until the free
allowance resets.

## License

Copyright (C) 2026 Stephan Borg

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3 of the License. See [LICENSE](LICENSE) for the
full text.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.
