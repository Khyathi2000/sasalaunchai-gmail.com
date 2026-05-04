import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Distinctive editorial serif — used sparingly. Pairs beautifully
// against Geist Mono for "tech meets editorial" landing moments.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "[ LAUNCH ] — analyze. recommend. deploy.",
  description:
    "Deploy any codebase to AWS or GCP in one click. Multi-agent analysis, click-to-authorize cloud auth, real Terraform under the hood.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" className={`${geistMono.variable} ${instrumentSerif.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
