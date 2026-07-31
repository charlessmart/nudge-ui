import type { ReactElement } from "react";
import { CSS_CHUNKS, ROOT, classesFor, type PerfNode } from "./perfFixture.ts";

function BranchView({ node }: { node: PerfNode }): ReactElement {
  const identity = import.meta.env.DEV ? { "data-perf-id": `perf-${node.id}` } : {};
  const leaf = node.children.length === 0;
  return (
    <div className={classesFor(node.id)} {...identity}>
      {leaf ? `PF-${node.id}` : null}
      {node.children.map((child) => (
        <BranchView key={child.id} node={child} />
      ))}
    </div>
  );
}

export function PerfFixturePage(): ReactElement {
  return (
    <main data-test="perf-fixture-root">
      {CSS_CHUNKS.map((chunk) => (
        <style key={chunk.id} data-perf-style={chunk.id} dangerouslySetInnerHTML={{ __html: chunk.css }} />
      ))}
      <BranchView node={ROOT} />
    </main>
  );
}
