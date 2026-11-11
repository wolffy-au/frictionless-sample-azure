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

async function getItems(): Promise<DemoItem[]> {
  const pool = await getPool();
  const result = await pool.request().batch(`
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

    SELECT Id, Name, Category
    FROM dbo.DemoItems
    ORDER BY Id;
  `);

  return result.recordset as DemoItem[];
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
