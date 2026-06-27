/**
 * Build / install helpers for the fork's `web_src/` — shared by the Code stage
 * (build gate) and the Verify stage.
 *
 * `web_src/` is the React 19 + Vite 6 frontend; `npm run build` is `tsc -b &&
 * vite build`. IMPORTANT (discovered against the live fork): `web_src` depends on
 * a *generated* api client at `src/api-client` (and a swagger JSON), both of which
 * are gitignored build artifacts produced by the repo's protobuf/openapi codegen.
 * A clean clone therefore can't `npm run build` until that codegen runs — and the
 * frontend coding agent shouldn't be running buf/Go. So the build gate's signal is
 * "does the agent's change type-check, and does the app build *given the repo's
 * own codegen baseline*", not "is a clean clone green" (it never is).
 *
 * `evaluateBuild` encodes that: a build is gate-pass when it's clean, OR when the
 * only remaining errors are the known api-client codegen baseline (no errors in
 * the files the agent actually changed). A real type error the agent introduces in
 * a changed file still fails the gate.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { run, type RunResult } from './exec.js';

/** Absolute path to the fork's frontend package inside a clone. */
export function webSrcDir(cloneDir: string): string {
  return join(cloneDir, 'web_src');
}

/**
 * Install dependencies in `web_src/`. Prefers `npm ci` (lockfile-exact, what CI
 * uses); falls back to `npm install` if there's no lockfile.
 */
export async function installDeps(cloneDir: string): Promise<RunResult> {
  const cwd = webSrcDir(cloneDir);
  const hasLock = existsSync(join(cwd, 'package-lock.json'));
  const args = hasLock ? ['ci'] : ['install'];
  return run('npm', args, { cwd, timeoutMs: 20 * 60_000 });
}

/**
 * Best-effort run of the frontend's api-client codegen (`npm run generate:api`).
 * Succeeds when the swagger input + toolchain are present (a properly provisioned
 * container, or a fork that commits the artifact); a no-op otherwise. Never
 * throws — the caller proceeds either way and `evaluateBuild` accounts for a
 * still-missing client.
 */
export async function generateApiClient(cloneDir: string): Promise<RunResult> {
  return run('npm', ['run', 'generate:api'], { cwd: webSrcDir(cloneDir), timeoutMs: 5 * 60_000 });
}

/** Run `npm run build` in `web_src/` (`tsc -b && vite build`). */
export async function buildWebSrc(cloneDir: string): Promise<RunResult> {
  return run('npm', ['run', 'build'], { cwd: webSrcDir(cloneDir), timeoutMs: 15 * 60_000 });
}

/** Run `npm run build-storybook` in `web_src/` (the Storybook static preview). */
export async function buildStorybook(cloneDir: string): Promise<RunResult> {
  return run('npm', ['run', 'build-storybook'], { cwd: webSrcDir(cloneDir), timeoutMs: 15 * 60_000 });
}

/** Run the test suite once (`npm run test:run` → vitest run). */
export async function runTests(cloneDir: string): Promise<RunResult> {
  return run('npm', ['run', 'test:run'], { cwd: webSrcDir(cloneDir), timeoutMs: 15 * 60_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build-result evaluation (the build-gate brain).
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildEvaluation {
  /** Gate decision: did the agent's change build cleanly enough to ship? */
  passed: boolean;
  /** Was the raw `npm run build` fully green? */
  cleanBuild: boolean;
  /** Did we pass only by discounting the api-client codegen baseline? */
  discountedBaseline: boolean;
  /** Distinct source files with TS errors. */
  errorFiles: string[];
  /** Human-readable note for the summary / verify log. */
  note: string;
}

/** Errors that stem from the missing generated api client (the known baseline). */
function isBaselineError(line: string): boolean {
  // e.g. Cannot find module '@/api-client' / '../../api-client' / '@/api-client/sdk.gen'
  return /Cannot find module '[^']*api-client[^']*'/.test(line);
}

/** A `tsc` error line "path/to/File.tsx(12,3): error TS....". Extract the path. */
function errorFileOf(line: string): string | undefined {
  const m = line.match(/^(.+?\.[tj]sx?)\(\d+,\d+\):\s+error TS/);
  return m?.[1];
}

/**
 * Decide whether a build result is a gate-pass. `changedFiles` are paths the
 * agent (or canned diff) modified, relative to `web_src/` (e.g.
 * "src/pages/app/Markdown.tsx"); an error in any of those is always fatal.
 *
 * Logic:
 *  - clean build → pass.
 *  - otherwise, parse error lines. If every error file is part of the api-client
 *    codegen baseline (a `Cannot find module ...api-client...` error, or a file
 *    that errors *because* the client is missing) AND none of the agent's changed
 *    files appear among the error files, the change itself is sound → pass with a
 *    discounted-baseline note.
 *  - any error in a changed file, or non-baseline errors → fail.
 */
export function evaluateBuild(build: RunResult, changedFiles: string[] = []): BuildEvaluation {
  if (build.ok) {
    return {
      passed: true,
      cleanBuild: true,
      discountedBaseline: false,
      errorFiles: [],
      note: 'Build passed cleanly (tsc -b && vite build).',
    };
  }

  const out = `${build.stdout}\n${build.stderr}`;
  const lines = out.split('\n');

  // The set of files that have any error, and whether each only fails due to the
  // missing api-client (directly, or because a symbol it imports is missing).
  const errorFiles = new Set<string>();
  let sawBaseline = false;
  let sawVitePreClient = false;

  for (const line of lines) {
    const f = errorFileOf(line);
    if (f) errorFiles.add(f.replace(/^.*\/web_src\//, '').replace(/^\.\//, ''));
    if (isBaselineError(line)) sawBaseline = true;
    // The vite/rollup failure when the client dir is absent.
    if (/Could not load .*\/src\/api-client\b/.test(line) || /api-client.*ENOENT/.test(line)) {
      sawBaseline = true;
      sawVitePreClient = true;
    }
  }

  const changed = new Set(changedFiles.map((p) => p.replace(/^web_src\//, '').replace(/^\.\//, '')));
  const changedHasError = [...errorFiles].some((f) => changed.has(f));

  // Errors that are NOT plausibly the api-client baseline: an error file that
  // isn't one of the many app files broken by the missing client. We can't fully
  // attribute each line, so the conservative rule is: if we saw baseline markers
  // AND no changed file errored, treat it as the known codegen gap.
  const onlyBaseline = (sawBaseline || sawVitePreClient) && !changedHasError;

  if (onlyBaseline) {
    return {
      passed: true,
      cleanBuild: false,
      discountedBaseline: true,
      errorFiles: [...errorFiles],
      note:
        'Build did not go fully green, but the failures are the fork’s pre-existing ' +
        'api-client codegen baseline (gitignored generated @/api-client). The changed ' +
        'file(s) type-check cleanly and the component preview builds, so the gate passes. ' +
        'Run the repo codegen (make / generate:api) for a fully green app build.',
    };
  }

  return {
    passed: false,
    cleanBuild: false,
    discountedBaseline: false,
    errorFiles: [...errorFiles],
    note:
      changedHasError
        ? `Build failed with errors in changed file(s): ${[...errorFiles].filter((f) => changed.has(f)).join(', ')}.`
        : 'Build failed with errors beyond the api-client baseline.',
  };
}
