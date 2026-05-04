import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CredentialsForm } from "@/components/CredentialsForm";

export const metadata = {
  title: "[ LAUNCH ] · credentials",
};

export default function CredentialsSettingsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-screen-2xl px-8 py-16 xl:px-16">
          <nav className="mb-8 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            <Link href="/console" className="hover:text-foreground">[ app ]</Link>
            <span className="mx-2">/</span>
            <span>settings</span>
            <span className="mx-2">/</span>
            <span className="text-foreground">credentials</span>
          </nav>

          <header className="mb-8 space-y-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ settings · credentials ]
            </p>
            <h1 className="text-2xl tracking-tight">cloud credentials</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Paste AWS keys and / or a GCP service account JSON. These are required for{" "}
              <em>apply mode</em> — the analyze + infer steps work without them.
            </p>
          </header>

          <CredentialsForm />
        </section>
      </main>
      <Footer />
    </div>
  );
}
