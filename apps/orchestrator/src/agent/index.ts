/**
 * Public surface of the coding-agent module (Phase-1 unit A).
 *
 * Unit B (the orchestrator core) imports `implement` from here and nothing else;
 * the internal git/build/canned helpers stay private to the module.
 */
export { implement } from './implement.js';
export type { ImplementInput } from './implement.js';
export { getCannedDiff } from './canned.js';
export type { CannedDiff, CannedFile } from './canned.js';
