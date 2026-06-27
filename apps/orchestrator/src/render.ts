/**
 * Render API client — create a per-issue preview environment and return its URL.
 *
 * Two tiers (PROJECT_BRIEF section 8):
 *   - storybook → a Render **static site** built from the fork branch
 *     (`web_src` build of Storybook). No backend, no spin-down, instant URL.
 *   - image     → a **web service** from a prebuilt Docker image (runtime "image").
 *
 * Talks to the documented REST surface: `POST /v1/services` (Bearer auth), reading
 * the created service's `serviceDetails.url`. The create response has been returned
 * both as `{ service, deployId }` and as a bare service object across API versions,
 * so we read defensively. `GET /v1/owners` resolves the owner id when not provided.
 *
 * The orchestrator must boot and the pipeline must complete credential-free, so
 * when `RENDER_API_KEY` is absent we return a clearly-marked placeholder URL rather
 * than throwing — the demo still gets a "preview" node that the canvas can gate on
 * locally. With a real key, this creates a real service.
 */
import { config } from './config.js';

const RENDER_API = 'https://api.render.com/v1';

interface RenderServiceResponse {
  id?: string;
  serviceDetails?: { url?: string };
  // some API responses nest the service:
  service?: { id?: string; serviceDetails?: { url?: string } };
}

/** Authenticated fetch against the Render API; throws on non-2xx. */
async function renderFetch(path: string, init?: RequestInit): Promise<unknown> {
  if (!config.renderApiKey) throw new Error('RENDER_API_KEY is not set');
  const res = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.renderApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Render API ${path} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Resolve the owner id to create services under (configured or first owner). */
async function resolveOwnerId(): Promise<string> {
  if (config.renderOwnerId) return config.renderOwnerId;
  const owners = (await renderFetch('/owners?limit=1')) as Array<{ owner?: { id?: string } }>;
  const id = owners?.[0]?.owner?.id;
  if (!id) throw new Error('Could not resolve a Render owner id; set RENDER_OWNER_ID');
  return id;
}

/** Pull the preview URL out of a create-service response, whatever its shape. */
function extractUrl(body: unknown): string | undefined {
  const r = body as RenderServiceResponse;
  return r.serviceDetails?.url ?? r.service?.serviceDetails?.url;
}

/** Terminal deploy states Render reports (success vs the various failures). */
const DEPLOY_LIVE = new Set(['live']);
const DEPLOY_FAILED = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated']);

/**
 * Poll a freshly-created service's latest deploy until it's `live` (or fails /
 * times out). Render's `POST /v1/services` returns immediately, but the static
 * site isn't reachable until its first build/deploy finishes — so the canvas's
 * live gate (an HTTP GET expecting 200) would race the build without this.
 *
 * Returns the terminal status string, or 'unknown' if we time out. Never throws:
 * a deploy we couldn't confirm is reported honestly (the caller marks the URL as
 * not-confirmed-live) rather than crashing the stage.
 */
async function waitForDeployLive(serviceId: string, timeoutMs = 8 * 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  // The list endpoint returns newest-first; the create response may also carry a
  // deployId, but listing avoids depending on which shape we got.
  while (Date.now() < deadline) {
    let status = 'unknown';
    try {
      const res = (await renderFetch(`/services/${serviceId}/deploys?limit=1`)) as Array<{
        deploy?: { status?: string };
        status?: string;
      }>;
      const first = res?.[0];
      status = (first?.deploy?.status ?? first?.status ?? 'unknown').toString();
    } catch {
      // transient API hiccup; keep polling until the deadline
    }
    if (DEPLOY_LIVE.has(status)) return status;
    if (DEPLOY_FAILED.has(status)) return status;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return 'unknown';
}

export interface DeployInput {
  issueNumber: number;
  branch: string;
  /** Fork slug `owner/repo` (for git-based static-site builds). */
  fork: string;
  /** Preview tier; defaults to storybook (the reliable path). */
  previewTarget?: 'storybook' | 'image';
  /** Prebuilt image path (e.g. ghcr.io/owner/app:tag) for the image tier. */
  imagePath?: string;
}

export interface DeployResult {
  previewUrl: string;
  /** The created Render service id, when a real service was created. */
  serviceId?: string;
  /** True when this is a placeholder (no RENDER_API_KEY). */
  placeholder: boolean;
  /**
   * Latest deploy status when a real service was created and polled:
   * 'live' (reachable), a Render failure state, or 'unknown' (poll timed out).
   * Absent for placeholders. Lets the caller report honestly whether the preview
   * is actually live before the canvas's GET-200 gate runs.
   */
  deployStatus?: string;
}

/** Deterministic placeholder URL so the pipeline completes credential-free. */
function placeholderUrl(issueNumber: number): string {
  return `https://flightdeck-preview-${issueNumber}.onrender.com`;
}

const repoUrl = (fork: string) =>
  fork.startsWith('http') ? fork.replace(/\.git$/, '') : `https://github.com/${fork.replace(/\.git$/, '')}`;

/**
 * Create a Storybook static-site preview from the fork branch. The build runs
 * `web_src`'s storybook build and publishes the static output.
 */
async function deployStorybookSite(input: DeployInput, ownerId: string): Promise<DeployResult> {
  const name = `flightdeck-5368-preview-${input.issueNumber}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const body = {
    type: 'static_site',
    name,
    ownerId,
    repo: repoUrl(input.fork),
    branch: input.branch,
    rootDir: 'web_src',
    serviceDetails: {
      // Render runs the build FROM rootDir (web_src), so publishPath is relative to
      // it — `storybook-static`, NOT `web_src/storybook-static` (which would resolve
      // to web_src/web_src/storybook-static and serve nothing). Verified against the
      // fork's `build-storybook` (= `storybook build`, output `storybook-static/`).
      buildCommand: 'npm ci && npm run build-storybook',
      publishPath: 'storybook-static',
    },
  };
  const res = await renderFetch('/services', { method: 'POST', body: JSON.stringify(body) });
  const url = extractUrl(res);
  const serviceId = (res as RenderServiceResponse).service?.id ?? (res as RenderServiceResponse).id;
  // Wait for the first build/deploy to finish so the live gate doesn't race it.
  const deployStatus = serviceId ? await waitForDeployLive(serviceId) : 'unknown';
  return { previewUrl: url ?? placeholderUrl(input.issueNumber), serviceId, placeholder: false, deployStatus };
}

/** Create a web service from a prebuilt Docker image (the heavy/flow tier). */
async function deployImageService(input: DeployInput, ownerId: string): Promise<DeployResult> {
  if (!input.imagePath) throw new Error('image previewTarget requires imagePath (the pushed Docker image)');
  const name = `flightdeck-app-${input.issueNumber}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const body = {
    type: 'web_service',
    name,
    ownerId,
    serviceDetails: {
      runtime: 'image',
      plan: 'free',
      envSpecificDetails: {},
    },
    image: { ownerId, imagePath: input.imagePath },
  };
  const res = await renderFetch('/services', { method: 'POST', body: JSON.stringify(body) });
  const url = extractUrl(res);
  const serviceId = (res as RenderServiceResponse).service?.id ?? (res as RenderServiceResponse).id;
  return { previewUrl: url ?? placeholderUrl(input.issueNumber), serviceId, placeholder: false };
}

/**
 * Deploy the per-issue preview and return its URL. Credential-free, returns a
 * placeholder so the canvas's deploy stage still produces a URL for its live gate.
 */
export async function deployPreview(input: DeployInput): Promise<DeployResult> {
  if (!config.renderApiKey) {
    return { previewUrl: placeholderUrl(input.issueNumber), placeholder: true };
  }
  const ownerId = await resolveOwnerId();
  if (input.previewTarget === 'image') return deployImageService(input, ownerId);
  return deployStorybookSite(input, ownerId);
}
