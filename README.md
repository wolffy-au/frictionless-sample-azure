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

The SQL free tier pauses the database for the rest of the month when its free
compute limit is reached. The API will be unable to serve data until the free
allowance resets.
