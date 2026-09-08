import { Client, ConnectConfig } from "ssh2";
import net from "net";
import { SshTunnelConfig } from "./types";

interface ActiveTunnel {
  server: net.Server;
  localPort: number;
  client: Client;
  key: string;
}

const activeTunnels = new Map<string, ActiveTunnel>();

function getTunnelKey(sshConfig: SshTunnelConfig, targetHost: string, targetPort: number): string {
  return `${sshConfig.sshUser}@${sshConfig.sshHost}:${sshConfig.sshPort}->${targetHost}:${targetPort}`;
}

function buildSshConnectConfig(sshConfig: SshTunnelConfig): ConnectConfig {
  const config: ConnectConfig = {
    host: sshConfig.sshHost,
    port: sshConfig.sshPort || 22,
    username: sshConfig.sshUser,
    readyTimeout: 10000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 3,
  };

  if (sshConfig.sshAuthType === "key" && sshConfig.sshPrivateKey) {
    config.privateKey = sshConfig.sshPrivateKey.trim();
    if (sshConfig.sshPassphrase) {
      config.passphrase = sshConfig.sshPassphrase;
    }
  } else if (sshConfig.sshPassword) {
    config.password = sshConfig.sshPassword;
  }

  return config;
}

/**
 * Quick handshake test to verify SSH credentials independently of PostgreSQL.
 */
export async function testSshConnection(
  sshConfig: SshTunnelConfig
): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve) => {
    const client = new Client();
    const connectConfig = buildSshConnectConfig(sshConfig);

    client
      .on("ready", () => {
        client.end();
        resolve({ success: true });
      })
      .on("error", (err) => {
        resolve({ success: false, message: `SSH Handshake Error: ${err.message}` });
      })
      .connect(connectConfig);
  });
}

/**
 * Returns a local port on 127.0.0.1 that forwards through the SSH tunnel
 * directly to targetHost:targetPort on the remote VPS.
 */
export async function getOrCreateTunnel(
  sshConfig: SshTunnelConfig,
  targetHost: string = "127.0.0.1",
  targetPort: number = 5432
): Promise<number> {
  const key = getTunnelKey(sshConfig, targetHost, targetPort);
  const existing = activeTunnels.get(key);

  if (existing) {
    return existing.localPort;
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    const connectConfig = buildSshConnectConfig(sshConfig);

    client.on("ready", () => {
      // Create local TCP server on loopback, random available port
      const server = net.createServer((localSocket) => {
        client.forwardOut(
          "127.0.0.1",
          localSocket.remotePort || 0,
          targetHost,
          targetPort,
          (err, stream) => {
            if (err) {
              console.error("[SSH Tunnel forwardOut error]:", err);
              localSocket.destroy();
              return;
            }

            localSocket.pipe(stream).pipe(localSocket);

            localSocket.on("error", () => stream.destroy());
            stream.on("error", () => localSocket.destroy());
          }
        );
      });

      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as net.AddressInfo;
        const localPort = address.port;

        const tunnel: ActiveTunnel = {
          server,
          localPort,
          client,
          key,
        };

        activeTunnels.set(key, tunnel);
        console.log(`[SSH Tunnel Established]: 127.0.0.1:${localPort} -> ${sshConfig.sshHost} -> ${targetHost}:${targetPort}`);
        resolve(localPort);
      });

      server.on("error", (err) => {
        console.error("[SSH Local Server Error]:", err);
        client.end();
        activeTunnels.delete(key);
        reject(new Error(`Failed to start local tunnel server: ${err.message}`));
      });
    });

    client.on("error", (err) => {
      console.error("[SSH Client Error]:", err);
      activeTunnels.delete(key);
      reject(new Error(`SSH Connection Failed: ${err.message}`));
    });

    client.on("close", () => {
      const tun = activeTunnels.get(key);
      if (tun) {
        tun.server.close();
        activeTunnels.delete(key);
      }
    });

    client.connect(connectConfig);
  });
}
