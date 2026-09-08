import { Pool, QueryResultRow } from "pg";
import { DbCredentials } from "./types";
import { getSession } from "./session";
import { getOrCreateTunnel, testSshConnection } from "./ssh-tunnel";

// Global cache of connection pools keyed by credentials string
const globalPools = new Map<string, Pool>();

function getPoolKey(creds: DbCredentials, effectivePort: number): string {
  if (creds.sshTunnel?.enabled) {
    return `${creds.user}@ssh://${creds.sshTunnel.sshUser}@${creds.sshTunnel.sshHost}->${creds.host}:${creds.port}[local:${effectivePort}]/${creds.database}`;
  }
  return `${creds.user}@${creds.host}:${creds.port}/${creds.database}`;
}

export async function getDbPool(creds: DbCredentials): Promise<Pool> {
  let effectiveHost = creds.host;
  let effectivePort = creds.port;

  if (creds.sshTunnel?.enabled) {
    effectivePort = await getOrCreateTunnel(
      creds.sshTunnel,
      creds.host || "127.0.0.1",
      creds.port || 5432
    );
    effectiveHost = "127.0.0.1";
  }

  const key = getPoolKey(creds, effectivePort);
  let pool = globalPools.get(key);

  if (!pool) {
    pool = new Pool({
      host: effectiveHost,
      port: effectivePort,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });

    pool.on("error", (err) => {
      console.error(`[DB Pool Error for ${key}]:`, err.message);
    });

    globalPools.set(key, pool);
  }

  return pool;
}

export async function testDbConnection(creds: DbCredentials): Promise<{ success: boolean; message?: string }> {
  let effectiveHost = creds.host;
  let effectivePort = creds.port;

  // 1. If SSH tunnel is requested, test SSH handshake first
  if (creds.sshTunnel?.enabled) {
    const sshTest = await testSshConnection(creds.sshTunnel);
    if (!sshTest.success) {
      return { success: false, message: sshTest.message || "Failed to establish SSH connection to VPS." };
    }

    try {
      effectivePort = await getOrCreateTunnel(
        creds.sshTunnel,
        creds.host || "127.0.0.1",
        creds.port || 5432
      );
      effectiveHost = "127.0.0.1";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `SSH Tunnel Setup Failed: ${msg}` };
    }
  }

  // 2. Test PostgreSQL query through the (direct or tunneled) connection
  const testPool = new Pool({
    host: effectiveHost,
    port: effectivePort,
    database: creds.database,
    user: creds.user,
    password: creds.password,
    ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
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
    return { success: false, message: `PostgreSQL Auth/Connect Error: ${errorMsg}` };
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

  const pool = await getDbPool(creds);
  const res = await pool.query<T>(text, params);
  return res.rows;
}
