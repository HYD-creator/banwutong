import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const DB_PATH = resolve(process.env.DB_PATH || join(DATA_DIR, "class-manager.sqlite"));
const PORT = Number(process.env.PORT || 4174);
const SESSION_DAYS = 14;
const MAX_BODY = 3 * 1024 * 1024;

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(await readFile(join(import.meta.dirname, "schema.sql"), "utf8"));

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && timingSafeEqual(actual, target);
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("请求内容过大"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("JSON 格式错误"), { status: 400 }); }
}
function sessionUser(req) {
  const token = parseCookies(req).class_session;
  if (!token) return null;
  return db.prepare(`SELECT teachers.id, teachers.phone FROM sessions JOIN teachers ON teachers.id = sessions.teacher_id WHERE sessions.id = ? AND sessions.expires_at > CURRENT_TIMESTAMP`).get(token) || null;
}
function requireUser(req, res) {
  const user = sessionUser(req);
  if (!user) json(res, 401, { error: "请先登录" });
  return user;
}
function createSession(teacherId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  db.prepare("INSERT INTO sessions (id, teacher_id, expires_at) VALUES (?, ?, ?)").run(token, teacherId, expires.toISOString());
  return { token, expires };
}
function sessionCookie(token, expires) {
  return `class_session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function validPhone(phone) { return /^1\d{10}$/.test(phone); }

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, database: "sqlite" });
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = sessionUser(req);
    return json(res, 200, { authenticated: Boolean(user), user });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const { phone = "", password = "" } = await readJson(req);
    if (!validPhone(String(phone)) || String(password).length < 6) return json(res, 400, { error: "请输入正确手机号，密码至少6位" });
    if (db.prepare("SELECT id FROM teachers WHERE phone = ?").get(phone)) return json(res, 409, { error: "该手机号已经注册" });
    const { salt, hash } = hashPassword(String(password));
    const result = db.prepare("INSERT INTO teachers (phone, password_hash, password_salt) VALUES (?, ?, ?)").run(phone, hash, salt);
    db.prepare("INSERT INTO teacher_states (teacher_id, state_json) VALUES (?, '{}')").run(result.lastInsertRowid);
    const session = createSession(result.lastInsertRowid);
    return json(res, 201, { ok: true, phone }, { "set-cookie": sessionCookie(session.token, session.expires) });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const { phone = "", password = "" } = await readJson(req);
    const teacher = db.prepare("SELECT * FROM teachers WHERE phone = ?").get(String(phone));
    if (!teacher || !verifyPassword(String(password), teacher.password_salt, teacher.password_hash)) return json(res, 401, { error: "手机号或密码错误" });
    const session = createSession(teacher.id);
    return json(res, 200, { ok: true, phone: teacher.phone }, { "set-cookie": sessionCookie(session.token, session.expires) });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).class_session;
    if (token) db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    return json(res, 200, { ok: true }, { "set-cookie": "class_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    const user = requireUser(req, res); if (!user) return;
    const row = db.prepare("SELECT state_json, updated_at FROM teacher_states WHERE teacher_id = ?").get(user.id);
    return json(res, 200, { state: row ? JSON.parse(row.state_json) : {}, updatedAt: row?.updated_at || null });
  }
  if (req.method === "PUT" && url.pathname === "/api/state") {
    const user = requireUser(req, res); if (!user) return;
    const { state } = await readJson(req);
    if (!state || typeof state !== "object" || Array.isArray(state)) return json(res, 400, { error: "班级数据格式错误" });
    const value = JSON.stringify(state);
    db.prepare(`INSERT INTO teacher_states (teacher_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(teacher_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP`).run(user.id, value);
    return json(res, 200, { ok: true });
  }
  if (req.method === "DELETE" && url.pathname === "/api/account") {
    const user = requireUser(req, res); if (!user) return;
    const { confirmation } = await readJson(req);
    if (confirmation !== "注销账号") return json(res, 400, { error: "确认文字不正确" });
    db.prepare("DELETE FROM teachers WHERE id = ?").run(user.id);
    return json(res, 200, { ok: true }, { "set-cookie": "class_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  return json(res, 404, { error: "接口不存在" });
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".csv": "text/csv; charset=utf-8" };
async function staticFile(req, res, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const file = normalize(join(ROOT, requested));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    if (!extname(requested)) {
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" });
      return res.end(await readFile(join(ROOT, "index.html")));
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("页面不存在");
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
  res.end(await readFile(file));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await api(req, res, url); else await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : "服务器内部错误" });
  }
});
server.listen(PORT, "0.0.0.0", () => console.log(`班务通已启动：http://localhost:${PORT}`));
