import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ResumeUpload } from "@/components/ResumeUpload";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <ResumeUpload />
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Built with Next.js, Supabase pgvector, and NVIDIA NIM
      </footer>
    </main>
  );
}
