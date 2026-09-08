import { Pool, QueryResultRow } from "pg";
import { DbCredentials } from "./types";
import { getSession } from "./session";

// Global cache of connection pools keyed by credentials string
const globalPools = new Map<string, Pool>();

function getPoolKey(creds: DbCredentials): string {
  return `${creds.user}@${creds.host}:${creds.port}/${creds.database}`;
}

export function getDbPool(creds: DbCredentials): Pool {
  const key = getPoolKey(creds);
  let pool = globalPools.get(key);

  if (!pool) {
    pool = new Pool({
      host: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error(`[DB Pool Error for ${key}]:`, err.message);
    });

    globalPools.set(key, pool);
  }

  return pool;
}

export async function testDbConnection(creds: DbCredentials): Promise<{ success: boolean; message?: string }> {
  const testPool = new Pool({
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.user,
    password: creds.password,
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5000,
    max: 1,
  });

  try {
    const client = await testPool.connect();
    try {
      await client.query("SELECT 1");
      return { success: true };
    } finally {
      client.release();
      await testPool.end();
    }
  } catch (err: unknown) {
    await testPool.end().catch(() => {});
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: errorMsg };
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  customCreds?: DbCredentials
): Promise<T[]> {
  let creds = customCreds;
  if (!creds) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.db) {
      throw new Error("UNAUTHORIZED: No active database session found. Please log in.");
    }
    creds = session.db;
  }

  const pool = getDbPool(creds);
  const res = await pool.query<T>(text, params);
  return res.rows;
}
