import { ClientBadge } from "./ClientBadge";
import { HeroCard } from "./HeroCard";
import { NavToSecond } from "./NavToSecond";
import "./sandbox.css";

export default function Home() {
  return (
    <main className="page">
      <h1 id="page-title">Next.js design-tool sandbox</h1>
      <HeroCard
        title="Tracer bullet"
        body="Identity attributes arrive through the loader; previews project into the managed stylesheet."
      />
      <section className="actions">
        <ClientBadge label="client island" tone="accent" />
        <NavToSecond />
      </section>
    </main>
  );
}
