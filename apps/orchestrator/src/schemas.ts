/**
 * Request validation schemas (zod) for the stage + API endpoints.
 *
 * These mirror the frozen request shapes in `@flightdeck/contracts`. The canvas's
 * `http` nodes POST these bodies; validating them gives the caller a clean 400
 * instead of a 500 deep in a handler, and narrows the types for the handlers.
 */
import { z } from 'zod';

export const specSchema = z.object({
  summary: z.string(),
  files: z.array(z.string()),
  approach: z.string(),
  acceptanceCriteria: z.array(z.string()),
  previewTarget: z.enum(['storybook', 'image']),
});

export const codeStageSchema = z.object({
  issueNumber: z.number(),
  fork: z.string().min(1),
  branch: z.string().min(1),
  spec: specSchema,
});

export const verifyStageSchema = z.object({
  issueNumber: z.number(),
  branch: z.string().min(1),
});

export const deployStageSchema = z.object({
  issueNumber: z.number(),
  branch: z.string().min(1),
  // Optional extras the orchestrator can use but the canvas need not send.
  fork: z.string().optional(),
  previewTarget: z.enum(['storybook', 'image']).optional(),
  imagePath: z.string().optional(),
});

export const prStageSchema = z.object({
  issueNumber: z.number(),
  branch: z.string().min(1),
  previewUrl: z.string(),
  reviewNotes: z.string(),
  fork: z.string().optional(),
});

export const triggerSchema = z.object({
  issueNumber: z.number(),
  // Optional overrides; otherwise read from the issue / env.
  issueTitle: z.string().optional(),
  issueBody: z.string().optional(),
  fork: z.string().optional(),
  branch: z.string().optional(),
});

export type CodeStageBody = z.infer<typeof codeStageSchema>;
export type VerifyStageBody = z.infer<typeof verifyStageSchema>;
export type DeployStageBody = z.infer<typeof deployStageSchema>;
export type PrStageBody = z.infer<typeof prStageSchema>;
export type TriggerBody = z.infer<typeof triggerSchema>;
