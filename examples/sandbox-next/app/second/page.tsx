import { ClientBadge } from "../ClientBadge";

export default function SecondPage() {
  return (
    <main className="page">
      <h1 id="page-title">Second route</h1>
      <section className="actions">
        <ClientBadge label="still here" tone="quiet" />
        <a className="nav-link" href="/">Back home</a>
      </section>
    </main>
  );
}
