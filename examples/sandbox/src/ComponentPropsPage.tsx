import { SemanticButton } from "./ui/SemanticButton";
import { SemanticBadge } from "./ui/SemanticBadge";
import { SemanticCard } from "./ui/SemanticCard";
import { SemanticToggle } from "./ui/SemanticToggle";
import { SemanticAlert } from "./ui/SemanticAlert";
import { SemanticChip } from "./ui/SemanticChip";
import { SemanticAvatar } from "./ui/SemanticAvatar";

export function ComponentPropsPage() {
  return (
    <main className="component-props-page">
      <p className="eyebrow">Internal design system fixture</p>
      <h1>Semantic component props</h1>
      <p>
        Each component exposes a typed prop contract that the design-tool
        inspector surfaces as editable controls. Select any component to edit
        its authored invocation props rather than individual CSS declarations.
      </p>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Button</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (primary | secondary), <code>size</code> (small | large), <code>disabled</code> (boolean)
        </p>
        <div className="semantic-showcase">
          <SemanticButton label="Publish changes" variant="primary" size="small" disabled={false} />
          <SemanticButton label="Cancel" variant="secondary" size="large" disabled={false} />
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Badge</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (neutral | success | warning | danger | info), <code>size</code> (sm | md | lg)
        </p>
        <div className="semantic-showcase">
          <SemanticBadge variant="neutral" size="md">Neutral</SemanticBadge>
          <SemanticBadge variant="success" size="md">Success</SemanticBadge>
          <SemanticBadge variant="warning" size="md">Warning</SemanticBadge>
          <SemanticBadge variant="danger" size="md">Danger</SemanticBadge>
          <SemanticBadge variant="info" size="md">Info</SemanticBadge>
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Card</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (elevated | outlined | flat), <code>padding</code> (sm | md | lg), <code>bordered</code> (boolean)
        </p>
        <div className="semantic-showcase semantic-showcase--grid">
          <SemanticCard variant="elevated" padding="md">
            <p style={{ margin: 0 }}><strong>Elevated card</strong></p>
            <p style={{ margin: "8px 0 0", color: "var(--color-text-secondary)", fontSize: "13px" }}>
              Shadow-based depth
            </p>
          </SemanticCard>
          <SemanticCard variant="outlined" padding="md" bordered>
            <p style={{ margin: 0 }}><strong>Outlined card</strong></p>
            <p style={{ margin: "8px 0 0", color: "var(--color-text-secondary)", fontSize: "13px" }}>
              Visible border
            </p>
          </SemanticCard>
          <SemanticCard variant="flat" padding="lg">
            <p style={{ margin: 0 }}><strong>Flat card</strong></p>
            <p style={{ margin: "8px 0 0", color: "var(--color-text-secondary)", fontSize: "13px" }}>
              Sunken surface
            </p>
          </SemanticCard>
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Toggle</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (accent | success | danger), <code>size</code> (sm | md | lg), <code>disabled</code> (boolean)
        </p>
        <div className="semantic-showcase semantic-showcase--toggle">
          <SemanticToggle variant="accent" size="sm" />
          <SemanticToggle variant="success" size="md" />
          <SemanticToggle variant="danger" size="lg" />
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Alert</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (info | success | warning | danger), <code>dismissible</code> (boolean)
        </p>
        <div className="semantic-showcase semantic-showcase--stacked">
          <SemanticAlert variant="info">This is an informational alert.</SemanticAlert>
          <SemanticAlert variant="success" dismissible>Operation completed successfully.</SemanticAlert>
          <SemanticAlert variant="warning">This action cannot be undone.</SemanticAlert>
          <SemanticAlert variant="danger">Something went wrong. Please try again.</SemanticAlert>
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Chip</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (default | primary | success | warning | danger), <code>size</code> (sm | md), <code>closable</code> (boolean)
        </p>
        <div className="semantic-showcase">
          <SemanticChip variant="default" size="md">Default</SemanticChip>
          <SemanticChip variant="primary" size="md">Primary</SemanticChip>
          <SemanticChip variant="success" size="md">Success</SemanticChip>
          <SemanticChip variant="warning" size="md">Warning</SemanticChip>
          <SemanticChip variant="danger" size="sm" closable>Danger</SemanticChip>
        </div>
      </section>

      <section className="semantic-section">
        <h2 className="semantic-section__title">Avatar</h2>
        <p className="semantic-section__desc">
          <code>variant</code> (initials | icon | image), <code>size</code> (sm | md | lg | xl), <code>shape</code> (circle | square)
        </p>
        <div className="semantic-showcase">
          <SemanticAvatar variant="initials" size="md" shape="circle" />
          <SemanticAvatar variant="icon" size="md" shape="circle" />
          <SemanticAvatar variant="initials" size="lg" shape="square" />
          <SemanticAvatar variant="icon" size="xl" shape="circle" />
        </div>
      </section>
    </main>
  );
}
