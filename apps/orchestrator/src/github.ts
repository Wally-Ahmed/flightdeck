/**
 * GitHub client — open the PR on the fork and comment the live preview link.
 *
 * The PR is the deliverable (PROJECT_BRIEF section 9): a pull request on the fork,
 * from the agent's branch into the fork's default branch, with a comment carrying
 * the clickable Render preview URL. Uses octokit/rest with the configured PAT.
 *
 * Constructed lazily so the orchestrator boots without a token; `openPr` throws a
 * clear error if called credential-free.
 */
import { Octokit } from '@octokit/rest';
import { config } from './config.js';
import { parseFork } from './agent/git.js';

let octokit: Octokit | undefined;

function client(): Octokit {
  if (!config.githubToken) throw new Error('GITHUB_TOKEN is not set — cannot talk to GitHub');
  if (!octokit) octokit = new Octokit({ auth: config.githubToken });
  return octokit;
}

/** The fork slug, from `fork` arg if given, else `GITHUB_REPO`. */
function resolveFork(fork?: string): { owner: string; repo: string } {
  const slug = fork ?? config.githubRepo;
  if (!slug) throw new Error('No fork provided and GITHUB_REPO is not set');
  return parseFork(slug);
}

export interface OpenPrInput {
  issueNumber: number;
  branch: string;
  previewUrl: string;
  reviewNotes: string;
  /** owner/repo of the fork; defaults to GITHUB_REPO. */
  fork?: string;
  /** PR title; defaults to a generated one. */
  title?: string;
}

export interface OpenPrResult {
  prUrl: string;
  prNumber: number;
}

/** The fork's default branch (base for the PR). */
async function defaultBranch(owner: string, repo: string): Promise<string> {
  const { data } = await client().repos.get({ owner, repo });
  return data.default_branch;
}

/**
 * Open (or reuse) a PR for the agent's branch and post the preview link as a
 * comment. Idempotent: if a PR for the head branch already exists it's reused and
 * a fresh preview comment is added, so reruns don't error on "PR already exists".
 */
export async function openPr(input: OpenPrInput): Promise<OpenPrResult> {
  const { owner, repo } = resolveFork(input.fork);
  const gh = client();
  const base = await defaultBranch(owner, repo);
  const head = input.branch;

  const title = input.title ?? `Flightdeck: implement #${input.issueNumber}`;
  const body = [
    `Implements #${input.issueNumber}, built and verified by the Flightdeck factory.`,
    '',
    '## Review notes',
    input.reviewNotes?.trim() || '_No review notes provided._',
    '',
    '## Preview',
    input.previewUrl ? `Live preview: ${input.previewUrl}` : '_Preview pending._',
    '',
    '---',
    '_Specced, coded, verified, and deployed by agents. Gated at every stage by Superplane._',
  ].join('\n');

  // Reuse an open PR for this head branch if one exists.
  const existing = await gh.pulls.list({ owner, repo, state: 'open', head: `${owner}:${head}` });
  let prNumber: number;
  let prUrl: string;

  if (existing.data.length > 0) {
    const pr = existing.data[0]!;
    prNumber = pr.number;
    prUrl = pr.html_url;
    // Refresh the body so review notes/preview stay current.
    await gh.pulls.update({ owner, repo, pull_number: prNumber, body });
  } else {
    const created = await gh.pulls.create({ owner, repo, title, head, base, body });
    prNumber = created.data.number;
    prUrl = created.data.html_url;
  }

  // The deliverable comment: the clickable preview link.
  if (input.previewUrl) {
    await gh.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `Preview is live and ready to test: ${input.previewUrl}`,
    });
  }

  return { prUrl, prNumber };
}

/** Fetch an issue's title + body (used when triggering a run by number). */
export async function getIssue(
  issueNumber: number,
  fork?: string,
): Promise<{ title: string; body: string }> {
  const { owner, repo } = resolveFork(fork);
  const { data } = await client().issues.get({ owner, repo, issue_number: issueNumber });
  return { title: data.title, body: data.body ?? '' };
}
