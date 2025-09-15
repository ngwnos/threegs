// Minimal static file server using Bun.serve
const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";

    const file = Bun.file(`./public${pathname}`);
    if (!file.size) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(file);
  },
});

console.log(`🦊 Bun static server running http://localhost:${server.port}`);

