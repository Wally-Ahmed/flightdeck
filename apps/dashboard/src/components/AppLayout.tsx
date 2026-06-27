/**
 * App shell — harvested from the shadcn scaffold's AppLayout, with the auth and
 * react-router wiring stripped out. The run board is a single page, so the
 * sidebar nav is static (the run board is the only destination); the rest keeps
 * the original deck look (sidebar + content, dark theme tokens).
 */
import { Rocket, LayoutDashboard, GitBranch } from 'lucide-react';

const MOCK_BADGE_VISIBLE = true;

export function AppLayout({
  children,
  usingMock,
}: {
  children: React.ReactNode;
  usingMock: boolean;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop only; collapses away on mobile (board stacks below) */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card/50 p-4">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Rocket className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">Flightdeck</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <span className="flex items-center gap-3 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            <LayoutDashboard className="h-4 w-4" />
            Run Board
          </span>
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="truncate">superplanehq/superplane</span>
          </div>
          {MOCK_BADGE_VISIBLE && usingMock && (
            <div className="mt-2 px-3 text-[10px] uppercase tracking-wide text-warning">
              mock data
            </div>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Rocket className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Flightdeck</span>
          </div>
          {usingMock && (
            <span className="text-[10px] uppercase tracking-wide text-warning">mock</span>
          )}
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
