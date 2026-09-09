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
  Database,
  Lock,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  dbHost?: string;
  dbName?: string;
  isSshTunnel?: boolean;
  sshHost?: string;
}

export default function Navbar({ dbHost, dbName, isSshTunnel, sshHost }: NavbarProps) {
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
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Header */}
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/10 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors">
                Fylint Discovery
              </div>
              <div className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider">
                Creator Ops Hub
              </div>
            </div>
          </Link>

          {/* Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-400" : "text-slate-400")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: DB Session Info & Logout */}
        <div className="flex items-center gap-3 shrink-0">
          {/* DB Session Status Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="flex items-center gap-1.5 font-mono text-slate-300 text-[11px] max-w-[200px] truncate">
              <Database className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="truncate">{dbName || "database"}</span>
            </div>
            {isSshTunnel ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 shrink-0">
                <Lock className="w-2.5 h-2.5" /> SSH
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono shrink-0">
                {dbHost || "local"}
              </span>
            )}
          </div>

          {/* Disconnect Button */}
          <button
            onClick={handleLogout}
            title="Disconnect and log out"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/20 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Sub-bar */}
      <nav className="flex md:hidden items-center gap-1 px-4 py-2 border-t border-slate-800/80 overflow-x-auto bg-slate-950/40">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Icon className="w-3 h-3" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
