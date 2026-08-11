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

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
`;
await writeFile("dist/server/index.js", worker);
