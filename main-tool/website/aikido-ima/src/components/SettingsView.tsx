"use client";

import { useState, useEffect } from "react";
import { EmailApiSettings } from "@/lib/types";
import {
  Settings,
  Server,
  Key,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Send,
  Code2,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const STORAGE_KEY = "fylint_email_api_settings";

export default function SettingsView() {
  const [settings, setSettings] = useState<EmailApiSettings>({
    apiUrl: "http://localhost:8000/api/generate-email",
    apiKey: "",
    model: "gemini-3.1-pro-high",
    timeoutSeconds: 180,
    additionalInstructions: "",
    enabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      // 1. Try localStorage first for instant display
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") {
            setSettings((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch {}

      // 2. Fetch from DB
      try {
        const res = await fetch("/api/settings?key=email_generation_api");
        if (res.ok) {
          const data = await res.json();
          if (data.settings && data.settings.apiUrl) {
            setSettings(data.settings);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.settings));
          }
        }
      } catch (err) {
        console.warn("Failed to fetch settings from server:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleTestConnection = async () => {
    if (!settings.apiUrl) {
      setTestResult({ success: false, error: "Please enter an API URL first." });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: settings.apiUrl,
          apiKey: settings.apiKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || "Connection successful! API is active.",
        });
      } else {
        setTestResult({
          success: false,
          error: data.error || "Failed to reach API endpoint.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Network error while testing connection.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

      // Save to DB
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "email_generation_api",
          value: settings,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        alert(`Failed to save settings to server: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = Boolean(settings.apiUrl && settings.apiUrl.trim() !== "");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2.5 text-xs text-indigo-400 font-medium tracking-wide uppercase">
          <Settings className="w-4 h-4" /> System Configuration
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
          Settings & Integrations
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your Bring-Your-Own (BYO) Email Generation API, model options, and credentials.
        </p>
      </div>

      {/* Status Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all ${
          isConfigured
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : "bg-amber-500/10 border-amber-500/20 text-amber-300"
        }`}
      >
        <div className="flex items-center gap-3">
          {isConfigured ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <div>
            <div className="text-sm font-semibold">
              {isConfigured
                ? "Email Generation API Configured & Ready"
                : "Action Required: Email Generation API Not Configured"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {isConfigured
                ? `Connected to: ${settings.apiUrl} (${settings.model || "default model"})`
                : "Please enter your API endpoint below so channels can generate personalized outreach emails."}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || !settings.apiUrl}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 text-slate-200 disabled:opacity-50 transition-all shrink-0"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Test Connection
        </button>
      </div>

      {/* Test Feedback */}
      {testResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1 ${
            testResult.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{testResult.message || testResult.error}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            Email Generation API Settings
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Specify the API URL where generation requests should be dispatched.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5">
          {/* API Endpoint URL */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
              <span>API Endpoint URL <span className="text-red-400">*</span></span>
              <span className="text-[11px] text-slate-500 font-mono">POST /api/generate-email</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={settings.apiUrl}
                onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
                placeholder="http://localhost:8000/api/generate-email"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder-slate-600 transition-all font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              The HTTP/HTTPS endpoint of your Python server or custom webhook (e.g.{" "}
              <code className="text-indigo-400">http://localhost:8000/api/generate-email</code> or your remote VPS IP).
            </p>
          </div>

          {/* API Key / Bearer Token */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              API Key / Auth Token (Optional)
            </label>
            <input
              type="password"
              value={settings.apiKey || ""}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="Bearer eyJhbGciOi... or custom API key"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder-slate-600 transition-all font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              If your API requires authentication, this will be passed in the{" "}
              <code className="text-slate-400">Authorization: Bearer</code> header.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Target Model Identifier
            </label>
            <input
              type="text"
              value={settings.model || "gemini-3.1-pro-high"}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder="gemini-3.1-pro-high"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder-slate-600 transition-all font-mono"
            />
            {/* Quick model chips */}
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                "gemini-3.1-pro-high",
                "gemini-2.5-flash",
                "gpt-4o",
                "claude-3-5-sonnet",
              ].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setSettings({ ...settings, model: m })}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    settings.model === m
                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Request Timeout */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Request Timeout (seconds)
            </label>
            <input
              type="number"
              min={10}
              max={600}
              value={settings.timeoutSeconds || 180}
              onChange={(e) => setSettings({ ...settings, timeoutSeconds: parseInt(e.target.value) || 180 })}
              className="w-48 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 transition-all font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Maximum seconds to wait for caption lookup and LLM email drafting (default: 180s).
            </p>
          </div>

          {/* Custom Prompt Additions */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Additional Custom Instructions (Optional)
            </label>
            <textarea
              rows={3}
              value={settings.additionalInstructions || ""}
              onChange={(e) => setSettings({ ...settings, additionalInstructions: e.target.value })}
              placeholder="e.g. Always emphasize our fast payment cycles. Keep Option B extra casual."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-slate-100 placeholder-slate-600 transition-all font-sans"
            />
          </div>
        </div>

        {/* Save Bar */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> Settings saved successfully!
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </form>

      {/* Expandable Developer API Documentation */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
        <button
          type="button"
          onClick={() => setShowDocs(!showDocs)}
          className="w-full flex items-center justify-between text-left text-sm font-semibold text-slate-300 hover:text-white"
        >
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span>Developer Reference: Running or Building Your Own API</span>
          </div>
          {showDocs ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showDocs && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 text-xs text-slate-400">
            <div>
              <div className="font-semibold text-slate-200 mb-1">1. Run the Reference Python API Server</div>
              <p className="mb-2">A ready-to-use reference server is included in the workspace:</p>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto">
                python main-tool/email_generation/api_server.py --port 8000
              </pre>
            </div>

            <div>
              <div className="font-semibold text-slate-200 mb-1">2. Fixed Input Payload (POST JSON)</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-indigo-300 font-mono text-[11px] overflow-x-auto">
{`{
  "video_url": "https://www.youtube.com/watch?v=zwvUAh91itA",
  "channel_id": "UC...",
  "channel_name": "TechWithTim",
  "model": "gemini-3.1-pro-high"
}`}
              </pre>
            </div>

            <div>
              <div className="font-semibold text-slate-200 mb-1">3. Fixed Response Contract (JSON 200)</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-emerald-300 font-mono text-[11px] overflow-x-auto">
{`{
  "success": true,
  "video_id": "zwvUAh91itA",
  "title": "Vue.js for Beginners: Build Your First App...",
  "hooks": [
    {
      "tag": "comment-backed",
      "text": "The way you explained Vue reactivity without getting lost in boilerplate was super clean...",
      "timestamp": "02:15 – 02:45",
      "video_link": "https://www.youtube.com/watch?v=zwvUAh91itA&t=135s",
      "what_happens": "You walk through setting up ref() reactive state...",
      "is_recommended": true
    }
  ],
  "subject_lines": {
    "primary": "vue reactivity demo",
    "alternative_1": "counter app workflow",
    "alternative_2": "frontend tooling integration"
  },
  "drafts": {
    "option_a": {
      "name": "Viewer Trust & Monetization",
      "subject": "vue reactivity demo",
      "body": "Hey [Name],\\n\\n...",
      "word_count": 68
    },
    "option_b": { ... },
    "option_c": { ... }
  },
  "raw_output": "..."
}`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
