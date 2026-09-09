import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import GenerateEmailView from "@/components/GenerateEmailView";

export const dynamic = "force-dynamic";

interface GenerateEmailPageProps {
  searchParams: Promise<{ channelId?: string; videoUrl?: string }>;
}

export default async function GenerateEmailPage({ searchParams }: GenerateEmailPageProps) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  const { channelId, videoUrl } = await searchParams;

  return (
    <DashboardShell>
      <div className="p-6 sm:p-8 max-w-[1600px] mx-auto">
        <GenerateEmailView channelId={channelId} initialVideoUrl={videoUrl} />
      </div>
    </DashboardShell>
  );
}
