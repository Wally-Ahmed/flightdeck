/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Use the local mock fixture instead of the live orchestrator. Default true. */
  readonly VITE_USE_MOCK?: string;
  /** Orchestrator base URL for GET /api/runs etc. Empty => same-origin. */
  readonly VITE_API_BASE?: string;
  /** Alias accepted for the orchestrator base URL (the name render.yaml injects). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
