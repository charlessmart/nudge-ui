import { ActionsBar } from "./ActionsBar";
import { HeroCard } from "./HeroCard";
import "./sandbox.css";

export default function Home() {
  return (
    <main className="page">
      <h1 id="page-title">Next.js design-tool sandbox</h1>
      <HeroCard
        title="Tracer bullet"
        body="Identity attributes arrive through the loader; previews project into the managed stylesheet."
      />
      <ActionsBar />
    </main>
  );
}
