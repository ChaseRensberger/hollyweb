import { Link, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRightIcon, PlusIcon, SignOutIcon } from "@phosphor-icons/react";
import { ThemeToggle } from "@hollyweb/core/components/theme-toggle";
import { Button } from "@hollyweb/core/components/core/button";
import { api, loginURL, meOptions } from "./api";
import { Logo, ErrorNotice } from "./components";

export function Layout() {
  const me = useQuery(meOptions);
  const cache = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      cache.clear();
      location.assign("/");
    } catch (error) {
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <span className="app-family">Hollyweb</span>
          <nav aria-label="Main navigation">
            <Link to="/dashboard" className="nav-link" activeProps={{ className: "nav-active" }}>
              My collection
            </Link>
            <span className="nav-divider" />
            <ThemeToggle />
            {me.data?.user ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sign out of Bracket"
                  title={`Signed in as ${me.data.user.name}`}
                  onClick={() => void logout()}
                >
                  <SignOutIcon />
                </Button>
                <Button nativeButton={false} size="sm" render={<Link to="/new" />}>
                  <PlusIcon /> New bracket
                </Button>
              </>
            ) : (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<a href={loginURL("/dashboard")} />}
              >
                Sign in <ArrowUpRightIcon />
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="main-content">
        {error && <ErrorNotice error={error} />}
        <Outlet />
      </main>
      <footer className="site-footer">
        <Logo small />
        <a
          href={me.data?.accountURL ?? "/auth/login"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        >
          Hollyweb account <ArrowUpRightIcon />
        </a>
      </footer>
    </div>
  );
}
