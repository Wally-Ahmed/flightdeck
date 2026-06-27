/**
 * The coding agent — Phase-1 unit A. Implements the frozen `ImplementFn`:
 *
 *   clone the fork → run an OpenAI coding agent against `web_src/` constrained to
 *   the spec → build → (fallback to the canned diff if the live agent flaked) →
 *   commit + push the branch → return a CodeResult.
 *
 * The live agent is the headline (the demo shows it working); the committed
 * canned diff for #5368 is insurance so the *pipeline* ships end-to-end even if
 * the model flakes on stage (BUILD_PLAN section 7/8). Order of precedence:
 *
 *   1. If FLIGHTDECK_FORCE_CANNED and a canned diff exists → use it (deterministic
 *      demo mode).
 *   2. Otherwise run the live agent; build.
 *   3. If the live agent made no change OR the build fails, and a canned diff
 *      exists for this issue → apply it and rebuild.
 *   4. The build result after all that is the authoritative `buildPassed`.
 *
 * `buildPassed: false` is returned (not thrown) so the canvas build-gate can stop
 * the run cleanly; we only throw on infrastructure failures (no token, clone died).
 *
 * LIVE vs FALLBACK (provider note): the live path is an OpenAI tool-use loop built
 * on the official `openai` SDK's Responses API (`client.responses.create`) — see
 * `runLiveAgent` below. It runs only when `OPENAI_API_KEY` is real; with the
 * placeholder key (or `FLIGHTDECK_FORCE_CANNED=1`) the deterministic canned #5368
 * diff drives the Code stage instead — the provider-agnostic demo insurance, kept
 * EXACTLY as before. The fallback ladder is identical to the Claude version; only
 * the live agent's engine changed (Claude Agent SDK CLI → OpenAI tool-use loop).
 */
import OpenAI from 'openai';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { CodeResult, Spec } from '@flightdeck/contracts';
import { config } from '../config.js';
import { cloneFork, commitAll, pushBranch, headSha, hasChanges, changedFiles } from './git.js';
import { installDeps, buildWebSrc, generateApiClient, evaluateBuild } from './build.js';
import { run } from './exec.js';
import { getCannedDiff, type CannedDiff } from './canned.js';

export interface ImplementInput {
  fork: string;
  branch: string;
  spec: Spec;
  issueNumber: number;
}

/** Build the constrained instruction the coding agent gets. */
function buildPrompt(spec: Spec, issueNumber: number): string {
  const files = spec.files.length ? spec.files.map((f) => `- ${f}`).join('\n') : '- (decide the minimal set yourself)';
  const criteria = spec.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
  return [
    `You are implementing GitHub issue #${issueNumber} in this repository (a fork of superplanehq/superplane).`,
    '',
    `## Summary`,
    spec.summary,
    '',
    `## Approach`,
    spec.approach,
    '',
    `## Files you may touch (stay within these unless one is plainly wrong)`,
    files,
    '',
    `## Acceptance criteria`,
    criteria,
    '',
    `## Hard rules`,
    `- Work ONLY inside the web_src/ directory. Do not touch backend Go code, CI, or config outside web_src/.`,
    `- Reuse existing components and utilities; do not add new dependencies.`,
    `- Make the smallest change that satisfies the acceptance criteria.`,
    `- After editing, run \`npm run build\` inside web_src/ and fix any type or build errors you introduced.`,
    `- Do not run git; do not commit. Leave the working tree dirty — the harness commits and pushes.`,
    `- When done, print a one-paragraph summary of exactly what you changed.`,
  ].join('\n');
}

interface AgentRun {
  summary: string;
  ranToCompletion: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI coding agent — a tool-use loop on the Responses API.
//
// The OpenAI SDK is a plain HTTP client (unlike the Claude Agent SDK, there is no
// bundled headless CLI), so we drive the clone→edit→build loop ourselves: define
// file + shell function tools, call client.responses.create, execute each
// function_call against the clone, feed the results back via function_call_output,
// and stop when the model returns no more tool calls (or we hit the turn cap).
//
// All file ops are confined to the clone via `safeJoin` (rejects path traversal),
// and `run_bash` shells out through the project's no-shell `run()` (execFile of an
// argv array — no /bin/sh, so a tool argument can't break out), scoped to web_src/.
// ─────────────────────────────────────────────────────────────────────────────

/** Default OpenAI model — matches the canvas (the integration default is gpt-5.2). Override with OPENAI_MODEL. */
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.2';

/** The function tools the agent gets: read / write / list / search / build. */
const AGENT_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: 'function',
    name: 'read_file',
    description: 'Read a UTF-8 text file from the repository (path relative to the repo/clone root).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to repo root, e.g. web_src/src/pages/app/Markdown.tsx' } },
      required: ['path'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 text file in the repository with the full new content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to repo root' },
        content: { type: 'string', description: 'Full new file content' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'list_dir',
    description: 'List the files and directories under a path in the repository.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to repo root; "." for the root' } },
      required: ['path'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'search',
    description: 'Search the repository for a fixed string (ripgrep-style), returning matching file:line:text lines.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The literal string to search for' },
        path: { type: 'string', description: 'Directory to search under, relative to repo root; "." for the whole repo' },
      },
      required: ['query', 'path'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'run_bash',
    description:
      'Run a build/inspection command in web_src/ (default cwd). Allowed: npm, npx, node, ls, cat, grep, find, head, tail, true. Use `npm run build` to type-check your change.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'e.g. "npm run build" or "npx tsc --noEmit"' } },
      required: ['command'],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** Commands `run_bash` may invoke (first argv token). Keeps the surface to build + read-only inspection. */
const ALLOWED_BASH = new Set(['npm', 'npx', 'node', 'ls', 'cat', 'grep', 'find', 'head', 'tail', 'true']);

/** Resolve a model-supplied repo-relative path, rejecting any escape from the clone root. */
function safeJoin(cloneDir: string, relPath: string): string {
  const root = resolve(cloneDir);
  const full = resolve(root, relPath);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`path "${relPath}" escapes the clone directory`);
  }
  return full;
}

/** Execute one function tool call against the clone; returns a JSON-serialisable result object. */
async function executeAgentTool(
  cloneDir: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'read_file': {
      const content = await readFile(safeJoin(cloneDir, String(args.path)), 'utf8');
      // Cap very large reads so a stray file can't blow the context budget.
      return { path: args.path, content: content.length > 60_000 ? content.slice(0, 60_000) + '\n…[truncated]' : content };
    }
    case 'write_file': {
      const abs = safeJoin(cloneDir, String(args.path));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, String(args.content ?? ''), 'utf8');
      return { path: args.path, written: true };
    }
    case 'list_dir': {
      const entries = await readdir(safeJoin(cloneDir, String(args.path)), { withFileTypes: true });
      return {
        path: args.path,
        entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
      };
    }
    case 'search': {
      // Fixed-string search via the no-shell runner; tolerate "no matches" (rg/grep exit 1).
      const dir = safeJoin(cloneDir, String(args.path));
      const res = await run('grep', ['-rIn', '--', String(args.query), dir], { cwd: cloneDir, timeoutMs: 60_000 });
      const out = (res.stdout || '').replace(new RegExp(resolve(cloneDir) + '/?', 'g'), '');
      return { matches: out.slice(0, 20_000) || '(no matches)' };
    }
    case 'run_bash': {
      const command = String(args.command ?? '').trim();
      const parts = command.split(/\s+/).filter(Boolean);
      const bin = parts[0];
      if (!bin) throw new Error('empty command');
      if (!ALLOWED_BASH.has(bin)) {
        throw new Error(`command "${bin}" is not allowed (allowed: ${[...ALLOWED_BASH].join(', ')})`);
      }
      // Default cwd is web_src/ (where npm run build lives); execFile, no shell.
      const res = await run(bin, parts.slice(1), { cwd: join(cloneDir, 'web_src'), timeoutMs: 15 * 60_000 });
      return {
        exitCode: res.code,
        // Bound the output fed back to the model.
        stdout: res.stdout.slice(-12_000),
        stderr: res.stderr.slice(-12_000),
      };
    }
    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

/**
 * Drive an OpenAI tool-use loop (Responses API) against the clone. Constrained to
 * file + build tools, capped turns; tolerant of an error result (we still build and
 * may fall back to the canned diff). Returns the model's final summary text.
 */
async function runLiveAgent(cloneDir: string, spec: Spec, issueNumber: number): Promise<AgentRun> {
  if (!config.openaiApiKey) {
    return { summary: 'OPENAI_API_KEY not set; live agent skipped.', ranToCompletion: false };
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const instructions = [
    'You are an autonomous coding agent working inside a local git clone (a fork of superplanehq/superplane).',
    'Use the provided tools for ALL file reads, edits, searches, and builds — do not ask the user anything.',
    'Make the smallest change that satisfies the spec, staying within web_src/. After editing, run `npm run build` and fix any errors you introduced.',
    'Do NOT run git or commit — the harness commits and pushes. When finished, reply with a one-paragraph summary of exactly what you changed.',
  ].join(' ');
  const prompt = buildPrompt(spec, issueNumber);

  let summary = '';
  let ranToCompletion = false;

  try {
    let response = await client.responses.create({
      model: OPENAI_MODEL,
      instructions,
      input: [{ role: 'user', content: prompt }],
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
    });

    const maxTurns = 60;
    for (let turn = 0; turn < maxTurns; turn++) {
      if (response.output_text && response.output_text.trim()) summary = response.output_text.trim();

      const calls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
      );
      if (calls.length === 0) {
        // No more tool calls — the model is done.
        ranToCompletion = true;
        break;
      }

      const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];
      for (const call of calls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        } catch {
          /* leave as {} — the tool will report the bad-arg error */
        }
        let output: string;
        try {
          output = JSON.stringify({ ok: true, result: await executeAgentTool(cloneDir, call.name, parsed) });
        } catch (err) {
          output = JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        toolOutputs.push({ type: 'function_call_output', call_id: call.call_id, output });
      }

      response = await client.responses.create({
        model: OPENAI_MODEL,
        previous_response_id: response.id, // carry state server-side; only send the new tool outputs
        input: toolOutputs,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });
    }
  } catch (err) {
    // Surface to logs; the caller still builds and may fall back to the canned diff.
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[agent#${issueNumber}] OpenAI agent error: ${msg}\n`);
    return { summary: summary || `Live agent error: ${msg}`, ranToCompletion: false };
  }

  return { summary: summary || 'Live agent produced no summary.', ranToCompletion };
}

/** Write a canned diff's files into the clone (full-file replacement). */
async function applyCanned(cloneDir: string, diff: CannedDiff): Promise<void> {
  for (const file of diff.files) {
    const abs = join(cloneDir, file.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.content, 'utf8');
  }
}

/**
 * The frozen entry point. Always returns a CodeResult (never leaves the branch
 * unpushed once a clone succeeded); `buildPassed` reflects the real `npm run
 * build` outcome after the live agent and/or the canned fallback.
 */
export async function implement(input: ImplementInput): Promise<CodeResult> {
  const { fork, branch, spec, issueNumber } = input;
  const canned = getCannedDiff(issueNumber);

  // 1. Clone + branch.
  const { dir } = await cloneFork(fork, branch, issueNumber);

  // 2. Install deps once up front so the agent's own `npm run build` is fast and
  //    our authoritative build below is honest.
  await installDeps(dir);

  let usedCanned = false;
  let summary: string;

  if (config.forceCanned && canned) {
    // Deterministic demo mode: skip the live agent entirely.
    await applyCanned(dir, canned);
    usedCanned = true;
    summary = `[canned] ${canned.summary}`;
  } else {
    // 3. Live agent.
    const agent = await runLiveAgent(dir, spec, issueNumber);
    summary = agent.summary;

    // 4. Fallback: if the agent changed nothing or we can't trust the result,
    //    and we have a canned diff, apply it so the pipeline still ships.
    const changed = await hasChanges(dir);
    if (canned && (!changed || !agent.ranToCompletion)) {
      await applyCanned(dir, canned);
      usedCanned = true;
      summary = `${summary}\n\n[fallback] Live agent result not usable; applied the committed canned diff for #${issueNumber}. ${canned.summary}`;
    }
  }

  // 5. Best-effort codegen (the fork's app build needs a generated api-client;
  //    no-op if the swagger/toolchain isn't present — evaluateBuild accounts for
  //    a still-missing client as a known baseline rather than the agent's fault).
  await generateApiClient(dir);

  // 6. Authoritative build, evaluated against the agent's changed files. A clean
  //    build passes; a build that fails ONLY on the fork's api-client codegen
  //    baseline (no errors in changed files) also passes with a note; a real
  //    error the change introduced fails the gate.
  let build = await buildWebSrc(dir);
  let changed = await changedFiles(dir);
  let evald = evaluateBuild(build, changed);

  // If the live agent's change actually broke the build (errors in its own files)
  // but we have insurance, swap to the canned diff and rebuild — better a
  // known-good ship than a red gate on demo.
  if (!evald.passed && canned && !usedCanned) {
    await applyCanned(dir, canned);
    usedCanned = true;
    summary = `${summary}\n\n[fallback] Live agent build failed (${evald.note}); applied the committed canned diff for #${issueNumber}. ${canned.summary}`;
    build = await buildWebSrc(dir);
    changed = await changedFiles(dir);
    evald = evaluateBuild(build, changed);
  }

  const buildPassed = evald.passed;
  summary = `${summary}\n\n[build] ${evald.note}`;

  // 7. Commit + push whatever we ended with (even a failing build is pushed so a
  //    reviewer can inspect; the gate decides whether the run proceeds).
  const message = `flightdeck: implement #${issueNumber}${usedCanned ? ' (canned fallback)' : ''}\n\n${summary}`.slice(
    0,
    4000,
  );
  await commitAll(dir, message);
  const sha = await headSha(dir);
  await pushBranch(dir, branch);

  return {
    branch,
    buildPassed,
    summary,
    headSha: sha,
  };
}

// Re-export the type so `import { implement } from './agent/implement.js'` users
// can also grab the input shape if they need it.
export type { CodeResult };
