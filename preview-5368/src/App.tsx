import { useState } from "react";
import { MarkdownContent } from "./Markdown";

// A rich sample doc exercising every branch of the #5368 renderer:
// headings, lists, a fenced code block, a GFM table, a normal link, a
// <details> block (the extended sanitize schema), a ```mermaid fence
// (-> MermaidWidget), and node:/run: links (-> mention chips when canvas
// context is present).
const SAMPLE = `# Deploy report

The pipeline finished. Summary below, rendered by the shared markdown view (issue #5368).

## What ran

1. Build the image
2. Run the test suite
3. Promote to staging

- Plain bullet
- **Bold** and \`inline code\`
- A real link to [the docs](https://example.com)

## Status table

| Stage | Result | Duration |
| ----- | ------ | -------- |
| build | pass   | 42s      |
| test  | pass   | 1m18s    |
| deploy| pass   | 11s      |

## Mention chips (the #5368 feature)

The deploy was driven by node [build-and-test](node:build-and-test-7f3a) and
produced run [#deploy](run:9b1c2d3e-4f50-6a7b-8c9d-0e1f2a3b4c5d~succeeded).
With **canvas context off**, those become plain links; with it **on**, they
render as the same mention chips the agent chat uses.

## A code block

\`\`\`ts
export function add(a: number, b: number) {
  return a + b;
}
\`\`\`

## A mermaid diagram

\`\`\`mermaid
graph TD
  A[Build] --> B[Test]
  B --> C{Pass?}
  C -->|yes| D[Deploy]
  C -->|no| E[Stop]
\`\`\`

<details>
<summary>Collapsible details (extended sanitize schema)</summary>

This \`<details>\`/\`<summary>\` block is allowed by the schema #5368 ships, while
scripts and inline event handlers stay blocked.

</details>

> A closing blockquote, for good measure.
`;

const DEMO_CANVAS_ID = "demo-canvas-0001";
const DEMO_ORG_ID = "demo-org-0001";

export function App() {
  const [raw, setRaw] = useState(false);
  const [canvasContext, setCanvasContext] = useState(true);

  return (
    <div className="page">
      <header className="banner">
        <strong>Issue #5368 — Markdown view mode</strong>
        <span className="banner__sub">standalone component preview (no backend)</span>
      </header>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="View mode">
          <button
            type="button"
            className={!raw ? "seg__btn seg__btn--on" : "seg__btn"}
            aria-pressed={!raw}
            onClick={() => setRaw(false)}
          >
            Rendered
          </button>
          <button
            type="button"
            className={raw ? "seg__btn seg__btn--on" : "seg__btn"}
            aria-pressed={raw}
            onClick={() => setRaw(true)}
          >
            Raw source
          </button>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={canvasContext}
            onChange={(e) => setCanvasContext(e.target.checked)}
          />
          <span>
            Canvas context{" "}
            <code>{canvasContext ? "on — node:/run: links become chips" : "off — plain links"}</code>
          </span>
        </label>
      </div>

      <main className="surface" data-testid="preview-surface">
        {raw ? (
          <pre className="raw-source" data-testid="raw-source">
            {SAMPLE}
          </pre>
        ) : (
          <MarkdownContent
            content={SAMPLE}
            canvasId={canvasContext ? DEMO_CANVAS_ID : undefined}
            organizationId={canvasContext ? DEMO_ORG_ID : undefined}
            data-testid="rendered-markdown"
          />
        )}
      </main>

      <footer className="foot">
        Component: <code>web_src/src/pages/app/Markdown.tsx</code> from
        {" "}<code>Wally-Ahmed/superplane@flightdeck/issue-5368</code>. Mermaid &amp; mention
        chips are local stubs (zero fetching); the markdown pipeline is the real component.
      </footer>
    </div>
  );
}
