import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Storage } from "./storage";
import { Dashboard, KindleDashboard, KindlePage, Page } from "./ui";

export function createApp(storage: Storage): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "same-origin");
    context.header("X-Frame-Options", "DENY");
  });

  app.get("/assets/app.css", serveStatic({ path: "./public/app.css" }));
  app.get("/assets/kindle.css", serveStatic({ path: "./public/kindle.css" }));
  app.get("/assets/kindle.js", serveStatic({ path: "./public/kindle.js" }));
  app.get("/assets/logo.svg", serveStatic({ path: "./public/logo.svg" }));
  app.get("/assets/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));
  app.get("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));
  app.get(
    "/apple-touch-icon.png",
    serveStatic({ path: "./public/apple-touch-icon.png" }),
  );
  app.get("/icon-192.png", serveStatic({ path: "./public/icon-192.png" }));
  app.get("/icon-512.png", serveStatic({ path: "./public/icon-512.png" }));
  app.get(
    "/site.webmanifest",
    serveStatic({ path: "./public/site.webmanifest" }),
  );
  app.get("/assets/htmx.min.js", serveStatic({ path: "./public/htmx.min.js" }));
  app.get("/healthz", (context) => context.json({ status: "ok" }));
  app.get("/api/dashboard", (context) => context.json(storage.dashboard()));
  app.get("/partials/dashboard", (context) =>
    context.html(<Dashboard data={storage.dashboard()} />),
  );
  app.get("/partials/kindle", (context) => {
    context.header("Cache-Control", "no-store");
    return context.html(<KindleDashboard data={storage.dashboard()} />);
  });
  app.get("/kindle", (context) =>
    context.html(<KindlePage data={storage.dashboard()} />),
  );
  app.get("/", (context) =>
    context.html(
      <Page>
        <div
          id="dashboard"
          hx-get="/partials/dashboard"
          hx-trigger="every 60s"
          hx-swap="innerHTML"
        >
          <Dashboard data={storage.dashboard()} />
        </div>
      </Page>,
    ),
  );
  app.notFound((context) => context.json({ error: "not found" }, 404));
  return app;
}
