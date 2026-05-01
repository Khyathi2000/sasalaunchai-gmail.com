"use client";

import Link from "next/link";

export function LandingHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-8 py-4 xl:px-16">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-base tracking-wider hover:opacity-70">
            [ LAUNCH ]
          </Link>
          <span className="text-xs text-muted-foreground">multi-cloud deployment</span>
        </div>
        <nav className="flex items-center gap-6 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          <a href="#how" className="hover:text-foreground">how it works</a>
          <a href="#services" className="hover:text-foreground">services</a>
          <a href="https://github.com" className="hover:text-foreground" target="_blank" rel="noreferrer">github</a>
          <Link href="/app" className="bracket-btn text-xs" data-variant="primary">
            <span aria-hidden>[</span>
            <span className="px-2">launch app</span>
            <span aria-hidden>]</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
