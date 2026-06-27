// Stub for `@/lib/utils` cn() — joins truthy class names.
// (The real app uses clsx + tailwind-merge; for a standalone preview a plain
// truthy-join is sufficient and keeps zero extra deps.)
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
