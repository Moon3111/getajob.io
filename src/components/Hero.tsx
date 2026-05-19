import { Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Hero() {
  return (
    <section className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI-powered job matching
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Upload your resume.
          <span className="block text-primary">Get matched instantly.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          We parse your skills with NVIDIA NIM, embed live job listings, and
          surface roles that actually fit ??no endless scrolling.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/#upload">Upload resume</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/dashboard">View dashboard</Link>
          </Button>
        </div>
      </div>

      <div
        id="how-it-works"
        className="mt-24 grid gap-8 md:grid-cols-3"
      >
        {[
          {
            icon: Zap,
            title: "Parse",
            description:
              "PDF or DOCX ??structured skills, experience, and ideal role via Llama 3 on NIM.",
          },
          {
            icon: Target,
            title: "Match",
            description:
              "Semantic search over embedded job listings using pgvector cosine similarity.",
          },
          {
            icon: Sparkles,
            title: "Apply",
            description:
              "See match scores, save favorites, and jump straight to the listing.",
          },
        ].map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <Icon className="mb-4 h-8 w-8 text-primary" />
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
