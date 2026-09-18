import { useEffect, useState } from "react";
import "./EasterEggPage.css";

export function EasterEggPage() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "One more pixel · Nudge UI";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <main className="nudge-egg">
      <header className="nudge-egg__header">
        <span>nudge ui</span>
        <span className="nudge-egg__label">A little off the grid</span>
      </header>
      <section className="nudge-egg__content" aria-labelledby="nudge-egg-title">
        <p className="nudge-egg__label">You found the extra page.</p>
        <h1 id="nudge-egg-title">One pixel.<br />Big feelings.</h1>
        <p className="nudge-egg__description">
          For everyone who has moved something one pixel to the left.
          Then moved it back.
        </p>
        <div className="nudge-egg__specimen">
          <span className="nudge-egg__mark" style={{ transform: `translateX(${offset}px)` }} aria-hidden="true">✳</span>
          <span className="nudge-egg__coordinates" aria-live="polite">x: {offset}px / feels: almost right</span>
        </div>
        <div className="nudge-egg__actions">
          <button type="button" onClick={() => setOffset((value) => value + 1)} disabled={offset >= 24}>One more pixel →</button>
          <button className="nudge-egg__reset" type="button" onClick={() => setOffset(0)}>Actually, put it back</button>
        </div>
      </section>
      <footer className="nudge-egg__footer">
        <span>No pixels were harmed in the making of this page.</span>
        <span>Made to be nudged.</span>
      </footer>
    </main>
  );
}
