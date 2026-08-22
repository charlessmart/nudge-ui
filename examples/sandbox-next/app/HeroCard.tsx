export function HeroCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="hero-card">
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}
