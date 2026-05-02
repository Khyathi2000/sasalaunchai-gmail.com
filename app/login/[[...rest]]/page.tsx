import { SignIn } from "@clerk/nextjs";
import { LandingHeader } from "@/components/LandingHeader";
import { Footer } from "@/components/Footer";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex flex-1 items-center justify-center px-8 py-16">
        <div className="flex flex-col items-center gap-6">
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            [ sign in ]
          </p>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/signup"
            forceRedirectUrl="/app"
            signUpForceRedirectUrl="/app"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
