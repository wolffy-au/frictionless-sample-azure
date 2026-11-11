const statusMessage = document.querySelector("#status");
const tableBody = document.querySelector("#items");

async function loadItems() {
  try {
    const response = await fetch("/api/items");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }

    for (const item of result) {
      const row = document.createElement("tr");
      for (const value of [item.Id, item.Name, item.Category]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      tableBody.append(row);
    }

    statusMessage.textContent = `${result.length} rows loaded from Azure SQL.`;
  } catch (error) {
    statusMessage.textContent = error instanceof Error ? error.message : "Unable to load items.";
  }
}

async function loadVersion() {
  const versionLabel = document.querySelector("#version");

  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }

    const { version, builtAt } = await response.json();
    versionLabel.textContent = `${version} · ${new Date(builtAt).toLocaleString()}`;
    versionLabel.title = `Version ${version}, built ${builtAt}`;
  } catch {
    versionLabel.textContent = "development build";
  }
}

loadItems();
loadVersion();
