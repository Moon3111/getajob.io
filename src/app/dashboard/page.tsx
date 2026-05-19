import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardClient } from "@/components/DashboardClient";
import { Button } from "@/components/ui/button";
import { getUserProfile } from "@/app/actions/match-jobs";

interface DashboardPageProps {
  searchParams: { fromUpload?: string };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { profile } = await getUserProfile();
  const showMatchingPipeline = searchParams.fromUpload === "1";

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </Button>
        <DashboardClient
          initialProfile={profile}
          showMatchingPipeline={showMatchingPipeline}
        />
      </div>
    </main>
  );
}
