import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("account, state, PIN and backup APIs form a complete flow", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "banwutong-api-test-"));
  const port = 4199;
  const server = spawn(process.execPath, [fileURLToPath(new URL("server/index.mjs", root))], {
    cwd: fileURLToPath(root),
    env: { ...process.env, PORT: String(port), DATA_DIR: temp, BACKUP_DIR: join(temp, "backups") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverError = "";
  server.stderr.on("data", chunk => { serverError += String(chunk); });
  t.after(async () => { server.kill("SIGTERM"); await rm(temp, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("测试服务启动超时")), 5000);
    server.stdout.on("data", chunk => { if (String(chunk).includes("班务通已启动")) { clearTimeout(timer); resolve(); } });
    server.once("exit", code => reject(new Error(`测试服务提前退出：${code}\n${serverError}`)));
  });

  let cookie = "";
  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    const body = await response.json();
    return { response, body };
  };

  const registered = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ phone: "18800000001", password: "secret8" }) });
  assert.equal(registered.response.status, 201);
  const initialState = await request("/api/state");
  assert.equal(initialState.body.version, 1);
  const saved = await request("/api/state", { method: "PUT", body: JSON.stringify({ version: 1, state: { classInfo: { name: "测试班" }, students: [{ id: "s1", name: "测试学生" }], view: "home" } }) });
  assert.equal(saved.body.version, 2);
  const state = await request("/api/state");
  assert.equal(state.body.state.classInfo.name, "测试班");
  assert.equal("view" in state.body.state, false);

  assert.equal((await request("/api/homework-pin", { method: "PUT", body: JSON.stringify({ enabled: true, pin: "2468" }) })).response.status, 200);
  assert.equal((await request("/api/homework-pin/verify", { method: "POST", body: JSON.stringify({ pin: "0000" }) })).response.status, 403);
  assert.equal((await request("/api/homework-pin/verify", { method: "POST", body: JSON.stringify({ pin: "2468" }) })).response.status, 200);
  const backup = await request("/api/backup/status");
  assert.equal(backup.body.automatic, true);
  assert.ok(backup.body.count >= 1);

  const deleted = await request("/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "注销账号", password: "secret8" }) });
  assert.equal(deleted.response.status, 200);
});
