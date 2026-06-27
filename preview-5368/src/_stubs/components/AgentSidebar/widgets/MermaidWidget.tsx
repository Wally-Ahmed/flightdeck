// Stub for the real MermaidWidget. The production widget renders an actual
// diagram via the `mermaid` package; for this standalone preview we show the
// mermaid source in a styled <pre> labelled as a diagram. This is the
// "less faithful but real" tradeoff: the #5368 code path (a ```mermaid fence
// routing to MermaidWidget instead of a plain code block) is exercised exactly.
export function MermaidWidget({ content }: { content: string }) {
  return (
    <figure className="mermaid-stub" aria-label="Mermaid diagram (preview stub)">
      <figcaption className="mermaid-stub__cap">mermaid diagram</figcaption>
      <pre className="mermaid-stub__src">{content}</pre>
    </figure>
  );
}
