import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AWSConsole } from "@/components/AWSConsole";

export const metadata = {
  title: "AWS Console — Launch",
  description: "Discover and monitor all AWS services, metrics, and billing for your account.",
};

export default function AWSPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <AWSConsole />
      </main>
      <Footer />
    </div>
  );
}
