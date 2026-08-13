import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("entry page loads local assets and uses the current port", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /http:\/\/localhost:4174\/login/);
  assert.doesNotMatch(html, /localhost:8000/);
  assert.match(html, /\/public\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com/);
  await access(new URL("public/vendor/xlsx.full.min.js", root));
});

test("management password is verified by the backend", async () => {
  const [app, server] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("server/index.mjs", root), "utf8"),
  ]);
  assert.match(app, /\/api\/auth\/verify-password/);
  assert.match(server, /url\.pathname === "\/api\/auth\/verify-password"/);
  assert.doesNotMatch(app, /profile\.pin\s*[=!]=|profile\.pin\s*=|pin:\s*password/);
  assert.doesNotMatch(app, /pin:password/);
});

test("account deletion only appears in personal information", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  const classPage = app.slice(app.indexOf("function classPage()"), app.indexOf("function profilePage()"));
  const profilePage = app.slice(app.indexOf("function profilePage()"), app.indexOf("function displayPage()"));
  assert.doesNotMatch(classPage, /注销账号/);
  assert.match(profilePage, /注销账号/);
});

test("only the newest student call can trigger a classroom popup", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  const pending = app.slice(app.indexOf("function pendingDisplayAlert()"), app.indexOf("function showNextDisplayAlert()"));
  assert.match(pending, /latestCall/);
  assert.doesNotMatch(pending, /filter\(item=>!state\.studentCallReceipts/);
});

test("state writes use optimistic concurrency control", async () => {
  const [app, server, schema] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("server/index.mjs", root), "utf8"),
    readFile(new URL("server/schema.sql", root), "utf8"),
  ]);
  assert.match(schema, /version INTEGER NOT NULL DEFAULT 1/);
  assert.match(app, /JSON\.stringify\(\{ state: remoteData, version: stateVersion \}\)/);
  assert.match(server, /teacher_id = \? AND version = \?/);
  assert.match(server, /STATE_CONFLICT/);
});

test("backup restore is password protected and fake verification codes are absent", async () => {
  const [app, server] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("server/index.mjs", root), "utf8"),
  ]);
  assert.match(app, /\/api\/backup\/restore/);
  assert.match(server, /url\.pathname === "\/api\/backup\/restore"/);
  assert.match(server, /verifyPassword\(String\(password\)/);
  assert.doesNotMatch(app, /123456|reset-pin|send-pin-code/);
});

test("conflicts and destructive actions use recoverable in-app flows", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  assert.match(app, /type: "state-conflict"/);
  assert.match(app, /reload-latest-state/);
  assert.match(app, /danger-confirm-form/);
  assert.match(app, /kind==='class'[\s\S]*\/api\/auth\/verify-password/);
  assert.doesNotMatch(app, /confirm\('确定删除/);
});

test("backup status is visible and documents restore scope", async () => {
  const [app, server] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("server/index.mjs", root), "utf8"),
  ]);
  assert.match(server, /url\.pathname === "\/api\/backup\/status"/);
  assert.match(app, /最近自动备份/);
  assert.match(app, /恢复时会整体替换这些数据/);
});

test("navigation state is not synchronized and classroom PIN stays server-side", async () => {
  const [app, server] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("server/index.mjs", root), "utf8"),
  ]);
  assert.match(app, /const \{view,picker,modal,popover/);
  assert.match(server, /delete state\.homeworkClassroomPin/);
  assert.match(server, /\/api\/homework-pin\/verify/);
  assert.match(server, /homework_pin_hash/);
  assert.doesNotMatch(app, /state\.homeworkClassroomPin\s*=/);
});

test("legacy hidden controls are removed and password change is reachable", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);
  assert.doesNotMatch(app, /data-action="manual"|id==='profile-form'|action==='coming'/);
  assert.doesNotMatch(styles, /data-action="manual"/);
  assert.match(app, /id="change-password-form"/);
  assert.match(app, /\/api\/account\/password/);
  assert.match(app, /type:'enter-display'/);
});
