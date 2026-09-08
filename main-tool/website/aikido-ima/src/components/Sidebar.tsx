"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Search,
  Mail,
  BarChart3,
  LogOut,
  Sparkles,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  dbHost?: string;
  dbName?: string;
}

export default function Sidebar({ dbHost, dbName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "Channels Triage", href: "/channels", icon: Users },
    { label: "Keywords", href: "/keywords", icon: Search },
    { label: "Generated Emails", href: "/emails", icon: Mail },
    { label: "Statistics", href: "/statistics", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/20 ring-1 ring-white/10">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white">Fylint Discovery</h2>
          <span className="text-[11px] font-medium text-indigo-400">Creator Ops Hub</span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Database Session Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-300">Connected DB</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
            <Database className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="truncate">{dbName || "aikido_ima"}</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            Host: {dbHost || "localhost"}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
