import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DashboardClient } from "@/components/DashboardClient";
import { Button } from "@/components/ui/button";
import { getDashboardContext } from "@/app/actions/match-jobs";

interface DashboardPageProps {
  searchParams: {
    fromUpload?: string;
    scraped?: string;
    keywords?: string;
  };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { isAuthenticated, profile, jobSearchKeywords, error: profileError } =
    await getDashboardContext();
  const showMatchingPipeline =
    searchParams.fromUpload === "1" && Boolean(profile);
  const scrapeNotice =
    searchParams.scraped != null
      ? `Added ${searchParams.scraped} new job listing(s) for “${decodeURIComponent(searchParams.keywords ?? jobSearchKeywords ?? "")}”.`
      : undefined;

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
          isAuthenticated={isAuthenticated}
          profileError={profileError}
          initialKeywords={
            searchParams.keywords
              ? decodeURIComponent(searchParams.keywords)
              : jobSearchKeywords
          }
          scrapeNotice={scrapeNotice}
          fromUpload={searchParams.fromUpload === "1"}
          showMatchingPipeline={showMatchingPipeline}
        />
      </div>
    </main>
  );
}
