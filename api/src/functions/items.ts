import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import sql from "mssql";

interface DemoItem {
  Id: number;
  Name: string;
  Category: string;
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;

function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const server = process.env.SQL_SERVER;
    const database = process.env.SQL_DATABASE;
    const user = process.env.SQL_USER;
    const password = process.env.SQL_PASSWORD;

    if (!server || !database || !user || !password) {
      throw new Error("SQL_SERVER, SQL_DATABASE, SQL_USER, and SQL_PASSWORD must be configured.");
    }

    poolPromise = new sql.ConnectionPool({
      server,
      database,
      user,
      password,
      // Long enough for most of a serverless resume, but under the ~45 s
      // Static Web Apps limit on managed Functions requests.
      connectionTimeout: 30000,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    })
      .connect()
      .catch((error: unknown) => {
        poolPromise = undefined;
        throw error;
      });
  }

  return poolPromise;
}

// Cheap read with no transaction or lock. Returns an empty array when the
// table doesn't exist yet (the batch then returns no recordset) or is empty.
async function readItems(pool: sql.ConnectionPool): Promise<DemoItem[]> {
  const result = await pool.request().batch(`
    IF OBJECT_ID(N'dbo.DemoItems', N'U') IS NOT NULL
      SELECT Id, Name, Category
      FROM dbo.DemoItems
      ORDER BY Id;
  `);

  return (result.recordset ?? []) as DemoItem[];
}

// First-use setup: creates and seeds dbo.DemoItems under an application lock,
// so concurrent first requests seed it exactly once.
async function initItems(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().batch(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    DECLARE @lockResult int;
    EXEC @lockResult = sys.sp_getapplock
      @Resource = N'demo-items-initialization',
      @LockMode = N'Exclusive',
      @LockOwner = N'Transaction',
      @LockTimeout = 10000;

    IF @lockResult < 0
      THROW 51000, 'Could not acquire the demo data initialization lock.', 1;

    IF OBJECT_ID(N'dbo.DemoItems', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DemoItems (
        Id int NOT NULL PRIMARY KEY,
        Name nvarchar(100) NOT NULL,
        Category nvarchar(100) NOT NULL
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.DemoItems)
    BEGIN
      INSERT INTO dbo.DemoItems (Id, Name, Category)
      VALUES
        (1, N'Notebook', N'Stationery'),
        (2, N'Coffee mug', N'Kitchen'),
        (3, N'Backpack', N'Travel');
    END;

    COMMIT TRANSACTION;
  `);
}

async function getItems(): Promise<DemoItem[]> {
  const pool = await getPool();
  let items = await readItems(pool);

  if (items.length === 0) {
    await initItems(pool);
    items = await readItems(pool);
  }

  return items;
}

// True when the error means the serverless database is resuming from
// auto-pause, so the request is worth retrying shortly.
function isDatabaseWakingUp(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const { code, number, originalError } = error as Error & {
    code?: string;
    number?: number;
    originalError?: { number?: number };
  };

  // 40613 "Database ... is not currently available" raised by a query.
  if (number === 40613 || originalError?.number === 40613) {
    return true;
  }

  // Timeouts and socket errors from a query are not about waking up.
  if (error instanceof sql.RequestError) {
    return false;
  }

  // While connecting, tedious reports 40613 as ELOGIN with the server's
  // message but without the error number.
  return (
    code === "ETIMEOUT" ||
    code === "ESOCKET" ||
    (code === "ELOGIN" && error.message.includes("is not currently available"))
  );
}

async function handleItems(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    return {
      jsonBody: await getItems(),
    };
  } catch (error) {
    if (isDatabaseWakingUp(error)) {
      context.warn("Azure SQL is resuming from auto-pause; asking the client to retry.", error);
      return {
        status: 503,
        headers: { "Retry-After": "10" },
        jsonBody: { error: "The database is waking up. Retrying...", retryable: true },
      };
    }

    context.error("Unable to load demo items from Azure SQL.", error);
    return {
      status: 500,
      jsonBody: { error: "Unable to load demo items. Check the API logs for details." },
    };
  }
}

app.http("items", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "items",
  handler: handleItems,
});
