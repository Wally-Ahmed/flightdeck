/**
 * Git operations for the coding agent — clone, branch, commit, push.
 *
 * All shelling-out goes through the no-shell `run`/`runOrThrow` helpers, so a
 * branch name or fork slug derived from input can never break out into the shell.
 * The GitHub token is injected into the *push* remote URL (the standard headless
 * pattern) and is never written to the clone's persisted config, so it doesn't
 * linger on disk in `.git/config`.
 */
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, runOrThrow } from './exec.js';
import { config } from '../config.js';

/** Parse `owner/repo` (optionally a full URL) into its parts. */
export function parseFork(fork: string): { owner: string; repo: string } {
  const cleaned = fork
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();
  const [owner, repo] = cleaned.split('/');
  if (!owner || !repo) throw new Error(`Invalid fork "${fork}" — expected owner/repo`);
  return { owner, repo };
}

/** HTTPS clone URL with the token embedded for authenticated push. */
function authedUrl(owner: string, repo: string, token: string): string {
  // x-access-token is the documented username for a PAT over HTTPS.
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
}

export interface CloneResult {
  /** Absolute path to the working tree. */
  dir: string;
  owner: string;
  repo: string;
}

/**
 * Clone `fork` into a fresh per-issue directory under the configured workdir and
 * check out (or create) `branch`. A pre-existing directory is removed first so
 * reruns start clean. Uses a shallow clone for speed; the fork's full history
 * isn't needed to apply a change and open a PR.
 */
export async function cloneFork(fork: string, branch: string, issueNumber: number): Promise<CloneResult> {
  const token = config.githubToken;
  if (!token) throw new Error('GITHUB_TOKEN is not set — cannot clone the fork');
  const { owner, repo } = parseFork(fork);

  await mkdir(config.workdir, { recursive: true });
  const dir = join(config.workdir, `issue-${issueNumber}`);
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });

  await runOrThrow('git', ['clone', '--depth', '1', authedUrl(owner, repo, token), dir]);

  // Identity for the commit (no global git config in the container).
  await runOrThrow('git', ['config', 'user.name', 'Flightdeck Agent'], { cwd: dir });
  await runOrThrow('git', ['config', 'user.email', 'flightdeck@users.noreply.github.com'], { cwd: dir });

  // Fresh branch off the default HEAD.
  await runOrThrow('git', ['checkout', '-B', branch], { cwd: dir });

  return { dir, owner, repo };
}

/** Stage everything, commit with `message`. Returns the new HEAD sha. */
export async function commitAll(dir: string, message: string): Promise<string> {
  await runOrThrow('git', ['add', '-A'], { cwd: dir });
  // `commit` exits non-zero when there's nothing to commit; tolerate that so a
  // re-applied identical diff doesn't crash the stage.
  const committed = await run('git', ['commit', '-m', message], { cwd: dir });
  if (!committed.ok && !/nothing to commit/i.test(committed.stdout + committed.stderr)) {
    throw new Error(`git commit failed: ${committed.stderr || committed.stdout}`);
  }
  const sha = await runOrThrow('git', ['rev-parse', 'HEAD'], { cwd: dir });
  return sha.stdout.trim();
}

/** Force-push `branch` to origin (the authed fork). Idempotent across reruns. */
export async function pushBranch(dir: string, branch: string): Promise<void> {
  await runOrThrow('git', ['push', '--force', 'origin', `HEAD:refs/heads/${branch}`], { cwd: dir });
}

/** The current HEAD sha of a working tree. */
export async function headSha(dir: string): Promise<string> {
  const sha = await runOrThrow('git', ['rev-parse', 'HEAD'], { cwd: dir });
  return sha.stdout.trim();
}

/** True if the working tree has staged or unstaged changes. */
export async function hasChanges(dir: string): Promise<boolean> {
  const res = await run('git', ['status', '--porcelain'], { cwd: dir });
  return res.stdout.trim().length > 0;
}

/**
 * Paths changed in the working tree (added/modified/renamed), relative to the
 * repo root — e.g. "web_src/src/pages/app/Markdown.tsx". Used to attribute build
 * errors: an error in a changed file is the agent's; everything else may be the
 * fork's pre-existing baseline.
 */
export async function changedFiles(dir: string): Promise<string[]> {
  const res = await run('git', ['status', '--porcelain'], { cwd: dir });
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // Porcelain v1: "XY path" or "XY old -> new" for renames.
      const path = l.replace(/^.. /, '');
      const arrow = path.split(' -> ');
      return (arrow[1] ?? path).trim();
    });
}
