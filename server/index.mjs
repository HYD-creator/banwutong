import { createServer } from "node:http";
import { readFile, mkdir, readdir, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const DB_PATH = resolve(process.env.DB_PATH || join(DATA_DIR, "class-manager.sqlite"));
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || join(DATA_DIR, "backups"));
const PORT = Number(process.env.PORT || 4174);
const SESSION_DAYS = 14;
const MAX_BODY = 3 * 1024 * 1024;

await mkdir(DATA_DIR, { recursive: true });
await mkdir(BACKUP_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(await readFile(join(import.meta.dirname, "schema.sql"), "utf8"));
try { db.exec("ALTER TABLE teacher_states ADD COLUMN version INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE teacher_states ADD COLUMN homework_pin_enabled INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE teacher_states ADD COLUMN homework_pin_hash TEXT"); } catch {}
try { db.exec("ALTER TABLE teacher_states ADD COLUMN homework_pin_salt TEXT"); } catch {}

async function backupDatabase(label) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const target = join(BACKUP_DIR, `class-manager-${label}-${stamp}.sqlite`);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  const files = await backupFilesNewestFirst();
  await Promise.all(files.slice(7).map(file => unlink(join(BACKUP_DIR, file.name))));
  return target;
}

async function backupFilesNewestFirst() {
  const names = (await readdir(BACKUP_DIR)).filter(name => /^class-manager-.*\.sqlite$/.test(name));
  const files = await Promise.all(names.map(async name => ({ name, info: await stat(join(BACKUP_DIR, name)) })));
  return files.sort((a,b) => b.info.mtimeMs - a.info.mtimeMs);
}

async function ensureDailyBackup() {
  const day = new Date().toISOString().slice(0, 10);
  const target = join(BACKUP_DIR, `class-manager-${day}.sqlite`);
  if (!existsSync(target)) db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  const files = await backupFilesNewestFirst();
  await Promise.all(files.slice(7).map(file => unlink(join(BACKUP_DIR, file.name))));
}
await ensureDailyBackup();

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
function sanitizeState(value) {
  const state = JSON.parse(JSON.stringify(value || {}));
  if (state.profile && typeof state.profile === "object") delete state.profile.pin;
  delete state.homeworkClassroomPin;
  delete state.homeworkClassroomEnabled;
  delete state.classroomHomeworkUnlocked;
  delete state.attendanceRecords;
  for (const key of ["view", "picker", "modal", "popover", "backupStatus", "homeworkDetailId", "homeworkDate", "homeworkStatsPeriod", "attendanceFocusDate", "attendanceStatsPeriod"]) delete state[key];
  return state;
}


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
    if (!teacher) return json(res, 404, { error: "该手机号尚未注册，请先注册", code: "ACCOUNT_NOT_FOUND" });
    if (!verifyPassword(String(password), teacher.password_salt, teacher.password_hash)) return json(res, 401, { error: "密码错误，请重新输入", code: "INVALID_PASSWORD" });
    const session = createSession(teacher.id);
    return json(res, 200, { ok: true, phone: teacher.phone }, { "set-cookie": sessionCookie(session.token, session.expires) });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).class_session;
    if (token) db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    return json(res, 200, { ok: true }, { "set-cookie": "class_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/verify-password") {
    const user = requireUser(req, res); if (!user) return;
    const { password = "" } = await readJson(req);
    const teacher = db.prepare("SELECT password_hash, password_salt FROM teachers WHERE id = ?").get(user.id);
    if (!teacher || !verifyPassword(String(password), teacher.password_salt, teacher.password_hash)) return json(res, 403, { error: "登录密码错误" });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    const user = requireUser(req, res); if (!user) return;
    const row = db.prepare("SELECT state_json, version, updated_at, homework_pin_enabled FROM teacher_states WHERE teacher_id = ?").get(user.id);
    const stored = row ? JSON.parse(row.state_json) : {};
    const state = sanitizeState(stored);
    if (JSON.stringify(state) !== JSON.stringify(stored)) db.prepare("UPDATE teacher_states SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?").run(JSON.stringify(state), user.id);
    state.homeworkClassroomEnabled = Boolean(row?.homework_pin_enabled);
    return json(res, 200, { state, version: row?.version || 1, updatedAt: row?.updated_at || null });
  }
  if (req.method === "PUT" && url.pathname === "/api/state") {
    const user = requireUser(req, res); if (!user) return;
    const { state, version } = await readJson(req);
    if (!state || typeof state !== "object" || Array.isArray(state)) return json(res, 400, { error: "班级数据格式错误" });
    if (!Number.isInteger(version) || version < 1) return json(res, 400, { error: "数据版本无效，请刷新页面" });
    await ensureDailyBackup();
    const value = JSON.stringify(sanitizeState(state));
    const result = db.prepare("UPDATE teacher_states SET state_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ? AND version = ?").run(value, user.id, version);
    if (!result.changes) {
      const latest = db.prepare("SELECT state_json, version, updated_at FROM teacher_states WHERE teacher_id = ?").get(user.id);
      return json(res, 409, { error: "数据已在另一页面更新，请刷新后再操作", code: "STATE_CONFLICT", version: latest?.version, updatedAt: latest?.updated_at });
    }
    return json(res, 200, { ok: true, version: version + 1 });
  }
  if (req.method === "GET" && url.pathname === "/api/backup") {
    const user = requireUser(req, res); if (!user) return;
    const row = db.prepare("SELECT state_json, version, updated_at FROM teacher_states WHERE teacher_id = ?").get(user.id);
    return json(res, 200, { format: "banwutong-backup-v1", createdAt: new Date().toISOString(), phone: user.phone, version: row?.version || 1, state: sanitizeState(row ? JSON.parse(row.state_json) : {}) });
  }
  if (req.method === "GET" && url.pathname === "/api/backup/status") {
    const user = requireUser(req, res); if (!user) return;
    const files = await backupFilesNewestFirst();
    return json(res, 200, { automatic: true, count: files.length, retained: 7, latestAt: files[0]?.info?.mtime?.toISOString() || null });
  }
  if (req.method === "POST" && url.pathname === "/api/backup/restore") {
    const user = requireUser(req, res); if (!user) return;
    const { backup, password = "" } = await readJson(req);
    const teacher = db.prepare("SELECT password_hash, password_salt FROM teachers WHERE id = ?").get(user.id);
    if (!teacher || !verifyPassword(String(password), teacher.password_salt, teacher.password_hash)) return json(res, 403, { error: "登录密码错误" });
    if (backup?.format !== "banwutong-backup-v1" || !backup.state || typeof backup.state !== "object") return json(res, 400, { error: "备份文件格式不正确" });
    await backupDatabase("pre-restore");
    const value = JSON.stringify(sanitizeState(backup.state));
    db.prepare("UPDATE teacher_states SET state_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?").run(value, user.id);
    const row = db.prepare("SELECT version FROM teacher_states WHERE teacher_id = ?").get(user.id);
    return json(res, 200, { ok: true, version: row.version });
  }
  if (req.method === "PUT" && url.pathname === "/api/homework-pin") {
    const user = requireUser(req, res); if (!user) return;
    const { enabled = false, pin = "" } = await readJson(req);
    if (enabled && !/^\d{4,8}$/.test(String(pin))) return json(res, 400, { error: "请输入4—8位数字 PIN" });
    if (!enabled) db.prepare("UPDATE teacher_states SET homework_pin_enabled = 0, homework_pin_hash = NULL, homework_pin_salt = NULL WHERE teacher_id = ?").run(user.id);
    else { const { salt, hash } = hashPassword(String(pin)); db.prepare("UPDATE teacher_states SET homework_pin_enabled = 1, homework_pin_hash = ?, homework_pin_salt = ? WHERE teacher_id = ?").run(hash, salt, user.id); }
    return json(res, 200, { ok: true, enabled: Boolean(enabled) });
  }
  if (req.method === "POST" && url.pathname === "/api/homework-pin/verify") {
    const user = requireUser(req, res); if (!user) return;
    const { pin = "" } = await readJson(req);
    const row = db.prepare("SELECT homework_pin_enabled, homework_pin_hash, homework_pin_salt FROM teacher_states WHERE teacher_id = ?").get(user.id);
    if (!row?.homework_pin_enabled) return json(res, 403, { error: "班主任尚未开启教室作业登记" });
    if (!row.homework_pin_hash || !verifyPassword(String(pin), row.homework_pin_salt, row.homework_pin_hash)) return json(res, 403, { error: "PIN 错误，请重新输入" });
    return json(res, 200, { ok: true });
  }
  if (req.method === "PUT" && url.pathname === "/api/account/password") {
    const user = requireUser(req, res); if (!user) return;
    const { currentPassword = "", password = "" } = await readJson(req);
    const teacher = db.prepare("SELECT password_hash, password_salt FROM teachers WHERE id = ?").get(user.id);
    if (!teacher || !verifyPassword(String(currentPassword), teacher.password_salt, teacher.password_hash)) return json(res, 403, { error: "当前登录密码错误" });
    if (String(password).length < 6) return json(res, 400, { error: "密码至少需要6位" });
    const { salt, hash } = hashPassword(String(password));
    db.prepare("UPDATE teachers SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, salt, user.id);
    return json(res, 200, { ok: true });
  }
  if (req.method === "DELETE" && url.pathname === "/api/account") {
    const user = requireUser(req, res); if (!user) return;
    const { confirmation, password = "" } = await readJson(req);
    if (confirmation !== "注销账号") return json(res, 400, { error: "确认文字不正确" });
    const teacher = db.prepare("SELECT password_hash, password_salt FROM teachers WHERE id = ?").get(user.id);
    if (!teacher || !verifyPassword(String(password), teacher.password_salt, teacher.password_hash)) return json(res, 403, { error: "登录密码错误" });
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
