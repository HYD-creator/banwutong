import { mkdir, readFile, writeFile, cp } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const css = await readFile("styles.css", "utf8");
const js = await readFile("app.js", "utf8");

await mkdir("dist/server", { recursive: true });
await mkdir("dist/static", { recursive: true });
await mkdir("dist/.openai", { recursive: true });

await writeFile("dist/static/index.html", html);
await writeFile("dist/static/styles.css", css);
await writeFile("dist/static/app.js", js);
await cp("public/favicon.svg", "dist/static/favicon.svg");
await cp(".openai/hosting.json", "dist/.openai/hosting.json");

const worker = `const files = {
  "/": { body: ${JSON.stringify(html)}, type: "text/html; charset=utf-8" },
  "/index.html": { body: ${JSON.stringify(html)}, type: "text/html; charset=utf-8" },
  "/styles.css": { body: ${JSON.stringify(css)}, type: "text/css; charset=utf-8" },
  "/app.js": { body: ${JSON.stringify(js)}, type: "text/javascript; charset=utf-8" }
};

export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const file = files[pathname] ?? (pathname.includes(".") ? null : files["/"]);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body, {
      headers: {
        "content-type": file.type,
        "cache-control": "public, max-age=300"
      }
    });
  }
};
`;
await writeFile("dist/server/index.js", worker);
