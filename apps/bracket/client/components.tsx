import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, WarningCircleIcon, TrophyIcon } from "@phosphor-icons/react";
import { Button } from "@hollyweb/core/components/core/button";
import { Spinner } from "@hollyweb/core/components/core/spinner";
import { cn } from "@hollyweb/core/lib/utils";
import type { Entrant } from "../shared/bracket";
import { loginURL } from "./api";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-3" aria-label="Bracket home">
      <span className="logo-mark">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 4h5v16H3m18-16h-5v16h5M8 12h8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
      <span className={cn("font-medium tracking-tight", small ? "text-lg" : "text-xl")}>
        bracket<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
export function Loading() {
  return (
    <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground">
      <Spinner /> Loading…
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
  retryLabel = "Try again",
}: {
  error: unknown;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="my-4 flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-4 text-sm"
    >
      <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
export function SignInPrompt({ title = "Sign in" }: { title?: string }) {
  return (
    <section className="mx-auto max-w-lg py-24 text-center">
      <p className="holly-section-label">Hollyweb account</p>
      <h1 className="mt-4 text-4xl font-medium">{title}</h1>
      <p className="mt-4 text-muted-foreground">Sign in to create brackets and save picks.</p>
      <Button nativeButton={false} className="mt-8" render={<a href={loginURL()} />}>
        Continue with Google <ArrowRightIcon />
      </Button>
    </section>
  );
}
export function EntrantArt({ entry, className }: { entry: Entrant; className?: string }) {
  const shade = [...entry.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  return (
    <div className={cn("entrant-art", `art-${shade}`, className)}>
      {entry.image ? (
        <img src={entry.image} alt={entry.name} loading="lazy" />
      ) : (
        <>
          <span className="art-grid" />
          <span className="art-initial" aria-hidden="true">
            {entry.name.trim().slice(0, 1).toUpperCase()}
          </span>
        </>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="holly-section-label">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-medium sm:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-6 py-14 text-center">
      <TrophyIcon className="mx-auto mb-5 size-8 text-muted-foreground" />
      <h2 className="text-xl font-medium">{title}</h2>
      <div className="mt-3 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
