import { handleApiRequest } from "./api";
import app from "./frontend/index.html";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/": app,
    "/entry/new": app,
    "/entry/*": app,
    "/settings": app,
  },
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request);
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`AI Journal listening on http://localhost:${server.port}`);
