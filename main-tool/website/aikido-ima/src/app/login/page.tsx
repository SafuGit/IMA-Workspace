"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Server,
  KeyRound,
  ShieldAlert,
  ArrowRight,
  Loader2,
  Sparkles,
  Lock,
  Terminal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    // Direct DB Settings (or destination on VPS)
    host: "127.0.0.1",
    port: "5432",
    database: "aikido_ima_safwano",
    user: "app_user_safwano",
    password: "",
    ssl: false,

    // SSH Tunnel Settings
    sshTunnel: {
      enabled: true,
      sshHost: "",
      sshPort: "22",
      sshUser: "root",
      sshAuthType: "password" as "password" | "key",
      sshPassword: "",
      sshPrivateKey: "",
      sshPassphrase: "",
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (type: "vps-ssh" | "direct-local") => {
    if (type === "vps-ssh") {
      setFormData((prev) => ({
        ...prev,
        host: "127.0.0.1",
        port: "5432",
        database: "aikido_ima_safwano",
        user: "app_user_safwano",
        password: "",
        ssl: false,
        sshTunnel: {
          enabled: true,
          sshHost: "",
          sshPort: "22",
          sshUser: "root",
          sshAuthType: "password",
          sshPassword: "",
          sshPrivateKey: "",
          sshPassphrase: "",
        },
      }));
    } else {
      setFormData({
        host: "localhost",
        port: "5432",
        database: "aikido_ima_safwano",
        user: "app_user_safwano",
        password: "aikido_app_password",
        ssl: false,
        sshTunnel: {
          enabled: false,
          sshHost: "",
          sshPort: "22",
          sshUser: "root",
          sshAuthType: "password",
          sshPassword: "",
          sshPrivateKey: "",
          sshPassphrase: "",
        },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        host: formData.host,
        port: formData.port,
        database: formData.database,
        user: formData.user,
        password: formData.password,
        ssl: formData.ssl,
        sshTunnel: formData.sshTunnel.enabled ? formData.sshTunnel : undefined,
      };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to connect to database");
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/25 mb-4 ring-1 ring-white/20">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Fylint Discovery Hub</h1>
          <p className="text-sm text-slate-400 mt-1">Connect directly or through an encrypted SSH tunnel</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
          {/* Quick Presets */}
          <div className="flex items-center gap-2 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => applyPreset("vps-ssh")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                formData.sshTunnel.enabled
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Preset: VPS (via SSH Tunnel)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("direct-local")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                !formData.sshTunnel.enabled
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Preset: Direct / Localhost
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed whitespace-pre-wrap">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SSH Tunnel Toggle Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.sshTunnel.enabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sshTunnel: { ...formData.sshTunnel, enabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/30"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    Connect via SSH Tunnel (Encrypted Port 22)
                  </span>
                </label>
                <span className="text-[10px] text-slate-500">
                  {formData.sshTunnel.enabled ? "Enabled" : "Direct"}
                </span>
              </div>

              {formData.sshTunnel.enabled && (
                <div className="pt-2 space-y-3 border-t border-slate-800/80 animate-in fade-in duration-150">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                        <Terminal className="w-3 h-3 text-indigo-400" /> VPS Host / IP
                      </label>
                      <input
                        type="text"
                        required={formData.sshTunnel.enabled}
                        placeholder="e.g. 149.28.123.45"
                        value={formData.sshTunnel.sshHost}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshHost: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-600 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-300">SSH Port</label>
                      <input
                        type="number"
                        value={formData.sshTunnel.sshPort}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshPort: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300">SSH Username</label>
                    <input
                      type="text"
                      required={formData.sshTunnel.enabled}
                      placeholder="e.g. root or ubuntu"
                      value={formData.sshTunnel.sshUser}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sshTunnel: { ...formData.sshTunnel, sshUser: e.target.value },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-600"
                    />
                  </div>

                  {/* Auth Type Tabs */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshAuthType: "password" },
                          })
                        }
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          formData.sshTunnel.sshAuthType === "password"
                            ? "bg-slate-800 text-white border border-slate-700"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        SSH Password
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshAuthType: "key" },
                          })
                        }
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          formData.sshTunnel.sshAuthType === "key"
                            ? "bg-slate-800 text-white border border-slate-700"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        SSH Private Key
                      </button>
                    </div>

                    {formData.sshTunnel.sshAuthType === "password" ? (
                      <input
                        type="password"
                        placeholder="VPS SSH Password"
                        value={formData.sshTunnel.sshPassword}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshPassword: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-600"
                      />
                    ) : (
                      <textarea
                        rows={3}
                        placeholder="Paste OpenSSH Private Key (-----BEGIN OPENSSH PRIVATE KEY----- ...)"
                        value={formData.sshTunnel.sshPrivateKey}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sshTunnel: { ...formData.sshTunnel, sshPrivateKey: e.target.value },
                          })
                        }
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-600"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PostgreSQL Target Settings */}
            <div className="space-y-3 pt-1">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Database className="w-3.5 h-3.5 text-indigo-400" /> PostgreSQL Credentials
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">
                    {formData.sshTunnel.enabled ? "Target Host on VPS" : "Direct DB Host"}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">DB Port</label>
                  <input
                    type="number"
                    required
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Database Name</label>
                <input
                  type="text"
                  required
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">DB User</label>
                  <input
                    type="text"
                    required
                    value={formData.user}
                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">DB Password</label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {formData.sshTunnel.enabled ? "Opening SSH Tunnel & Handshaking..." : "Connecting & Verifying..."}
                </>
              ) : (
                <>
                  {formData.sshTunnel.enabled ? "Establish SSH Tunnel & Connect" : "Connect to Database"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-4">
          Next.js securely forwards connections through SSH Port 22. Your VPS database does not need to expose port 5432 to the public internet.
        </p>
      </div>
    </div>
  );
}
