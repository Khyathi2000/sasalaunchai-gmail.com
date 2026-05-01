export function Footer() {
  return (
    <footer className="mt-32 border-t border-border">
      <div className="mx-auto grid max-w-screen-2xl grid-cols-2 gap-8 px-6 py-12 text-xs md:grid-cols-4">
        <FooterCol heading="Company" items={["Blog", "Changelog", "Enterprise", "Join us"]} />
        <FooterCol heading="Resources" items={["Docs", "Changelog"]} />
        <FooterCol heading="Legal" items={["Privacy", "Terms"]} />
        <FooterCol heading="Connect" items={["X", "YouTube", "Reddit"]} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          <span>[ LAUNCH ]</span>
          <span>v0.1.0 — local mode</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        [{heading}]
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item}>
            <a className="text-foreground/80 hover:text-foreground" href="#">
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
