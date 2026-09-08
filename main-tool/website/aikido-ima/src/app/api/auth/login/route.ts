import { NextRequest, NextResponse } from "next/server";
import { testDbConnection } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DbCredentials, SshTunnelConfig } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { host, port, database, user, password, ssl, sshTunnel } = body;

    if (!database || !user) {
      return NextResponse.json(
        { success: false, error: "Database name and username are required." },
        { status: 400 }
      );
    }

    let parsedSshTunnel: SshTunnelConfig | undefined = undefined;

    if (sshTunnel?.enabled) {
      if (!sshTunnel.sshHost || !sshTunnel.sshUser) {
        return NextResponse.json(
          { success: false, error: "SSH Host (VPS IP) and SSH User are required when SSH Tunnel is enabled." },
          { status: 400 }
        );
      }

      if (sshTunnel.sshAuthType === "key" && !sshTunnel.sshPrivateKey?.trim()) {
        return NextResponse.json(
          { success: false, error: "SSH Private Key is required when Key authentication is selected." },
          { status: 400 }
        );
      }

      if (sshTunnel.sshAuthType === "password" && !sshTunnel.sshPassword) {
        return NextResponse.json(
          { success: false, error: "SSH Password is required when Password authentication is selected." },
          { status: 400 }
        );
      }

      parsedSshTunnel = {
        enabled: true,
        sshHost: sshTunnel.sshHost.trim(),
        sshPort: Number(sshTunnel.sshPort) || 22,
        sshUser: sshTunnel.sshUser.trim(),
        sshAuthType: sshTunnel.sshAuthType || "password",
        sshPassword: sshTunnel.sshPassword || "",
        sshPrivateKey: sshTunnel.sshPrivateKey || "",
        sshPassphrase: sshTunnel.sshPassphrase || "",
      };
    } else if (!host) {
      return NextResponse.json(
        { success: false, error: "Database Host is required when not using SSH Tunnel." },
        { status: 400 }
      );
    }

    const creds: DbCredentials = {
      host: (host || "127.0.0.1").trim(),
      port: Number(port) || 5432,
      database: database.trim(),
      user: user.trim(),
      password: password || "",
      ssl: Boolean(ssl),
      sshTunnel: parsedSshTunnel,
    };

    // Test handshake against SSH and PostgreSQL
    const testResult = await testDbConnection(creds);
    if (!testResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: testResult.message || "Connection test failed.",
        },
        { status: 401 }
      );
    }

    // Handshake succeeded: save session
    const session = await getSession();
    session.db = creds;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({
      success: true,
      db: {
        host: creds.host,
        database: creds.database,
        user: creds.user,
        sshTunnelEnabled: Boolean(creds.sshTunnel?.enabled),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
