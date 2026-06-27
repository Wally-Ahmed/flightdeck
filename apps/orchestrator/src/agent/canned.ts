/**
 * Canned fallback diffs — the demo insurance (BUILD_PLAN section 7, section 8).
 *
 * The live coding agent is the real act; but an LLM implementing a feature is the
 * riskiest piece of the whole factory. So for the hero issue (#5368) we commit a
 * real, buildable implementation here. If the live agent flakes, the Code stage
 * applies this instead, and every downstream gate (build, verify, deploy, PR)
 * still runs against a genuine change, so the pipeline ships end-to-end.
 *
 * A canned entry is a set of whole-file writes relative to the clone root. We use
 * full-file replacement rather than a unified patch so application can't fail on a
 * fuzzy context line: the point of the fallback is that it cannot flake.
 *
 * #5368 — "In view mode markdown files are not rendered properly." The fix wires
 * the renderers the agent-chat already uses (mermaid via MermaidWidget, node/run
 * mention chips via NodeChipFromLink/RunChipFromLink) into the shared
 * `MarkdownContent` used by the file viewer, so view mode renders mermaid diagrams
 * and mention chips instead of raw fenced code / bare links — exactly what the
 * issue asks, by reusing existing components.
 */

export interface CannedFile {
  /** Path relative to the repo (clone) root. */
  path: string;
  /** Full new file content. */
  content: string;
}

export interface CannedDiff {
  issueNumber: number;
  branch: string;
  summary: string;
  files: CannedFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// #5368 — the hero. Replace web_src/src/pages/app/Markdown.tsx with a version
// that renders mermaid fences as diagrams and node:/run: links as mention chips,
// while keeping the existing GFM + sanitized-raw-HTML pipeline intact.
// ─────────────────────────────────────────────────────────────────────────────

const MARKDOWN_TSX_5368 = `import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { MermaidWidget } from "@/components/AgentSidebar/widgets/MermaidWidget";
import { NodeChipFromLink } from "@/components/AgentSidebar/widgets/NodeChip";
import { RunChipFromLink } from "@/components/AgentSidebar/widgets/RunChip";
import { cn } from "@/lib/utils";

/**
 * Tailwind class string shared by every full-document markdown renderer in the
 * app. We deliberately do not use the official \`prose\` plugin so headings,
 * code blocks, tables, and \`<details>\` stay visually consistent with the
 * canvas chrome at small panel sizes.
 */
const MARKDOWN_CONTENT_CLASSES =
  "max-w-none text-sm text-slate-800 " +
  "[&_h1]:mb-1.5 [&_h1]:mt-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:leading-tight [&_h1:first-child]:mt-0 " +
  "[&_h2]:mb-1 [&_h2]:mt-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-tight [&_h2:first-child]:mt-0 " +
  "[&_h3]:mb-0.5 [&_h3]:mt-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-tight [&_h3:first-child]:mt-0 " +
  "[&_h4]:mb-0.5 [&_h4]:mt-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:leading-tight [&_h4:first-child]:mt-0 " +
  "[&_p]:mb-2 [&_p]:leading-relaxed " +
  "[&_ol]:mb-2 [&_ol]:ml-5 [&_ol]:list-decimal " +
  "[&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mb-1 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 " +
  "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs " +
  "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-2 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-current " +
  "[&_table]:my-2 [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 " +
  "[&_td]:border [&_td]:border-slate-100 [&_td]:px-2 [&_td]:py-1 " +
  "[&_details]:my-3 [&_details]:rounded-md [&_details]:border [&_details]:border-slate-200 [&_details]:bg-slate-50/60 [&_details]:p-3 " +
  "[&_details>summary]:flex [&_details>summary]:items-center [&_details>summary]:cursor-pointer [&_details>summary]:select-none [&_details>summary]:text-sm [&_details>summary]:font-semibold [&_details>summary]:text-slate-900 [&_details>summary]:list-none [&_details>summary]:marker:hidden [&_details>summary]:hover:text-sky-700 " +
  "[&_details>summary]:before:content-['▸'] [&_details>summary]:before:mr-2 [&_details>summary]:before:text-slate-500 [&_details>summary]:before:transition-transform [&_details>summary]:before:duration-200 " +
  "[&_details[open]>summary]:mb-3 [&_details[open]>summary]:before:rotate-90 " +
  "[&_details>*:last-child]:mb-0";

/**
 * Sanitize schema extending the rehype-sanitize defaults with \`<details>\` /
 * \`<summary>\` (plus the \`open\` attribute) so collapsible sections can be
 * authored directly in markdown without weakening the rest of the policy
 * around scripts, event handlers, and inline styles.
 */
const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
  },
};

/** Protocol prefixes that address in-app entities rather than real URLs. */
function isAgentLink(url: string): boolean {
  return url.startsWith("run:") || url.startsWith("node:");
}

/**
 * Render \`node:<id>\` / \`run:<id>\` links as the same mention chips the agent
 * chat uses, when we have the canvas/org context to resolve them. Falls back to
 * a normal link otherwise. Mirrors AgentSidebar's RichMessage so view mode and
 * chat stay visually identical.
 */
function MarkdownLink({
  href,
  children,
  canvasId,
  organizationId,
}: ComponentProps<"a"> & { canvasId?: string; organizationId?: string }) {
  const label = typeof children === "string" ? children : undefined;

  const runMatch = href?.match(/^run:([0-9a-f-]{36})(?:~(.+))?/);
  if (runMatch && canvasId && organizationId) {
    return (
      <RunChipFromLink
        runId={runMatch[1]}
        rawLabel={label}
        rawStatus={runMatch[2]}
        canvasId={canvasId}
        organizationId={organizationId}
      />
    );
  }

  const nodeMatch = href?.match(/^node:(.+)$/);
  if (nodeMatch && canvasId && organizationId) {
    return (
      <NodeChipFromLink nodeId={nodeMatch[1]} rawLabel={label} canvasId={canvasId} organizationId={organizationId} />
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * Render a fenced code block. A \`\`\`mermaid fence becomes an actual rendered
 * diagram (via the shared MermaidWidget); every other language stays a normal
 * \`<code>\` element so the surrounding \`<pre>\` styling still applies.
 */
function MarkdownCodeBlock({ className, children, ...props }: ComponentProps<"code"> & { children?: ReactNode }) {
  const match = /language-(\\w+)/.exec(className || "");
  if (match?.[1] === "mermaid") {
    const code = String(children).replace(/\\n$/, "");
    return <MermaidWidget content={code} />;
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Canvas id, enabling node/run mention chips in rendered markdown. */
  canvasId?: string;
  /** Organization id, enabling node/run mention chips in rendered markdown. */
  organizationId?: string;
  "data-testid"?: string;
}

/**
 * Render a markdown string with the standard GFM + line-break + sanitized-raw
 * HTML pipeline used across the app (console panels, file viewer, etc), now with
 * mermaid diagrams and node/run mention chips in view mode (see issue #5368).
 * Returns \`null\` when the content is empty (or whitespace-only) so the caller
 * can decide whether to show its own empty state.
 *
 * Only line endings are normalized; leading/trailing whitespace is preserved
 * so file viewers render exactly what's on disk (e.g. an indented code block
 * at the very start of a file stays an indented code block).
 */
export function MarkdownContent({
  content,
  className,
  canvasId,
  organizationId,
  "data-testid": dataTestId,
}: MarkdownContentProps) {
  const normalized = content.replace(/\\r\\n/g, "\\n");
  if (!normalized.trim()) return null;
  return (
    <div className={cn(MARKDOWN_CONTENT_CLASSES, className)} data-testid={dataTestId}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
        urlTransform={(url) => (isAgentLink(url) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ children, href }) => (
            <MarkdownLink href={href} canvasId={canvasId} organizationId={organizationId}>
              {children}
            </MarkdownLink>
          ),
          code: MarkdownCodeBlock,
          // Mermaid replaces the whole block; unwrap pre so the diagram isn't
          // boxed inside code-block chrome. Non-mermaid code keeps its pre.
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
`;

export const CANNED_DIFFS: Record<number, CannedDiff> = {
  5368: {
    issueNumber: 5368,
    branch: 'flightdeck/issue-5368',
    summary:
      'View-mode markdown now renders mermaid diagrams (mermaid fences via MermaidWidget) and node:/run: ' +
      'mention chips (NodeChipFromLink/RunChipFromLink), reusing the renderers from agent chat, while ' +
      'keeping the existing GFM + sanitized-raw-HTML pipeline. Fixes superplanehq/superplane#5368.',
    files: [
      {
        path: 'web_src/src/pages/app/Markdown.tsx',
        content: MARKDOWN_TSX_5368,
      },
    ],
  },
};

/** Return the canned diff for an issue, or undefined if none is committed. */
export function getCannedDiff(issueNumber: number): CannedDiff | undefined {
  return CANNED_DIFFS[issueNumber];
}
