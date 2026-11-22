# frictionless-sample-azure

A minimal, low-cost Azure sample: a Free Azure Static Web App, an Azure SQL
free-tier database, and a TypeScript Functions API, deployed with a single
script. The page calls `/api/items`; on its first request, the API creates
`dbo.DemoItems` and inserts three sample rows if the table is empty. It is the
Azure counterpart of
[frictionless-sample-gcp](https://github.com/wolffy-au/frictionless-sample-gcp).

## Project layout

| Path | Contents |
| --- | --- |
| `main.bicep` | Infrastructure: Static Web App, Azure SQL server and free-tier database |
| `api/` | TypeScript Azure Functions API (`src/functions/items.ts`) |
| `public/` | Static frontend (`index.html`, `app.js`) |
| `deploy.sh` | Provisions the infrastructure, builds the API and publishes the app |
| `.github/workflows/deploy.yml` | GitHub Actions: runs `deploy.sh` when a version tag is pushed |
| `setup-github-deploy.sh` | One-time setup of the keyless sign-in and settings the workflow uses |

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
`public/` and `api/` with the Node.js 22 Functions runtime, the newest that
the Static Web Apps CLI accepts for managed Functions.

The resource group and region default to `MyRG-centralus` and `centralus`.
Override them with environment variables:

```bash
RESOURCE_GROUP=my-rg LOCATION=eastus2 bash deploy.sh
```

Never commit the SQL password. `.env` is git-ignored if you want to keep local
settings there.

## Deploy from GitHub Actions

Pushing a version tag deploys automatically:

```bash
git tag v1.2.3
git push origin v1.2.3
```

To test a branch before tagging it, run the workflow by hand: **Actions** >
**Deploy** > **Run workflow** on GitHub, or
`gh workflow run deploy.yml --ref <branch>`.
This also deploys to production; the page footer then shows the untagged build
version, for example `v1.0.0-3-gabad415`.

The workflow (`.github/workflows/deploy.yml`) runs `deploy.sh` in the
repository's `production` environment. It signs in to Azure through a federated
credential (OpenID Connect), so no Azure secret or key is stored in GitHub.

Set this up once, with `az` and the [GitHub CLI](https://cli.github.com)
(`gh`) both signed in and `DB_ADMIN_PASSWORD` set in `.env` (or entered when
prompted):

```bash
bash setup-github-deploy.sh
```

It creates a `github-deploy-frictionless-sample-azure` app registration whose
federated credential trusts only this repository's `production` environment.
It grants the app the Contributor role on the resource group, and stores the
settings as variables in the `production` environment. The SQL password is
stored there as the `DB_ADMIN_PASSWORD` secret. It is safe to re-run.

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

The serverless database also pauses itself after an hour without connections,
and the next request takes up to a minute to resume it. Meanwhile the API
answers 503 with `Retry-After: 10`, and the page shows "Waking the database"
and retries for up to two minutes, so the first load succeeds without a reload.

## License

Copyright (C) 2026 Stephan Borg

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3 of the License. See [LICENSE](LICENSE) for the
full text.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.
