import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Storage } from "./storage";
import { Dashboard, Page } from "./ui";

function sortValue(value: string | undefined): "tokens" | "cost" | "recent" {
  return value === "cost" || value === "recent" ? value : "tokens";
}

export function createApp(storage: Storage): Hono {
  const app = new Hono();

  app.get("/assets/app.css", serveStatic({ path: "./public/app.css" }));
  app.get(
    "/assets/htmx.min.js",
    serveStatic({ path: "./node_modules/htmx.org/dist/htmx.min.js" }),
  );
  app.get("/healthz", (context) => context.json({ status: "ok" }));
  app.get("/api/dashboard", (context) =>
    context.json(storage.dashboard(sortValue(context.req.query("sort")))),
  );
  app.get("/partials/dashboard", (context) => {
    const sort = sortValue(context.req.query("sort"));
    return context.html(
      <Dashboard data={storage.dashboard(sort)} sort={sort} />,
    );
  });
  app.get("/", (context) => {
    const sort = sortValue(context.req.query("sort"));
    return context.html(
      <Page>
        <div
          id="dashboard"
          hx-get={`/partials/dashboard?sort=${sort}`}
          hx-trigger="every 60s"
          hx-swap="innerHTML"
        >
          <Dashboard data={storage.dashboard(sort)} sort={sort} />
        </div>
      </Page>,
    );
  });
  app.notFound((context) => context.json({ error: "not found" }, 404));
  return app;
}
