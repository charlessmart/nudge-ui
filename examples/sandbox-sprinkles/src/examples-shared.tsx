export type ExampleId = {
  cid: string;
  src: string;
  test: string;
};

export function exId(category: string, framework: string, index: number): ExampleId {
  const cid = `Examples:${category}:${framework}:${String(index).padStart(2, "0")}`;
  return {
    cid,
    src: `src/ExamplesSprinklesPage.tsx:${cid}`,
    test: `examples-${category.toLowerCase()}-${framework}-${String(index).padStart(2, "0")}`,
  };
}

function devAttrs(id: ExampleId) {
  return import.meta.env.DEV
    ? { "data-cid": id.cid, "data-src": id.src, "data-test": id.test }
    : {};
}

export function ExampleCard({
  id,
  label,
  utilities,
  children,
}: {
  id: ExampleId;
  label: string;
  utilities: string;
  children: React.ReactNode;
}) {
  return (
    <article className="example-card">
      <div className="example-card__label">
        <span>{label}</span>
        <code>{utilities}</code>
      </div>
      <div className="example-card__stage" {...devAttrs(id)}>
        {children}
      </div>
    </article>
  );
}

export function CategorySection({
  label,
  title,
  description,
  frameworkName,
  frameworkCssClass,
  children,
}: {
  label: string;
  title: string;
  description: string;
  frameworkName: string;
  frameworkCssClass: string;
  children: React.ReactNode;
}) {
  return (
    <section className="examples-category" id={`examples-${label.toLowerCase()}`}>
      <div className="examples-category__header">
        <span className="examples-category__label">{label}</span>
        <div>
          <h2>{title}</h2>
          <p className="examples-category__desc">{description}</p>
        </div>
      </div>
      <div className="examples-framework">
        <span className={`examples-framework__label examples-framework__label--${frameworkCssClass}`}>
          {frameworkName}
        </span>
        <div className="examples-grid">{children}</div>
      </div>
    </section>
  );
}
