/**
 * Safe process execution for the coding agent.
 *
 * Uses `execFile` (NOT a shell) so arguments are passed as an argv array and are
 * never word-split or interpreted by `/bin/sh` — there is no command-injection
 * surface even when an argument contains spaces, quotes, or a branch name derived
 * from input. Returns structured `{ stdout, stderr, code }` and never throws on a
 * non-zero exit; callers inspect `code` and decide. A hard timeout guards against
 * a wedged git/npm.
 */
import { execFile } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** True iff the process exited 0. */
  ok: boolean;
}

export interface RunOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before the child is killed. Default 15 minutes. */
  timeoutMs?: number;
  /** Max bytes captured per stream. Default 32 MiB (npm output is chatty). */
  maxBuffer?: number;
}

/**
 * Run `file` with `args` as a child process (no shell). Resolves with the exit
 * code and captured output; rejects only on a spawn failure (binary missing).
 */
export function run(file: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  const { cwd, env, timeoutMs = 15 * 60_000, maxBuffer = 32 * 1024 * 1024 } = opts;
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, env: env ?? process.env, timeout: timeoutMs, maxBuffer, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && typeof (err as NodeJS.ErrnoException).code === 'string') {
          // Spawn-level failure (ENOENT etc.) — surface it.
          reject(err);
          return;
        }
        const code = err && typeof err.code === 'number' ? err.code : 0;
        resolve({ code, stdout: stdout.toString(), stderr: stderr.toString(), ok: code === 0 });
      },
    );
  });
}

/** Like `run`, but throws with a helpful message when the command fails. */
export async function runOrThrow(file: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  const res = await run(file, args, opts);
  if (!res.ok) {
    const cmd = `${file} ${args.join(' ')}`;
    throw new Error(`Command failed (${res.code}): ${cmd}\n${res.stderr || res.stdout}`.slice(0, 4000));
  }
  return res;
}
