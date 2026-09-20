import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { Layout } from "./layout";
import { Home } from "./pages/home";
import { Dashboard } from "./pages/dashboard";
import { Editor } from "./pages/editor";
import { SharedBracket, GuestPlay, SavedPlay } from "./pages/play";
import { ErrorNotice } from "./components";

const root = createRootRoute({
  component: Layout,
  errorComponent: ({ error, reset }) => <ErrorNotice error={error} retry={reset} />,
  notFoundComponent: () => (
    <section className="py-24 text-center">
      <h1 className="text-4xl">Page not found</h1>
      <Link to="/" className="mt-6 inline-block text-primary">
        Back to Bracket →
      </Link>
    </section>
  ),
});
const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
const dashboard = createRoute({
  getParentRoute: () => root,
  path: "/dashboard",
  component: Dashboard,
});
const create = createRoute({ getParentRoute: () => root, path: "/new", component: Editor });
const edit = createRoute({ getParentRoute: () => root, path: "/edit/$id", component: Editor });
const shared = createRoute({
  getParentRoute: () => root,
  path: "/b/$shareID",
  component: SharedBracket,
});
const play = createRoute({
  getParentRoute: () => root,
  path: "/play/$shareID",
  component: GuestPlay,
});
const run = createRoute({ getParentRoute: () => root, path: "/run/$id", component: SavedPlay });
export const router = createRouter({
  routeTree: root.addChildren([home, dashboard, create, edit, shared, play, run]),
  scrollRestoration: true,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
