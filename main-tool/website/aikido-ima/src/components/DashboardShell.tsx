import Navbar from "./Navbar";
import { getSession } from "@/lib/session";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default async function DashboardShell({ children }: DashboardShellProps) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        dbHost={session.db?.host}
        dbName={session.db?.database}
        isSshTunnel={session.db?.sshTunnel?.enabled}
        sshHost={session.db?.sshTunnel?.sshHost}
      />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
