import "./showroom.css";
import "./raw-components.css";
import { SemanticAlert } from "./ui/SemanticAlert";
import { SemanticAvatar } from "./ui/SemanticAvatar";
import { SemanticBadge } from "./ui/SemanticBadge";
import { SemanticButton } from "./ui/SemanticButton";
import { SemanticCard } from "./ui/SemanticCard";
import { SemanticChip } from "./ui/SemanticChip";
import { SemanticToggle } from "./ui/SemanticToggle";
import { CategorySection, exId, ExampleCard } from "./examples-shared";

export function ExamplesRawCssComponentsPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only component fixture</p>
        <h1>Raw CSS<br />UI components.</h1>
        <div className="examples-hero__meta"><span>7 local components</span><span>·</span><span>typed props</span><span>·</span><span>authored CSS classes</span></div>
      </header>

      <CategorySection
        label="Components"
        title="Props stay semantic when CSS stays explicit."
        description="These existing local UI components keep their prop contracts in React while their rendered styles resolve through authored raw CSS classes."
        frameworkName="Raw CSS"
        frameworkCssClass="raw"
      >
        <ExampleCard id={exId("Components", "raw", 1, "ExamplesRawCssComponentsPage")} label="button" utilities="variant · size · disabled">
          <div className="semantic-showcase"><SemanticButton label="Publish" variant="primary" size="small" disabled={false} /><SemanticButton label="Cancel" variant="secondary" size="large" disabled={false} /></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 2, "ExamplesRawCssComponentsPage")} label="badge" utilities="variant · size">
          <div className="semantic-showcase"><SemanticBadge variant="neutral" size="md">Neutral</SemanticBadge><SemanticBadge variant="success" size="md">Success</SemanticBadge><SemanticBadge variant="warning" size="md">Warning</SemanticBadge></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 3, "ExamplesRawCssComponentsPage")} label="card" utilities="variant · padding · bordered">
          <div className="raw-component-wide"><SemanticCard variant="outlined" padding="md" bordered><strong>Outlined card</strong><p className="raw-component-copy">Raw CSS controls the surface, border, and spacing.</p></SemanticCard></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 4, "ExamplesRawCssComponentsPage")} label="alert" utilities="variant · dismissible">
          <div className="raw-component-wide"><SemanticAlert variant="info">The CSS file is the component system.</SemanticAlert></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 5, "ExamplesRawCssComponentsPage")} label="toggle" utilities="variant · size">
          <div className="semantic-showcase semantic-showcase--toggle"><SemanticToggle variant="accent" size="sm" /><SemanticToggle variant="success" size="md" /><SemanticToggle variant="danger" size="lg" /></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 6, "ExamplesRawCssComponentsPage")} label="avatar" utilities="variant · size · shape">
          <div className="semantic-showcase"><SemanticAvatar variant="initials" size="md" shape="circle" /><SemanticAvatar variant="icon" size="lg" shape="square" /></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "raw", 7, "ExamplesRawCssComponentsPage")} label="chip" utilities="variant · size">
          <div className="semantic-showcase"><SemanticChip variant="default" size="md">Default</SemanticChip><SemanticChip variant="primary" size="md">Primary</SemanticChip><SemanticChip variant="danger" size="sm" closable>Danger</SemanticChip></div>
        </ExampleCard>
      </CategorySection>
    </main>
  );
}
