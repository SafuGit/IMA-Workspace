import Sidebar from "./Sidebar";
import { getSession } from "@/lib/session";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default async function DashboardShell({ children }: DashboardShellProps) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <Sidebar
        dbHost={session.db?.host}
        dbName={session.db?.database}
        isSshTunnel={session.db?.sshTunnel?.enabled}
        sshHost={session.db?.sshTunnel?.sshHost}
      />
      <main className="flex-1 overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  );
}
