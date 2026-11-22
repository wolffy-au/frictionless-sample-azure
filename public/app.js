const statusMessage = document.querySelector("#status");
const tableBody = document.querySelector("#items");

// A paused serverless database can take up to a minute to resume.
const wakeUpDeadlineMs = 2 * 60 * 1000;

async function loadItems() {
  const startedAt = Date.now();

  try {
    let response;
    let result;

    for (;;) {
      response = await fetch("/api/items");
      result = await response.json();

      if (response.status !== 503 || !result.retryable) {
        break;
      }

      const retryAfterMs = (Number(response.headers.get("Retry-After")) || 10) * 1000;
      if (Date.now() - startedAt + retryAfterMs > wakeUpDeadlineMs) {
        break;
      }

      statusMessage.textContent = "Waking the database (this can take up to a minute)...";
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    }

    if (response.status === 503 && result.retryable) {
      throw new Error("Unable to load demo items. Check the API logs for details.");
    }

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
