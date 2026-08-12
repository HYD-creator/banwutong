const DAYS = ["周一", "周二", "周三", "周四", "周五"];
const DEFAULT_TASKS = [
  { id: crypto.randomUUID(), name: "扫地", count: 2 },
  { id: crypto.randomUUID(), name: "拖地", count: 2 },
  { id: crypto.randomUUID(), name: "擦黑板", count: 1 },
];
const initial = {
  loggedIn: false, accountPhone: "", setupStep: 0, profile: null, classInfo: null, students: [], leaves: {}, lates: {},
  tasks: DEFAULT_TASKS, draft: {}, published: {}, announcements: [], announcementReceipts: {}, studentCalls: [], studentCallReceipts: {}, assignments: [], homeworkStatus: {}, homeworkClassroomEnabled: false, homeworkClassroomPin: "", classroomHomeworkUnlocked: false, attendanceRecords: [], draftDirty: false, view: "login", picker: null, modal: null, popover: null,
};
let saved;
try { saved = JSON.parse(localStorage.getItem("qinghe-class-manager") || "null"); } catch { saved = null; }
let state = { ...initial, ...(saved || {}) };
function keepRecentStudentCalls(){
  state.studentCalls=[...(state.studentCalls||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,2);
  const retained=new Set(state.studentCalls.map(item=>item.id));state.studentCallReceipts=Object.fromEntries(Object.entries(state.studentCallReceipts||{}).filter(([id])=>retained.has(id)));
}
keepRecentStudentCalls();
let serverReady = false;
let saveTimer = null;
if (new URLSearchParams(window.location.search).get("logout") === "1") {
  state.loggedIn = false;
  state.view = "login";
  window.history.replaceState({}, "", window.location.pathname);
}
const app = document.querySelector("#app");
let rollCallTimer = null;

function persist() {
  const { picker, modal, popover, classroomHomeworkUnlocked, ...data } = state;
  localStorage.setItem("qinghe-class-manager", JSON.stringify(data));
  if (serverReady && state.loggedIn) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => apiFetch("/api/state", { method: "PUT", body: JSON.stringify({ state: data }) }).catch(() => toast("数据暂未同步，请检查服务器连接")), 250);
  }
}
async function apiFetch(url, options = {}) {
  if (window.location.protocol === "file:") throw new Error("请通过 http://localhost:8000 打开班务通");
  const response = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
async function loadRemoteState() {
  const result = await apiFetch("/api/state");
  const remote = result.state && Object.keys(result.state).length ? result.state : null;
  state = { ...initial, ...(remote || {}), loggedIn: true, classroomHomeworkUnlocked: false, view: remote?.view === "login" ? "home" : (remote?.view || "setup") };
  keepRecentStudentCalls();
  if (!state.tasks?.length) state.tasks = DEFAULT_TASKS.map(task => ({ ...task, id: crypto.randomUUID() }));
}
async function bootstrap() {
  try {
    const auth = await apiFetch("/api/auth/me");
    serverReady = true;
    if (window.location.pathname === "/register") state = { ...initial, view: "register", tasks: DEFAULT_TASKS.map(task => ({ ...task, id: crypto.randomUUID() })) };
    else if (window.location.pathname === "/login") state = { ...initial, tasks: DEFAULT_TASKS.map(task => ({ ...task, id: crypto.randomUUID() })) };
    else if (auth.authenticated) await loadRemoteState();
    else state = { ...initial, tasks: DEFAULT_TASKS.map(task => ({ ...task, id: crypto.randomUUID() })) };
  } catch {
    serverReady = false;
    state.loggedIn = false;
    state.view = "login";
  }
  render();
}
function toast(message) {
  const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast = setTimeout(() => el.classList.remove("show"), 2200);
}
function esc(s="") { return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function localDateValue(date=new Date()) { const offset=date.getTimezoneOffset()*60000; return new Date(date.getTime()-offset).toISOString().slice(0,10); }
function assignmentDate(item) { return item.date || localDateValue(new Date(item.createdAt)); }
function assignmentWeekday(item) { const day=new Date(`${assignmentDate(item)}T12:00:00`).getDay(); return day>=1&&day<=5?DAYS[day-1]:null; }
function homeworkLeaveLinked(item,studentId) { return isLeaveOnDate(studentId,assignmentDate(item)); }
function homeworkStudentStatus(item,studentId) { return state.homeworkStatus?.[`${item.id}:${studentId}`]||'未交'; }
function statisticRange(period,anchorValue){
  const anchor=anchorValue||localDateValue();
  if(period==='term')return {start:null,end:null,label:'本学期'};
  if(period==='day')return {start:anchor,end:anchor,label:anchor};
  if(period==='month'){const [year,month]=anchor.split('-').map(Number);const end=localDateValue(new Date(year,month,0));return {start:`${year}-${String(month).padStart(2,'0')}-01`,end,label:`${year}年${month}月`};}
  const dates=weekDates(anchor);return {start:dates[0].date,end:dates[4].date,label:`${dates[0].date}至${dates[4].date}`};
}
function dateInStatisticRange(date,range){return (!range.start||date>=range.start)&&(!range.end||date<=range.end);}
function periodOptions(selected){return [['day','日'],['week','周'],['month','月'],['term','学期']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>按${label}统计</option>`).join('');}
function route(view) { state.view = view; state.picker = null; if(view==='homework'){state.homeworkDetailId=null;state.homeworkDate||=localDateValue();} persist(); render(); }
function currentClass() { return state.classInfo?.name || "尚未创建班级"; }
function maskedPhone() {
  const phone = String(state.accountPhone || "");
  return /^1\d{10}$/.test(phone) ? `${phone.slice(0,3)}****${phone.slice(-4)}` : "教师账号";
}
function teacherName() {
  const surname = String(state.profile?.surname || state.profile?.name || "").trim();
  if (!surname) return maskedPhone();
  if (surname.includes("****")) return surname;
  return surname.endsWith("老师") ? surname : `${surname}老师`;
}
function teacherAvatar() { return String(state.profile?.surname || state.profile?.name || "师").trim()[0] || "师"; }
function greeting() {
  return "您好";
}
function classCreationForm() {
  const c = state.classInfo || {};
  const primaryGrade = typeof c.grade === 'number' ? `${["一","二","三","四","五","六"][c.grade-1]||c.grade}年级` : String(c.grade||'三年级');
  return `<form id="class-form"><h1>创建班级</h1><p class="sub">当前账号同时只管理一个班级。</p><div class="grid two"><div class="field"><label>年级 *</label><input class="input" name="grade" value="${esc(primaryGrade)}" placeholder="例如：三年级、七年级或高一" required /></div><div class="field"><label>班号 *</label><input class="input" name="number" type="number" min="1" value="${esc(c.number||2)}" required /></div></div><div class="grid two"><div class="field"><label>学年 *</label><input class="input" name="year" value="${esc(c.year||'2026—2027')}" required /></div><div class="field"><label>学期 *</label><select class="select" name="term"><option ${c.term==='上学期'?'selected':''}>上学期</option><option ${c.term==='下学期'?'selected':''}>下学期</option></select></div></div><div class="form-actions" style="justify-content:space-between"><button type="button" class="btn" data-action="setup-back-login">返回登录</button><button class="btn primary">下一步：添加学生</button></div></form>`;
}
function getCell(schedule, taskId, day) { return schedule[`${taskId}:${day}`] || []; }
function setCell(taskId, day, ids) { state.draft[`${taskId}:${day}`] = ids; state.draftDirty = true; persist(); }
function weekdayLabel(dateValue) { const day=new Date(`${dateValue}T12:00:00`).getDay(); return day>=1&&day<=5?DAYS[day-1]:null; }
function isLeaveOnDate(studentId,dateValue) { const day=weekdayLabel(dateValue); return !!state.leaves[`${studentId}:${dateValue}`]||!!(day&&state.leaves[`${studentId}:${day}`]); }
function isLateOnDate(studentId,dateValue) { const day=weekdayLabel(dateValue); return !!state.lates?.[`${studentId}:${dateValue}`]||!!(day&&state.lates?.[`${studentId}:${day}`]); }
function weekDates(anchorValue) { const anchor=new Date(`${anchorValue}T12:00:00`);const monday=new Date(anchor);const day=anchor.getDay()||7;monday.setDate(anchor.getDate()-day+1);return DAYS.map((label,index)=>{const date=new Date(monday);date.setDate(monday.getDate()+index);return {label,date:localDateValue(date)};}); }
function hasUpcomingLeaveOnWeekday(studentId,day) { const today=localDateValue();return Object.keys(state.leaves||{}).some(key=>{const [id,value]=key.split(':');return id===studentId&&((value===day)||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>=today&&weekdayLabel(value)===day));}); }
function isLeave(studentId, day) { return hasUpcomingLeaveOnWeekday(studentId,day); }

function loginPage() {
  return `<div class="auth-page"><section class="auth-art"><div class="brand"><span class="brand-mark">班</span>班务通</div><div><h1>把班级日常，安排得清清楚楚。</h1><p>从学生名单到值日排班，一个账号连接教师办公室与教室大屏。</p></div><p>教师管理模式 · 教室展示模式</p></section><section class="auth-panel"><form class="form-card" id="login-form" autocomplete="off"><span class="eyebrow">欢迎回来</span><h1>登录教师账号</h1><p class="sub">登录后默认进入教师管理模式</p><div class="field"><label>手机号</label><input class="input" name="phone" inputmode="numeric" placeholder="请输入11位手机号" maxlength="11" autocomplete="off" required /></div><div class="field"><label for="login-password">密码</label><div class="password-field"><input class="input" id="login-password" name="password" type="password" placeholder="请输入登录密码" autocomplete="new-password" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="login-password" aria-pressed="false">显示</button></div></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn small soft" data-action="forgot">忘记密码</button></div><button class="btn primary" style="width:100%;margin-top:22px">登录</button><p class="sub" style="text-align:center;margin-top:18px">还没有账号？ <a class="btn small" href="/register" data-action="register">立即注册</a></p></form></section></div>`;
}
function registerPage() {
  return `<div class="auth-page"><section class="auth-art"><div class="brand"><span class="brand-mark">班</span>班务通</div><div><h1>创建教师账号，开始管理班级。</h1><p>登录密码同时用于从教室展示模式返回教师管理模式，请妥善保管。</p></div><p>一个账号 · 一个班级 · 两种使用模式</p></section><section class="auth-panel"><form class="form-card" id="register-form"><span class="eyebrow">新用户注册</span><h1>创建教师账号</h1><p class="sub">注册成功后，请返回登录页使用新账号登录。</p><div class="field"><label>手机号 *</label><input class="input" name="phone" inputmode="numeric" maxlength="11" placeholder="请输入11位手机号" required /></div><div class="field"><label for="register-password">登录密码 *</label><div class="password-field"><input class="input" id="register-password" name="password" type="password" minlength="6" placeholder="至少6位" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="register-password" aria-pressed="false">显示</button></div></div><div class="field"><label for="register-password2">确认密码 *</label><div class="password-field"><input class="input" id="register-password2" name="password2" type="password" minlength="6" placeholder="再次输入登录密码" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="register-password2" aria-pressed="false">显示</button></div></div><div class="form-actions" style="justify-content:space-between"><button type="button" class="btn" data-action="register-back-login">返回登录</button><button class="btn primary">注册账号</button></div></form></section></div>`;
}
function setupPage() {
  const step = state.setupStep;
  const steps = ["创建班级","添加学生"];
  let body = "";
  if (step === 1) body = classCreationForm();
  if (step === 2) body = `<div><h1>添加学生</h1><p class="sub">支持手动添加或从 Excel 批量导入，表头使用“姓名、学号、性别”。</p><div class="import-bar"><input type="file" id="excel-import" accept=".xlsx,.xls,.csv" hidden /><button class="btn soft" data-action="import-excel">导入 Excel</button><button class="btn small" data-action="download-template">下载导入模板</button></div><form class="row" id="quick-student" style="margin-top:20px"><input class="input" name="name" placeholder="学生姓名" required /><input class="input" name="number" placeholder="学号（选填）" /><select class="select" name="gender" style="max-width:110px"><option>男</option><option>女</option></select><button class="btn primary">添加</button></form>${studentList()}<div class="form-actions" style="justify-content:space-between"><button class="btn" data-action="setup-back-class">上一步：创建班级</button><button class="btn primary" data-action="finish-setup" ${state.students.length?'':'disabled'}>完成设置</button></div></div>`;
  return `<div class="setup-page"><div class="card setup-card"><div class="steps">${steps.map((x,i)=>`<div class="step ${i===step-1?'active':i<step-1?'done':''}">${i+1}. ${x}</div>`).join("")}</div>${body}</div></div>`;
}
function studentList() {
  if (!state.students.length) return `<div class="student-list empty">还没有学生，请先添加一名学生。</div>`;
  return `<div class="student-list">${state.students.map((s,i)=>`<div class="student-row"><strong>${esc(s.name)}</strong><span class="sub">${esc(s.number || `S${String(i+1).padStart(3,'0')}`)}</span><span>${esc(s.gender)}</span><button class="btn small" data-edit-student="${s.id}">编辑</button><button class="icon-btn" data-remove-student="${s.id}" aria-label="移除学生">×</button></div>`).join("")}</div>`;
}
function helpPopover(id,text) {
  return `<span class="popover-wrap ${state.popover===id?'open':''}"><button type="button" class="help-button" data-popover="${id}" aria-label="查看说明" aria-expanded="${state.popover===id}">?</button><span class="popover-card" role="tooltip">${esc(text)}</span></span>`;
}
function shell(content, active="home") {
  const name = teacherName();
  const core=[["rollcall","◉","随机点名","从当前班级名单随机抽取学生"],["announcements","✉","班级公告","发布和查看班级公告"],["duty","▦","值日管理","编辑、预览并发布每周值日安排"],["attendance","✓","考勤请假","登记学生请假与迟到情况"],["homework","▤","作业提交","登记本学科作业提交情况"]];
  const basics=[["students","☷","学生名单","添加、导入或修改学生信息"],["class","◇","班级设置","修改班级资料和账号相关设置"],["profile","♙","个人信息","填写教师姓氏和学校名称"]];
  const nav=(items)=>items.map(([v,ic,t,tip])=>`<button class="nav-btn ${active===v?'active':''}" data-route="${v}" data-tooltip="${tip}" aria-label="${t}：${tip}"><span>${ic}</span><span class="nav-text">${t}</span></button>`).join("");
  return `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">班</span>班务通</div><div class="top-actions"><span class="pill green">教师管理模式</span><button class="btn small" data-action="display">切换到教室展示模式</button><button class="user-chip" data-route="profile" aria-label="打开个人信息"><span class="avatar">${esc(teacherAvatar())}</span>${esc(name)}</button><button class="btn small" data-action="logout">退出登录</button></div></header><div class="layout"><aside class="sidebar"><div class="nav-label">主要功能</div>${nav([["home","⌂","管理首页","查看班级概览"]])}${nav(core)}<div class="nav-label nav-label-secondary">基础资料</div>${nav(basics)}</aside><main class="main">${content}</main></div>${modal()}</div>`;
}
function dashboard() {
  const leaveCount = Object.keys(state.leaves).length;
  return shell(`<div class="hero"><div><span class="eyebrow">${esc(state.profile?.school || "实验小学")}</span><h1>${greeting()}，${esc(state.profile?.name || "王老师")}</h1><p class="sub">当前班级：${esc(currentClass())} · ${esc(state.classInfo?.year || "")}${state.classInfo ? ` · ${esc(state.classInfo.term)}`:""}</p></div></div><div class="grid two"><button class="action-card" data-route="class"><div class="action-icon">◇</div><h3>班级设置</h3><p>查看或修改班级名称、年级、学年与学期。</p></button><button class="action-card" data-route="students"><div class="action-icon">☷</div><h3>学生名单管理</h3><p>当前 ${state.students.length} 名学生，可添加、编辑或移出。</p></button></div><div class="section-head core-section"><h2>核心功能</h2><span class="sub">五项班级管理功能</span></div><div class="grid five">${[["点名管理","◉","从当前班级名单随机抽取学生","rollcall"],["公告管理","✉","发布、修改并管理班级公告",""],["值日管理","▦","制作并发布周值日表","duty"],["考勤管理","✓","登记学生请假与迟到","attendance"],["作业管理","▤","登记本学科作业提交情况",""]].map(([t,ic,d,r])=>`<button class="action-card" ${r?`data-route="${r}"`:`data-action="coming"`}><div class="action-icon">${ic}</div><h3>${t}</h3><p>${d}</p></button>`).join("")}</div><div class="section-head"><h2>班级概览</h2></div><div class="grid four"><div class="card stat"><div class="label">班级人数</div><div class="value">${state.students.length}</div></div><div class="card stat"><div class="label">值日任务</div><div class="value">${state.tasks.length}</div></div><div class="card stat"><div class="label">请假记录</div><div class="value">${leaveCount}</div></div><div class="card stat"><div class="label">排班状态</div><div class="value" style="font-size:18px">${Object.keys(state.published).length?'已发布':'未发布'}</div></div></div>`, "home");
}
function rollCallPage() {
  return shell(`<div class="hero"><div><span class="eyebrow">课堂互动</span><h1>课堂随机点名</h1><p class="sub">名单来自当前班级，每次从完整名单中随机抽取，允许重复点名。</p></div><span class="pill green">${state.students.length} 名学生</span></div><section class="rollcall-layout"><article class="rollcall-stage"><div class="rollcall-head"><span class="rollcall-pill">${esc(currentClass())}</span><span class="rollcall-pill">允许重复抽取</span></div><div class="rollcall-screen" aria-live="polite"><div><div class="rollcall-eyebrow" id="rollcall-eyebrow">准备好了吗？</div><div class="rollcall-name placeholder" id="rollcall-name">点击下方按钮开始点名</div><div class="rollcall-hint">每次都从当前班级完整名单中随机抽取</div></div></div><button class="rollcall-draw" id="rollcall-draw" data-action="draw-rollcall" ${state.students.length?'':'disabled'}>开始点名</button></article><aside class="rollcall-side"><div class="card pad"><h2>当前班级</h2><div class="rollcall-count"><strong>${state.students.length}</strong><span>名学生</span></div></div><div class="card pad"><h2>使用提示</h2><ol class="rollcall-guide"><li>确认当前班级名单</li><li>点击“开始点名”</li><li>再次点击可继续抽取</li></ol></div></aside></section>`, "rollcall");
}
function displayRollCallPage() {
  return `<div class="display-page"><div class="display-rollcall-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())} · 课堂随机点名</div><div style="opacity:.8;margin-top:4px">教室展示模式 · 允许重复抽取</div></div><button class="btn" data-action="back-display">返回首页</button></div><div class="display-rollcall-body"><article class="rollcall-stage"><div class="rollcall-head"><span class="rollcall-pill">允许重复抽取</span><span class="rollcall-pill">${state.students.length} 名学生</span></div><div class="rollcall-screen" aria-live="polite"><div><div class="rollcall-eyebrow" id="rollcall-eyebrow">准备好了吗？</div><div class="rollcall-name placeholder" id="rollcall-name">点击下方按钮开始点名</div><div class="rollcall-hint">每次都从当前班级完整名单中随机抽取</div></div></div><button class="rollcall-draw" id="rollcall-draw" data-action="draw-rollcall" ${state.students.length?'':'disabled'}>开始点名</button></article><aside class="rollcall-side"><div class="card pad"><h2>当前班级</h2><div class="rollcall-count"><strong>${state.students.length}</strong><span>名学生</span></div></div><div class="card pad"><h2>课堂操作</h2><ol class="rollcall-guide"><li>点击“开始点名”</li><li>姓名停止滚动后公布结果</li><li>点击“再点一名”继续抽取</li></ol></div></aside></div></div>${modal()}</div>`;
}
function missingCount() { let n=0; state.tasks.forEach(t=>DAYS.forEach(d=>{ if(getCell(state.draft,t.id,d).length<t.count)n++; })); return n; }
function dutyPage() {
  return shell(`<div class="hero"><div><span class="eyebrow">值日管理</span><h1>固定周值日表</h1><p class="sub">本安排按周一至周五长期使用，可随时修改并重新发布。</p></div><span class="pill ${state.draftDirty?'orange':'green'}">${state.draftDirty?'有未保存修改':'内容已保存'}</span></div><div class="card"><div class="toolbar"><button class="btn soft" data-action="manual">手动排班</button><button class="btn" data-action="random">一键随机排班</button>${helpPopover('random-rule','随机排班会避开请假学生，并尽量避免同一学生在同一天承担多个任务；生成后仍可手动调整。')}<button class="btn" data-action="add-task">＋ 添加值日任务</button><div class="toolbar-spacer"></div><button class="btn" data-action="export-xls">导出 Excel</button><button class="btn" data-action="export-pdf">导出 PDF</button></div><div class="table-wrap" style="border:0;border-radius:0"><table><thead><tr><th>任务 / 人数</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>${state.tasks.map(t=>`<tr><td class="task-cell"><div class="task-name">${esc(t.name)}</div><div class="task-meta">每天 ${t.count} 人 · <button class="btn small" data-edit-task="${t.id}">编辑</button></div></td>${DAYS.map(day=>pickerCell(t,day)).join("")}</tr>`).join("")}</tbody></table></div><div class="toolbar"><span class="notice">排班检查：${missingCount()} 处人数不足；请假学生会被自动标记。</span>${helpPopover('check-rule','人数不足表示某个任务未达到设定人数；人员冲突表示同一学生在同一天承担了多个任务。')}<div class="toolbar-spacer"></div><button class="btn" data-action="save-draft">保存草稿</button><button class="btn soft" data-action="preview">预览展示效果</button><button class="btn primary" data-action="publish">保存并发布</button></div></div>`, "duty");
}
function pickerCell(task, day) {
  const ids=getCell(state.draft,task.id,day); const names=ids.map(id=>state.students.find(s=>s.id===id)).filter(Boolean);
  const open=state.picker?.taskId===task.id&&state.picker?.day===day;
  return `<td><div class="student-picker"><button class="${names.length?'filled':''}" data-picker="${task.id}|${day}">${names.length?names.map(s=>`<span class="${isLeave(s.id,day)?'leave-name':''}">${esc(s.name)}</span>`).join('、'):'+ 选择学生'} (${names.length}/${task.count})</button>${open?pickerPop(task,day,ids):''}</div></td>`;
}
function pickerPop(task,day,ids) {
  return `<div class="picker-pop">${state.students.map(s=>`<label class="${isLeave(s.id,day)?'leave':''}"><input type="checkbox" data-pick-student="${s.id}" ${ids.includes(s.id)?'checked':''}/> ${esc(s.name)} ${isLeave(s.id,day)?'（未来请假）':''}</label>`).join("")}<div class="picker-foot"><span class="sub">已选 ${ids.length}/${task.count}</span><button class="btn small primary" data-action="close-picker">完成</button></div></div>`;
}
function announcementsPage() {
  const items=[...(state.announcements||[])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const calls=[...(state.studentCalls||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,2);
  const now=Date.now();const current=items.filter(x=>!x.endAt||new Date(x.endAt).getTime()>now);const history=items.filter(x=>x.endAt&&new Date(x.endAt).getTime()<=now);
  const list=(records,empty)=>records.length?records.map(item=>`<article class="card notice-item"><div><p>${esc(item.content)}</p><small>${esc(item.author)} · 发布于 ${new Date(item.createdAt).toLocaleString('zh-CN')}${item.endAt?` · 结束于 ${new Date(item.endAt).toLocaleString('zh-CN')}`:' · 长期有效'}</small></div><div class="row"><button class="btn small" data-edit-announcement="${item.id}">修改</button><button class="btn small danger" data-delete-announcement="${item.id}">删除</button></div></article>`).join(''):`<div class="card empty">${empty}</div>`;
  return shell(`<div class="hero"><div><span class="eyebrow">班级信息</span><h1>班级公告</h1><p class="sub">发布公告或呼叫学生，内容会同步到教室展示模式。</p></div><div class="row"><button class="btn soft" data-action="call-student">呼叫学生</button><button class="btn primary" data-action="add-announcement">＋ 发布公告</button></div></div><div class="section-head"><h2>学生呼叫</h2><span class="sub">最近 ${calls.length} 条</span></div><div class="student-call-list">${calls.length?calls.map(call=>`<article class="card student-call-item"><div><span class="student-call-name">${esc(call.studentName)}</span><p>${esc(call.message)}</p><small>${esc(call.author)} · ${new Date(call.createdAt).toLocaleString('zh-CN')}</small></div><span class="pill ${state.studentCallReceipts?.[call.id]?'green':'orange'}">${state.studentCallReceipts?.[call.id]?'已知晓':'等待回应'}</span></article>`).join(''):'<div class="card empty">还没有呼叫记录。</div>'}</div><div class="section-head"><h2>当前公告</h2><span class="sub">${current.length} 条有效公告</span></div><div class="notice-list">${list(current,'当前没有有效公告。')}</div><div class="section-head"><h2>历史记录</h2><span class="sub">已结束公告</span></div><div class="notice-list">${list(history,'还没有历史公告。')}</div>`,"announcements");
}
function homeworkPage() {
  const assignments=state.assignments||[];
  const current=assignments.find(a=>a.id===state.homeworkDetailId);
  if(!current){
    const selectedDate=state.homeworkDate||localDateValue();
    const daily=assignments.filter(item=>assignmentDate(item)===selectedDate).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const incomplete=assignments.map(item=>({item,missing:state.students.filter(student=>homeworkStudentStatus(item,student.id)==='未交')})).filter(entry=>entry.missing.length).sort((a,b)=>assignmentDate(b.item).localeCompare(assignmentDate(a.item))||String(b.item.createdAt).localeCompare(String(a.item.createdAt)));
    const statsPeriod=state.homeworkStatsPeriod||'day';
    return shell(`<div class="hero"><div><span class="eyebrow">作业管理</span><h1>每日作业</h1><p class="sub">按日期查看和添加作业，点击作业后登记学生提交情况。</p></div><div class="row stats-actions"><button class="btn" data-action="homework-classroom-settings">教室登记设置</button><select class="select compact-select" id="homework-stats-period" aria-label="作业统计周期">${periodOptions(statsPeriod)}</select><button class="btn" data-action="export-daily-homework">导出未交统计</button><button class="btn primary" data-action="add-assignment">＋ 新建作业</button></div></div><section class="homework-overview"><div class="section-head"><div><h2>未收齐作业总览</h2><p class="sub">仅显示仍有学生未交的作业</p></div><span class="pill ${incomplete.length?'orange':'green'}">${incomplete.length} 项未收齐</span></div>${incomplete.length?`<div class="homework-overview-grid">${incomplete.map(({item,missing})=>`<button class="card homework-overview-item" data-homework-detail="${item.id}"><div class="homework-overview-top"><span class="eyebrow">${esc(item.subject)}</span><span class="pill orange">未交 ${missing.length}</span></div><h3>${esc(item.title)}</h3><p>${esc(assignmentDate(item))}</p><div class="homework-missing-preview">${missing.slice(0,4).map(student=>`<span>${esc(student.name)}</span>`).join('')}${missing.length>4?`<small>等 ${missing.length} 人</small>`:''}</div></button>`).join('')}</div>`:'<div class="card all-homework-complete">当前所有作业均已收齐</div>'}</section><div class="card pad"><div class="homework-date-bar"><label for="homework-date">作业日期</label><input class="input" id="homework-date" type="date" value="${esc(selectedDate)}" /></div><div class="homework-classroom-summary"><span class="pill ${state.homeworkClassroomEnabled?'green':''}">${state.homeworkClassroomEnabled?'教室登记已开启':'教室登记未开启'}</span><span class="sub">开启后，班主任或课代表可凭专用 PIN 在教室展示页登记提交状态。</span></div><div class="homework-list">${daily.length?daily.map(item=>`<button class="homework-item" data-homework-detail="${item.id}"><span><strong>${esc(item.subject)}</strong><b>${esc(item.title)}</b></span><span class="sub">查看提交情况 →</span></button>`).join(''):`<div class="empty">${selectedDate===localDateValue()?'今天':'该日期'}还没有作业，点击“新建作业”进行添加。</div>`}</div></div>`,"homework");
  }
  const counts={已交:0,未交:0};
  state.students.forEach(s=>counts[homeworkStudentStatus(current,s.id)]++);
  return shell(`<div class="hero"><div><span class="eyebrow">${esc(current.subject)} · ${esc(assignmentDate(current))}</span><h1>${esc(current.title)}</h1><p class="sub">作业按实际提交情况登记；未交学生如当天请假，会显示备注。</p></div><div class="row"><button class="btn" data-action="back-homework-list">返回作业列表</button><button class="btn" data-action="export-homework">导出未交名单</button><button class="btn danger" data-delete-assignment="${current.id}">删除作业</button></div></div><div class="card pad"><div class="toolbar"><strong>提交情况</strong><button class="btn small soft" data-homework-bulk="${current.id}|已交">一键全部已提交</button><button class="btn small soft" data-homework-bulk="${current.id}|未交">一键全部未提交</button><div class="toolbar-spacer"></div><span class="pill green">已交 ${counts.已交}</span><span class="pill orange">未交 ${counts.未交}</span></div><div class="table-wrap"><table><thead><tr><th>学生</th><th>学号</th><th>提交状态</th><th>备注</th></tr></thead><tbody>${state.students.map(s=>{const status=homeworkStudentStatus(current,s.id);const note=status==='未交'&&homeworkLeaveLinked(current,s.id)?'请假':'—';return `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.number||'—')}</td><td><div class="status-switch">${['已交','未交'].map(x=>`<button class="btn small ${status===x?'primary':''}" data-homework-status="${current.id}|${s.id}|${x}">${x}</button>`).join('')}</div></td><td>${note==='请假'?'<span class="pill red">请假</span>':'—'}</td></tr>`}).join('')}</tbody></table></div></div>`,"homework");
}
function attendancePage() {
  const focus=state.attendanceFocusDate||localDateValue();const dates=weekDates(focus);
  const statsPeriod=state.attendanceStatsPeriod||'week';
  return shell(`<div class="hero"><div><span class="eyebrow">考勤管理</span><h1>学生考勤登记</h1><p class="sub">按具体日期记录；今天请假不参与点名，未来请假只在值日表中变灰提醒。</p></div><div class="row stats-actions"><label class="date-filter">选择日期 <input class="input" id="attendance-date" type="date" value="${esc(focus)}" /></label><select class="select compact-select" id="attendance-stats-period" aria-label="考勤统计周期">${periodOptions(statsPeriod)}</select><button class="btn" data-action="export-attendance">导出异常统计</button></div></div><div class="card pad"><div class="attendance-legend"><span class="pill">正常</span><span class="pill red">已请假</span><span class="pill orange">已迟到</span></div><div class="table-wrap"><table style="min-width:1100px"><thead><tr><th>学生</th>${dates.map(item=>`<th>${item.label}<small>${item.date.slice(5).replace('-','/')}</small></th>`).join("")}</tr></thead><tbody>${state.students.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td>${dates.map(item=>`<td><div class="attendance-options"><button type="button" class="attendance-toggle ${isLeaveOnDate(s.id,item.date)?'selected leave':''}" data-attendance="leave|${s.id}|${item.date}" aria-pressed="${isLeaveOnDate(s.id,item.date)}"><span class="attendance-check">${isLeaveOnDate(s.id,item.date)?'✓':''}</span><span>请假</span></button><button type="button" class="attendance-toggle ${isLateOnDate(s.id,item.date)?'selected late':''}" data-attendance="late|${s.id}|${item.date}" aria-pressed="${isLateOnDate(s.id,item.date)}"><span class="attendance-check">${isLateOnDate(s.id,item.date)?'✓':''}</span><span>迟到</span></button></div></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`,"attendance");
}
function studentsPage() {
  return shell(`<div class="hero"><div><span class="eyebrow">基础资料</span><h1>学生名单管理</h1><p class="sub">当前共 ${state.students.length} 名学生。</p></div><div class="row"><input type="file" id="excel-import" accept=".xlsx,.xls,.csv" hidden /><button class="btn" data-action="download-template">下载模板</button><button class="btn soft" data-action="import-excel">导入 Excel</button>${helpPopover('excel-rule','Excel 第一行应包含“姓名、学号、性别”。姓名为必填；导入时会自动跳过同名学生。')}<button class="btn primary" data-action="add-student">＋ 添加学生</button></div></div><div class="card pad">${studentList()}</div>`,"students");
}
function classPage() {
  const c=state.classInfo||{};
  return shell(`<div class="hero"><div><span class="eyebrow">基础资料</span><h1>班级设置</h1><p class="sub">修改当前班级资料，或删除后重新创建班级。</p></div></div><div class="card pad"><form id="edit-class"><div class="grid two"><div class="field"><label>班级名称</label><input class="input" name="name" value="${esc(c.name||'')}" required /></div><div class="field"><label>学年</label><input class="input" name="year" value="${esc(c.year||'')}" required /></div><div class="field"><label>学期</label><select class="select" name="term"><option ${c.term==='上学期'?'selected':''}>上学期</option><option ${c.term==='下学期'?'selected':''}>下学期</option></select></div></div><div class="form-actions" style="justify-content:space-between"><button type="button" class="btn danger" data-action="delete-class">删除当前班级</button><button class="btn primary">保存修改</button></div></form></div><section class="danger-zone"><div><h2>危险操作</h2><p class="sub">注销账号后，教师账号、班级资料、学生名单和历史记录将被删除，且无法恢复。</p></div><button class="btn danger" data-action="open-delete-account">注销账号</button></section>`,"class");
}
function profilePage() {
  const surname = String(state.profile?.surname || "").trim();
  const school = String(state.profile?.school || "").trim();
  return shell(`<div class="hero"><div><span class="eyebrow">账号资料</span><h1>个人信息</h1><p class="sub">填写后将在管理首页、顶部账号区域和侧边栏显示。</p></div></div><div class="card pad"><form id="profile-info-form"><div class="grid two"><div class="field"><label>教师姓氏</label><input class="input" name="surname" maxlength="8" value="${esc(surname)}" placeholder="例如：王" /></div><div class="field"><label>学校名称</label><input class="input" name="school" maxlength="40" value="${esc(school)}" placeholder="例如：实验小学" /></div></div><p class="sub">教师姓氏填写“王”后，系统将显示为“王老师”。未填写时显示脱敏手机号，学校名称不显示。</p><div class="form-actions"><button class="btn primary">保存个人信息</button></div></form></div><section class="danger-zone profile-danger"><div><h2>危险操作</h2><p class="sub">注销后，教师账号、班级资料、学生名单和历史记录将被删除，且无法恢复。</p></div><button class="btn danger" data-action="open-delete-account">注销账号</button></section>`,"profile");
}
function displayPage() {
  return `<div class="display-page"><div class="display-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())}</div><div style="opacity:.8;margin-top:4px">教室展示模式</div></div><button class="btn" data-action="back-manage">返回教师管理模式</button></div><div class="display-home"><div class="display-welcome"><span class="eyebrow">班务通 · 课堂功能</span><h1>选择要使用的功能</h1><p class="sub">学生可在教室大屏查看课堂信息；管理设置仍受登录密码保护。</p></div><div class="display-entry-grid"><button class="display-entry rollcall-entry" data-action="display-rollcall"><span class="display-entry-icon">◉</span><span><strong>课堂随机点名</strong><small>从当前班级名单中随机抽取学生</small></span><b>进入 →</b></button><button class="display-entry duty-entry" data-action="display-duty"><span class="display-entry-icon">▦</span><span><strong>本周值日表</strong><small>查看教师已发布的固定周值日安排</small></span><b>进入 →</b></button><button class="display-entry" data-action="display-announcements"><span class="display-entry-icon">✉</span><span><strong>班级公告</strong><small>查看教师发布的最新公告</small></span><b>进入 →</b></button><button class="display-entry" data-action="display-homework"><span class="display-entry-icon">▤</span><span><strong>作业提交</strong><small>查看当前作业与提交情况</small></span><b>进入 →</b></button></div></div></div>${modal()}</div>`;
}
function displayAnnouncementsPage(){const now=Date.now();const items=[...(state.announcements||[])].filter(x=>!x.endAt||new Date(x.endAt).getTime()>now).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return `<div class="display-page"><div class="display-shell"><div class="display-head"><div class="display-title">${esc(currentClass())} · 班级公告</div><button class="btn" data-action="back-display">返回首页</button></div><div class="display-home"><div class="notice-list">${items.length?items.map(x=>`<article class="card notice-item"><div><p>${esc(x.content)}</p><small>${esc(x.author)} · ${new Date(x.createdAt).toLocaleString('zh-CN')}</small></div></article>`).join(''):`<div class="card empty">暂无公告</div>`}</div></div></div>${modal()}</div>`;}
function displayHomeworkPage(){
  const today=localDateValue();const assignments=(state.assignments||[]).filter(item=>assignmentDate(item)===today).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));const unlocked=state.homeworkClassroomEnabled&&state.classroomHomeworkUnlocked;
  return `<div class="display-page"><div class="display-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())} · 作业提交</div><div style="opacity:.8;margin-top:4px">${today} · ${unlocked?'提交状态登记中':'仅显示未交学生'}</div></div><div class="row">${state.homeworkClassroomEnabled?`<button class="btn ${unlocked?'soft':''}" data-action="${unlocked?'lock-classroom-homework':'unlock-classroom-homework'}">${unlocked?'锁定登记':'登记提交状态'}</button>`:''}<button class="btn" data-action="back-display">返回首页</button></div></div><div class="display-home">${assignments.length?`<div class="display-homework-grid">${assignments.map(item=>{const missing=state.students.filter(student=>homeworkStudentStatus(item,student.id)==='未交');return `<section class="card display-homework-card"><div class="display-homework-title"><span class="eyebrow">${esc(item.subject)}</span><h2>${esc(item.title)}</h2><div class="display-homework-counts"><span class="pill orange">未交 ${missing.length}</span></div></div>${unlocked?`<div class="classroom-homework-bulk"><strong>批量登记</strong><div class="row"><button class="btn small soft" data-classroom-homework-bulk="${item.id}|已交">一键全部已交</button><button class="btn small" data-classroom-homework-bulk="${item.id}|未交">一键全部未交</button></div></div><div class="classroom-homework-editor">${state.students.map(student=>{const status=homeworkStudentStatus(item,student.id);return `<div class="classroom-homework-row"><span><strong>${esc(student.name)}</strong>${status==='未交'&&homeworkLeaveLinked(item,student.id)?'<small>请假</small>':''}</span><div class="status-switch">${['已交','未交'].map(value=>`<button class="btn small ${status===value?'primary':''}" data-classroom-homework-status="${item.id}|${student.id}|${value}">${value}</button>`).join('')}</div></div>`}).join('')}</div>`:(missing.length?`<div class="student-status-group"><strong>未交</strong><div class="missing-students">${missing.map(student=>`<span>${esc(student.name)}${homeworkLeaveLinked(item,student.id)?'（请假）':''}</span>`).join('')}</div></div>`:`<div class="all-submitted">无人未交</div>`)}</section>`}).join('')}</div>`:`<div class="card empty">今天暂无作业</div>`}</div></div>${modal()}</div>`;
}
function displayDutyPage() {
  const schedule=Object.keys(state.published).length?state.published:state.draft;
  return `<div class="display-page"><div class="display-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())} · 每周值日表</div><div style="opacity:.8;margin-top:4px">固定周安排 · 教室展示模式</div></div><button class="btn" data-action="back-display">返回首页</button></div><div class="table-wrap display-table" style="border:0;border-radius:0"><table><thead><tr><th>值日任务</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>${state.tasks.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="sub">${t.count} 人</div></td>${DAYS.map(d=>`<td>${getCell(schedule,t.id,d).map(id=>{const s=state.students.find(x=>x.id===id);return s?`<span class="${isLeave(id,d)?'leave-name display-leave-name':''}">${esc(s.name)}</span>`:''}).filter(Boolean).join('、')||'<span class="sub">待安排</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="toolbar"><span class="sub">灰色背景姓名表示该学生请假，请教师及时调整。</span><div class="toolbar-spacer"></div><span class="pill green">教师已发布</span></div></div>${modal()}</div>`;
}
function modal() {
  if (!state.modal) return "";
  if (state.modal.type==='task') { const t=state.tasks.find(x=>x.id===state.modal.id); return `<div class="modal-backdrop"><form class="modal" id="task-form"><div class="modal-head"><h2>${t?'编辑':'新增'}值日任务</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>任务名称 *</label><input class="input" name="name" maxlength="15" value="${esc(t?.name||'')}" required /></div><div class="field"><label>每天需要人数 *</label><input class="input" name="count" type="number" min="1" max="8" value="${t?.count||2}" required /></div><div class="form-actions" style="justify-content:${t?'space-between':'flex-end'}">${t?`<button type="button" class="btn danger" data-delete-task="${t.id}">删除任务</button>`:''}<div class="row"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">保存任务</button></div></div></form></div>`; }
  if (state.modal.type==='student') { const s=state.students.find(x=>x.id===state.modal.id); return `<div class="modal-backdrop"><form class="modal" id="student-form"><div class="modal-head"><h2>${s?'修改':'添加'}学生信息</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>学生姓名 *</label><input class="input" name="name" value="${esc(s?.name||'')}" required /></div><div class="field"><label>学号</label><input class="input" name="number" value="${esc(s?.number||'')}" /></div><div class="field"><label>性别</label><select class="select" name="gender"><option ${s?.gender==='男'?'selected':''}>男</option><option ${s?.gender==='女'?'selected':''}>女</option><option ${s?.gender==='未填写'?'selected':''}>未填写</option></select></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">${s?'保存修改':'添加'}</button></div></form></div>`; }
  if (state.modal.type==='announcement') {const item=(state.announcements||[]).find(x=>x.id===state.modal.id);const endValue=item?.endAt?new Date(new Date(item.endAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';return `<div class="modal-backdrop"><form class="modal" id="announcement-form"><div class="modal-head"><h2>${item?'修改':'发布'}班级公告</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>公告内容 *</label><textarea class="input" name="content" rows="6" maxlength="500" placeholder="请输入公告内容" required>${esc(item?.content||'')}</textarea></div><div class="field"><label>结束时间</label><input class="input" type="datetime-local" name="endAt" value="${endValue}" /><p class="sub">不填写表示长期有效；到期后自动进入历史记录。</p></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">${item?'保存修改':'发布公告'}</button></div></form></div>`;}
  if (state.modal.type==='call-student') return `<div class="modal-backdrop"><form class="modal" id="call-student-form"><div class="modal-head"><div><span class="eyebrow">教室呼叫</span><h2>呼叫学生</h2></div><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>选择学生 *</label><select class="select" name="studentId" required><option value="">请选择学生</option>${state.students.map(student=>`<option value="${student.id}">${esc(student.name)}${student.number?`（${esc(student.number)}）`:''}</option>`).join('')}</select></div><div class="field"><label>快捷呼叫内容</label><select class="select" name="presetMessage"><option>请到讲台</option><option>请到教师办公室</option></select></div><div class="field"><label>自定义内容</label><input class="input" name="customMessage" maxlength="50" placeholder="选填，例如：请携带作业本到讲台" /><p class="sub">填写后将优先使用自定义内容。</p></div><p class="sub">发布后，教室展示模式会以醒目弹窗显示该学生姓名。</p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">立即呼叫</button></div></form></div>`;
  if (state.modal.type==='announcement-popup') {const item=(state.announcements||[]).find(x=>x.id===state.modal.id);if(!item)return '';return `<div class="modal-backdrop"><section class="modal announcement-popup"><div class="modal-head"><div><span class="eyebrow">班级公告</span><h2>请查看最新公告</h2></div></div><p>${esc(item.content)}</p><small>${esc(item.author)} · ${new Date(item.createdAt).toLocaleString('zh-CN')}</small><div class="form-actions"><button class="btn primary" data-receive-announcement="${item.id}">已收到</button></div></section></div>`;}
  if (state.modal.type==='student-call-popup') {const call=(state.studentCalls||[]).find(item=>item.id===state.modal.id);if(!call)return '';return `<div class="modal-backdrop student-call-backdrop"><section class="modal student-call-popup"><span class="eyebrow">老师正在呼叫</span><div class="student-call-avatar">${esc(call.studentName.slice(0,1))}</div><h2>${esc(call.studentName)}同学</h2><p>${esc(call.message)}</p><small>${esc(call.author)} · ${new Date(call.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small><div class="form-actions"><button class="btn primary" data-receive-student-call="${call.id}">已知晓</button></div></section></div>`;}
  if (state.modal.type==='assignment') return `<div class="modal-backdrop"><form class="modal" id="assignment-form"><div class="modal-head"><h2>新建作业</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="grid two"><div class="field"><label>所教学科 *</label><input class="input" name="subject" placeholder="例如：语文" required /></div><div class="field"><label>作业日期 *</label><input class="input" type="date" name="date" value="${esc(state.homeworkDate||localDateValue())}" required /></div></div><div class="field"><label>作业内容 *</label><textarea class="input" name="title" rows="4" maxlength="300" required></textarea></div><p class="sub">保存后，作业日期和提交情况会同步到教室展示模式。</p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">创建作业</button></div></form></div>`;
  if (state.modal.type==='homework-classroom-settings') return `<div class="modal-backdrop"><form class="modal" id="homework-classroom-settings-form"><div class="modal-head"><div><span class="eyebrow">教室展示权限</span><h2>教室作业登记设置</h2></div><button type="button" class="icon-btn" data-action="close-modal">×</button></div><label class="setting-toggle"><input type="checkbox" name="enabled" ${state.homeworkClassroomEnabled?'checked':''}/><span><strong>允许在教室展示页登记作业</strong><small>开启后，班主任或课代表输入专用 PIN 即可修改提交状态。</small></span></label><div class="field"><label for="classroom-homework-pin">专用 PIN</label><div class="password-field"><input class="input" id="classroom-homework-pin" type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" value="${esc(state.homeworkClassroomPin||'')}" placeholder="请输入4—8位数字" /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="classroom-homework-pin" aria-pressed="false">显示</button></div></div><p class="sub">此 PIN 仅用于教室作业登记，不是教师账号登录密码。建议定期更换。</p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">保存设置</button></div></form></div>`;
  if (state.modal.type==='classroom-homework-pin') return `<div class="modal-backdrop"><form class="modal classroom-pin-modal" id="classroom-homework-pin-form"><div class="modal-head"><div><span class="eyebrow">身份确认</span><h2>输入作业登记 PIN</h2></div><button type="button" class="icon-btn" data-action="close-modal">×</button></div><p class="sub">仅限班主任或课代表使用。验证成功后可修改本页作业提交状态。</p><div class="field"><label for="classroom-pin-entry">专用 PIN</label><div class="password-field"><input class="input pin-input" id="classroom-pin-entry" type="password" name="pin" inputmode="numeric" maxlength="8" autocomplete="off" required autofocus /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="classroom-pin-entry" aria-pressed="false">显示</button></div></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">确认并开始登记</button></div></form></div>`;
  if (state.modal.type==='attendance-record') return `<div class="modal-backdrop"><form class="modal" id="attendance-record-form"><div class="modal-head"><h2>新增考勤记录</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="grid two"><div class="field"><label>学生 *</label><select class="select" name="studentId">${state.students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>状态 *</label><select class="select" name="kind"><option>正常</option><option>事假</option><option>病假</option><option>离校</option></select></div><div class="field"><label>日期 *</label><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required /></div><div class="field"><label>对应星期 *</label><select class="select" name="day">${DAYS.map(d=>`<option>${d}</option>`).join('')}</select></div><div class="field"><label>具体时间段</label><input class="input" name="period" placeholder="例如：第1—2节或全天" /></div><div class="field"><label>请假天数</label><input class="input" type="number" name="days" min="0" step="0.5" value="0" /></div></div><div class="field"><label>备注</label><input class="input" name="note" placeholder="选填" /></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">保存记录</button></div></form></div>`;
  if (state.modal.type==='pin') return `<div class="modal-backdrop"><form class="modal" id="pin-form"><div class="modal-head"><h2>返回教师管理模式</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><p class="sub">请输入教师账号的登录密码，防止学生进入管理功能。</p><div class="field"><label for="manage-pin">登录密码</label><div class="password-field"><input class="input" id="manage-pin" type="password" name="pin" required autofocus /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="manage-pin" aria-pressed="false">显示</button></div></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn small soft" data-action="forgot-pin">忘记登录密码？</button></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">确认返回</button></div></form></div>`;
  if (state.modal.type==='reset-pin') return `<div class="modal-backdrop"><form class="modal" id="reset-pin-form"><div class="modal-head"><h2>重设管理密码</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><p class="sub">验证账号绑定手机号后，即可设置新的管理密码。演示验证码为 <b>123456</b>。</p><div class="field"><label>绑定手机号 *</label><input class="input" name="phone" inputmode="numeric" maxlength="11" value="${esc(state.accountPhone || '')}" placeholder="请输入11位手机号" required /></div><div class="field"><label>短信验证码 *</label><div class="row"><input class="input" name="code" inputmode="numeric" maxlength="6" placeholder="请输入6位验证码" required /><button type="button" class="btn soft" data-action="send-pin-code">获取验证码</button></div></div><div class="grid two"><div class="field"><label for="reset-pin">新管理密码 *</label><div class="password-field"><input class="input" id="reset-pin" type="password" name="pin" minlength="6" placeholder="至少6位" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="reset-pin" aria-pressed="false">显示</button></div></div><div class="field"><label for="reset-pin2">确认新密码 *</label><div class="password-field"><input class="input" id="reset-pin2" type="password" name="pin2" minlength="6" placeholder="再次输入" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="reset-pin2" aria-pressed="false">显示</button></div></div></div><div class="form-actions"><button type="button" class="btn" data-action="back-pin">返回</button><button class="btn primary">确认重设</button></div></form></div>`;
  if (state.modal.type==='delete-account') return `<div class="modal-backdrop"><form class="modal" id="delete-account-form"><div class="modal-head"><h2>确认注销账号</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="delete-warning"><strong>此操作无法撤销</strong><p>账号、班级、学生、排班、考勤及其他历史记录都会被删除。</p></div><div class="field"><label>请输入“注销账号”进行确认</label><input class="input" name="confirmation" autocomplete="off" required /></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn danger">永久注销账号</button></div></form></div>`;
  if (state.modal.type==='duty-preview') return `<div class="modal-backdrop"><section class="modal preview-modal"><div class="modal-head"><div><span class="eyebrow">教室展示效果</span><h2>${esc(currentClass())} · 每周值日表</h2></div><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="table-wrap"><table><thead><tr><th>值日任务</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${state.tasks.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="sub">${t.count} 人</div></td>${DAYS.map(d=>`<td>${getCell(state.draft,t.id,d).map(id=>esc(state.students.find(s=>s.id===id)?.name||'')).filter(Boolean).join('、')||'<span class="sub">待安排</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="preview-foot"><span class="sub">此处仅预览当前草稿，不会切换模式，也不会自动发布。</span><button class="btn primary" data-action="close-modal">关闭预览</button></div></section></div>`;
  return "";
}
function render() {
  if (state.view==='register') app.innerHTML=registerPage();
  else if (!state.loggedIn || state.view==='login') app.innerHTML=loginPage();
  else if (!state.profile || !state.classInfo || !state.students.length || state.view==='setup') app.innerHTML=setupPage();
  else if (state.view==='home') app.innerHTML=dashboard();
  else if (state.view==='rollcall') app.innerHTML=rollCallPage();
  else if (state.view==='duty') app.innerHTML=dutyPage();
  else if (state.view==='attendance') app.innerHTML=attendancePage();
  else if (state.view==='announcements') app.innerHTML=announcementsPage();
  else if (state.view==='homework') app.innerHTML=homeworkPage();
  else if (state.view==='students') app.innerHTML=studentsPage();
  else if (state.view==='class') app.innerHTML=classPage();
  else if (state.view==='profile') app.innerHTML=profilePage();
  else if (state.view==='display') app.innerHTML=displayPage();
  else if (state.view==='display-duty') app.innerHTML=displayDutyPage();
  else if (state.view==='display-rollcall') app.innerHTML=displayRollCallPage();
  else if (state.view==='display-announcements') app.innerHTML=displayAnnouncementsPage();
  else if (state.view==='display-homework') app.innerHTML=displayHomeworkPage();
  else app.innerHTML=dashboard();
  app.querySelectorAll('.action-card').forEach(card=>{const title=card.querySelector('h3')?.textContent;const description=card.querySelector('p');if(title==='公告管理'&&description)description.textContent='发布并管理班级文本公告';if(title==='作业管理'&&description)description.textContent='登记本学科作业提交情况';});
}
document.addEventListener("click", async e => {
  const popoverButton=e.target.closest('[data-popover]');
  if(popoverButton){const id=popoverButton.dataset.popover;state.popover=state.popover===id?null:id;render();return;}
  const routeBtn=e.target.closest("[data-route]"); if(routeBtn){route(routeBtn.dataset.route);return;}
  const attendanceBtn=e.target.closest('[data-attendance]');
  if(attendanceBtn){
    const [type,id,day]=attendanceBtn.dataset.attendance.split('|');
    const store=type==='leave' ? state.leaves : (state.lates ||= {});
    const key=`${id}:${day}`;
    if(store[key]) delete store[key]; else store[key]=true;
    persist();render();return;
  }
  const action=e.target.closest("[data-action]")?.dataset.action;
  if(action==='toggle-password'){
    const button=e.target.closest('[data-action="toggle-password"]');
    const input=button ? document.getElementById(button.getAttribute('aria-controls')) : null;
    if(input&&button){const visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'显示':'隐藏';button.setAttribute('aria-pressed',String(!visible));}
    return;
  }
  if(action==='logout'){try{await apiFetch('/api/auth/logout',{method:'POST'});}catch{}state.loggedIn=false;state.view='login';localStorage.removeItem('qinghe-class-manager');window.history.replaceState({},'', '/login');render();return;}
  if(action==='setup-back-login'){try{await apiFetch('/api/auth/logout',{method:'POST'});}catch{}state.loggedIn=false;state.view='login';window.history.replaceState({},'', '/login');render();return;}
  if(action==='setup-back-class'){state.setupStep=1;persist();render();return;}
  if(action==='register'){
    e.preventDefault();state={...initial,view:'register',tasks:DEFAULT_TASKS.map(task=>({...task,id:crypto.randomUUID()}))};if(location.protocol==='http:'||location.protocol==='https:')window.history.pushState({},'', '/register');render();return;
  }
  if(action==='register-back-login'){state={...initial,view:'login',tasks:DEFAULT_TASKS.map(task=>({...task,id:crypto.randomUUID()}))};window.history.replaceState({},'', '/login');render();return;}
  if(action==='forgot') toast('演示版验证码：123456');
  if(action==='finish-setup'){state.view='home';persist();render();toast('首次设置完成');}
  if(action==='coming'){const title=e.target.closest('.action-card')?.querySelector('h3')?.textContent||'';if(title.includes('公告'))route('announcements');else if(title.includes('作业'))route('homework');else toast('该功能将在下一阶段开放');return;}
  if(action==='display' && confirm('即将进入教室展示模式。返回教师管理模式时，需要输入与教师账号相同的登录密码。是否继续？')){state.view='display';const pendingCall=[...(state.studentCalls||[])].filter(item=>!state.studentCallReceipts?.[item.id]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];const now=Date.now();const pendingAnnouncement=[...(state.announcements||[])].filter(item=>(!item.endAt||new Date(item.endAt).getTime()>now)&&!state.announcementReceipts?.[item.id]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];state.modal=pendingCall?{type:'student-call-popup',id:pendingCall.id}:(pendingAnnouncement?{type:'announcement-popup',id:pendingAnnouncement.id}:null);persist();render();}
  if(action==='display-rollcall'){state.view='display-rollcall';persist();render();}
  if(action==='display-duty'){state.view='display-duty';persist();render();}
  if(action==='display-announcements'){state.view='display-announcements';persist();render();}
  if(action==='display-homework'){state.view='display-homework';state.classroomHomeworkUnlocked=false;persist();render();}
  if(action==='back-display'){state.view='display';state.classroomHomeworkUnlocked=false;persist();render();}
  if(action==='draw-rollcall') startRollCall();
  if(action==='back-manage'){state.modal={type:'pin'};render();}
  if(action==='forgot-pin'){state.modal={type:'reset-pin'};render();}
  if(action==='back-pin'){state.modal={type:'pin'};render();}
  if(action==='send-pin-code') toast('验证码已发送，演示验证码：123456');
  if(action==='close-modal'){state.modal=null;render();}
  if(action==='add-task'){state.modal={type:'task'};render();}
  if(action==='add-student'){state.modal={type:'student'};render();}
  if(action==='add-announcement'){state.modal={type:'announcement'};render();}
  if(action==='call-student'){state.modal={type:'call-student'};render();}
  if(action==='add-assignment'){state.modal={type:'assignment'};render();}
  if(action==='homework-classroom-settings'){state.modal={type:'homework-classroom-settings'};render();}
  if(action==='unlock-classroom-homework'){state.modal={type:'classroom-homework-pin'};render();}
  if(action==='lock-classroom-homework'){state.classroomHomeworkUnlocked=false;render();toast('教室作业登记已锁定');return;}
  if(action==='back-homework-list'){state.homeworkDetailId=null;persist();render();return;}
  if(action==='add-attendance-record'){state.modal={type:'attendance-record'};render();}
  if(action==='export-attendance'){exportAttendance();return;}
  if(action==='export-daily-homework'){exportDailyHomework();return;}
  if(action==='export-homework'){exportHomework();return;}
  if(action==='import-excel'){document.querySelector('#excel-import')?.click();return;}
  if(action==='download-template'){downloadStudentTemplate();return;}
  if(action==='open-delete-account'){state.modal={type:'delete-account'};render();}
  if(action==='close-picker'){state.picker=null;render();}
  if(action==='random') randomSchedule();
  if(action==='save-draft'){state.draftDirty=false;persist();render();toast('草稿已保存');}
  if(action==='publish'){state.published=JSON.parse(JSON.stringify(state.draft));state.draftDirty=false;persist();render();toast('值日表已发布到教室展示模式');}
  if(action==='preview'){state.modal={type:'duty-preview'};render();}
  if(action==='export-xls') exportExcel();
  if(action==='export-pdf'){state.view='display';render();setTimeout(()=>window.print(),100);}
  if(action==='delete-class' && confirm('确定删除当前班级吗？学生、排班和考勤记录也会被清空。')){state.classInfo=null;state.students=[];state.draft={};state.published={};state.leaves={};state.lates={};state.setupStep=1;state.view='setup';persist();render();}
  const edit=e.target.closest('[data-edit-task]'); if(edit){state.modal={type:'task',id:edit.dataset.editTask};render();}
  const editStudent=e.target.closest('[data-edit-student]'); if(editStudent){state.modal={type:'student',id:editStudent.dataset.editStudent};render();return;}
  const del=e.target.closest('[data-delete-task]'); if(del&&confirm('删除后将同步移除该任务的全部排班，确定继续吗？')){const id=del.dataset.deleteTask;state.tasks=state.tasks.filter(t=>t.id!==id);Object.keys(state.draft).filter(k=>k.startsWith(id+':')).forEach(k=>delete state.draft[k]);state.modal=null;state.draftDirty=true;persist();render();}
  const remove=e.target.closest('[data-remove-student]'); if(remove&&confirm('确定将该学生移出当前班级吗？')){const id=remove.dataset.removeStudent;state.students=state.students.filter(s=>s.id!==id);Object.keys(state.draft).forEach(k=>state.draft[k]=state.draft[k].filter(x=>x!==id));persist();render();}
  const editAnnouncement=e.target.closest('[data-edit-announcement]');if(editAnnouncement){state.modal={type:'announcement',id:editAnnouncement.dataset.editAnnouncement};render();return;}
  const receiveAnnouncement=e.target.closest('[data-receive-announcement]');if(receiveAnnouncement){(state.announcementReceipts||={})[receiveAnnouncement.dataset.receiveAnnouncement]=true;state.modal=null;persist();render();return;}
  const receiveStudentCall=e.target.closest('[data-receive-student-call]');if(receiveStudentCall){(state.studentCallReceipts||={})[receiveStudentCall.dataset.receiveStudentCall]=true;state.modal=null;persist();render();return;}
  const delAnnouncement=e.target.closest('[data-delete-announcement]');if(delAnnouncement&&confirm('确定删除这条公告吗？')){const id=delAnnouncement.dataset.deleteAnnouncement;state.announcements=(state.announcements||[]).filter(x=>x.id!==id);if(state.announcementReceipts)delete state.announcementReceipts[id];persist();render();return;}
  const homeworkDetail=e.target.closest('[data-homework-detail]');if(homeworkDetail){state.homeworkDetailId=homeworkDetail.dataset.homeworkDetail;persist();render();return;}
  const deleteAssignment=e.target.closest('[data-delete-assignment]');if(deleteAssignment&&confirm('确定删除这项作业吗？相关提交记录也会一并删除。')){const id=deleteAssignment.dataset.deleteAssignment;state.assignments=(state.assignments||[]).filter(item=>item.id!==id);Object.keys(state.homeworkStatus||{}).filter(key=>key.startsWith(`${id}:`)).forEach(key=>delete state.homeworkStatus[key]);state.homeworkDetailId=null;persist();render();toast('作业已删除');return;}
  const homeworkBulk=e.target.closest('[data-homework-bulk]');if(homeworkBulk){const [assignmentId,status]=homeworkBulk.dataset.homeworkBulk.split('|');const assignment=(state.assignments||[]).find(item=>item.id===assignmentId);if(assignment){state.students.forEach(student=>(state.homeworkStatus||={})[`${assignmentId}:${student.id}`]=status);persist();render();toast(status==='已交'?'已将全部学生设为已交':'已将全部学生设为未交');}return;}
  const homeworkStatus=e.target.closest('[data-homework-status]');if(homeworkStatus){const [assignmentId,studentId,status]=homeworkStatus.dataset.homeworkStatus.split('|');(state.homeworkStatus||={})[`${assignmentId}:${studentId}`]=status;persist();render();return;}
  const classroomHomeworkStatus=e.target.closest('[data-classroom-homework-status]');if(classroomHomeworkStatus){if(!state.homeworkClassroomEnabled||!state.classroomHomeworkUnlocked)return toast('请先输入专用 PIN');const [assignmentId,studentId,status]=classroomHomeworkStatus.dataset.classroomHomeworkStatus.split('|');(state.homeworkStatus||={})[`${assignmentId}:${studentId}`]=status;persist();render();return;}
  const classroomHomeworkBulk=e.target.closest('[data-classroom-homework-bulk]');if(classroomHomeworkBulk){if(!state.homeworkClassroomEnabled||!state.classroomHomeworkUnlocked)return toast('请先输入专用 PIN');const [assignmentId,status]=classroomHomeworkBulk.dataset.classroomHomeworkBulk.split('|');state.students.forEach(student=>(state.homeworkStatus||={})[`${assignmentId}:${student.id}`]=status);persist();render();toast(status==='已交'?'已将全部学生设为已交':'已将全部学生设为未交');return;}
  const delAttendance=e.target.closest('[data-delete-attendance]');if(delAttendance&&confirm('确定删除这条考勤记录吗？')){state.attendanceRecords=(state.attendanceRecords||[]).filter(x=>x.id!==delAttendance.dataset.deleteAttendance);persist();render();return;}
  const picker=e.target.closest('[data-picker]'); if(picker){const [taskId,day]=picker.dataset.picker.split('|');state.picker={taskId,day};render();}
});
document.addEventListener("change", e => {
  if(e.target.matches('#homework-date')){state.homeworkDate=e.target.value;state.homeworkDetailId=null;persist();render();return;}
  if(e.target.matches('#attendance-date')){state.attendanceFocusDate=e.target.value;persist();render();return;}
  if(e.target.matches('#homework-stats-period')){state.homeworkStatsPeriod=e.target.value;persist();return;}
  if(e.target.matches('#attendance-stats-period')){state.attendanceStatsPeriod=e.target.value;persist();return;}
  if(e.target.matches('#excel-import')){importStudentExcel(e.target.files?.[0]);return;}
  if(e.target.matches('[data-pick-student]')){const {taskId,day}=state.picker;const task=state.tasks.find(t=>t.id===taskId);let ids=[...getCell(state.draft,taskId,day)];if(e.target.checked){if(ids.length>=task.count){e.target.checked=false;toast(`该任务最多选择 ${task.count} 人`);return;}ids.push(e.target.dataset.pickStudent);}else ids=ids.filter(x=>x!==e.target.dataset.pickStudent);setCell(taskId,day,ids);render();}
});
document.addEventListener("submit", async e => {
  e.preventDefault(); const f=new FormData(e.target);
  if(e.target.id==='login-form'){
    try{await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({phone:String(f.get('phone')||''),password:String(f.get('password')||'')})});await loadRemoteState();state.accountPhone=String(f.get('phone')||'');if(!state.classInfo){state.view='setup';state.setupStep=1;}else state.view='home';window.history.replaceState({},'', '/');persist();render();}catch(error){toast(error.message);}return;
  }
  if(e.target.id==='register-form'){
    const phone=String(f.get('phone')||'').trim();
    const password=String(f.get('password')||'');
    const password2=String(f.get('password2')||'');
    if(!/^1\d{10}$/.test(phone)) return toast('请输入正确的11位手机号');
    if(password.length<6) return toast('密码至少需要6位');
    if(password!==password2) return toast('两次输入的密码不一致');
    try{
      await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({phone,password})});
      const registeredState={...initial,loggedIn:true,accountPhone:phone,view:'setup',setupStep:1,profile:{name:`${phone.slice(0,3)}****${phone.slice(-4)}`,school:' ',pin:password},tasks:DEFAULT_TASKS.map(task=>({...task,id:crypto.randomUUID()}))};
      await apiFetch('/api/state',{method:'PUT',body:JSON.stringify({state:registeredState})});
      await apiFetch('/api/auth/logout',{method:'POST'});
      state={...initial,view:'login',tasks:DEFAULT_TASKS.map(task=>({...task,id:crypto.randomUUID()}))};window.history.replaceState({},'', '/login');render();toast('注册成功，请使用新账号登录');
    }catch(error){toast(error.message);}return;
  }
  if(e.target.id==='profile-form'){if(f.get('pin')!==f.get('pin2'))return toast('两次管理密码不一致');state.profile={name:f.get('name'),school:f.get('school'),pin:f.get('pin')};state.setupStep=1;persist();render();}
  if(e.target.id==='profile-info-form'){
    const surname=String(f.get('surname')||'').trim();
    const school=String(f.get('school')||'').trim();
    state.profile={...(state.profile||{}),surname,name:surname?`${surname}老师`:maskedPhone(),school:school||' '};
    persist();render();toast('个人信息已保存');return;
  }
  if(e.target.id==='class-form'){const grade=String(f.get('grade')||'').trim();const gradeLabel=/年级$|^高[一二三123]$/.test(grade)?grade:`${grade}年级`;state.classInfo={name:`${gradeLabel}（${f.get('number')}）班`,grade,number:Number(f.get('number')),year:f.get('year'),term:f.get('term')};state.setupStep=2;persist();render();}
  if(e.target.id==='quick-student'){state.students.push({id:crypto.randomUUID(),name:f.get('name'),number:f.get('number'),gender:f.get('gender')});state.modal=null;persist();render();}
  if(e.target.id==='student-form'){const id=state.modal?.id;const data={id:id||crypto.randomUUID(),name:String(f.get('name')||'').trim(),number:String(f.get('number')||'').trim(),gender:f.get('gender')};if(id)state.students=state.students.map(s=>s.id===id?data:s);else state.students.push(data);state.modal=null;persist();render();toast(id?'学生信息已更新':'学生已添加');}
  if(e.target.id==='announcement-form'){const id=state.modal?.id;const existing=(state.announcements||[]).find(item=>item.id===id);const endRaw=String(f.get('endAt')||'');const item={id:id||crypto.randomUUID(),content:String(f.get('content')||'').trim(),author:teacherName(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),endAt:endRaw?new Date(endRaw).toISOString():null};if(id)state.announcements=state.announcements.map(current=>current.id===id?item:current);else(state.announcements||=[]).unshift(item);if(state.announcementReceipts)delete state.announcementReceipts[item.id];state.modal=null;persist();render();toast(id?'公告已修改':'公告已发布');return;}
  if(e.target.id==='call-student-form'){
    const student=state.students.find(item=>item.id===String(f.get('studentId')||''));if(!student)return toast('请选择需要呼叫的学生');
    const customMessage=String(f.get('customMessage')||'').trim();const message=customMessage||String(f.get('presetMessage')||'请到讲台');
    const call={id:crypto.randomUUID(),studentId:student.id,studentName:student.name,message,author:teacherName(),createdAt:new Date().toISOString()};
    (state.studentCalls||=[]).unshift(call);if(state.studentCallReceipts)delete state.studentCallReceipts[call.id];keepRecentStudentCalls();state.modal=null;persist();render();toast(`已呼叫${student.name}同学`);return;
  }
  if(e.target.id==='assignment-form'){const item={id:crypto.randomUUID(),subject:String(f.get('subject')||'').trim(),title:String(f.get('title')||'').trim(),date:String(f.get('date')||''),createdAt:new Date().toISOString()};(state.assignments||=[]).unshift(item);state.homeworkDate=item.date;state.homeworkDetailId=null;state.modal=null;persist();render();toast('作业已创建并同步到教室展示模式');return;}
  if(e.target.id==='homework-classroom-settings-form'){
    const enabled=f.get('enabled')==='on';const pin=String(f.get('pin')||'').trim();
    if(enabled&&!/^\d{4,8}$/.test(pin))return toast('开启教室登记时，请设置4—8位数字 PIN');
    state.homeworkClassroomEnabled=enabled;state.homeworkClassroomPin=enabled?pin:'';state.classroomHomeworkUnlocked=false;state.modal=null;persist();render();toast(enabled?'教室作业登记已开启':'教室作业登记已关闭');return;
  }
  if(e.target.id==='classroom-homework-pin-form'){
    if(!state.homeworkClassroomEnabled)return toast('班主任尚未开启教室作业登记');
    if(String(f.get('pin')||'')!==String(state.homeworkClassroomPin||''))return toast('PIN 错误，请重新输入');
    state.classroomHomeworkUnlocked=true;state.modal=null;render();toast('验证成功，可以登记提交状态');return;
  }
  if(e.target.id==='attendance-record-form'){const record={id:crypto.randomUUID(),studentId:String(f.get('studentId')),kind:String(f.get('kind')),date:String(f.get('date')),day:String(f.get('day')),period:String(f.get('period')||'').trim(),days:Number(f.get('days')||0),note:String(f.get('note')||'').trim()};(state.attendanceRecords||=[]).push(record);const key=`${record.studentId}:${record.day}`;if(record.kind==='正常')delete state.leaves[key];else state.leaves[key]=true;state.modal=null;persist();render();toast('考勤记录已保存');return;}
  if(e.target.id==='task-form'){const id=state.modal.id;const data={id:id||crypto.randomUUID(),name:f.get('name'),count:Number(f.get('count'))};if(id)state.tasks=state.tasks.map(t=>t.id===id?data:t);else state.tasks.push(data);state.modal=null;state.draftDirty=true;persist();render();}
  if(e.target.id==='edit-class'){state.classInfo={...state.classInfo,name:f.get('name'),year:f.get('year'),term:f.get('term')};persist();render();toast('班级信息已保存');}
  if(e.target.id==='pin-form'){if(f.get('pin')!==state.profile.pin)return toast('登录密码错误');state.modal=null;state.view='home';persist();render();}
  if(e.target.id==='reset-pin-form'){
    const phone=String(f.get('phone') || '').trim();
    const code=String(f.get('code') || '').trim();
    const pin=String(f.get('pin') || '');
    const pin2=String(f.get('pin2') || '');
    if(!/^1\d{10}$/.test(phone)) return toast('请输入正确的11位手机号');
    if(state.accountPhone && phone!==state.accountPhone) return toast('手机号与当前账号不一致');
    if(code!=='123456') return toast('验证码错误');
    if(pin.length<6) return toast('管理密码至少需要6位');
    if(pin!==pin2) return toast('两次输入的新密码不一致');
    try{await apiFetch('/api/account/password',{method:'PUT',body:JSON.stringify({password:pin})});}catch(error){return toast(error.message);}
    state.accountPhone=phone;
    state.profile={...(state.profile || {}),pin};
    state.modal={type:'pin'};
    persist();render();toast('管理密码重设成功，请使用新密码返回');
  }
  if(e.target.id==='delete-account-form'){
    if(String(f.get('confirmation') || '').trim()!=='注销账号') return toast('请输入“注销账号”后再确认');
    try{await apiFetch('/api/account',{method:'DELETE',body:JSON.stringify({confirmation:'注销账号'})});localStorage.removeItem('qinghe-class-manager');state={...initial,tasks:DEFAULT_TASKS.map(t=>({...t,id:crypto.randomUUID()}))};render();toast('账号已注销');}catch(error){toast(error.message);}
  }
});
function randomSchedule(){
  if(!state.students.length)return toast('请先添加学生');
  const counts=Object.fromEntries(state.students.map(s=>[s.id,0])); const next={};
  state.tasks.forEach(task=>DAYS.forEach(day=>{const available=[...state.students].sort((a,b)=>counts[a.id]-counts[b.id]||Math.random()-.5);const usedDay=new Set(state.tasks.flatMap(t=>next[`${t.id}:${day}`]||[]));const chosen=available.filter(s=>!usedDay.has(s.id)).slice(0,task.count).map(s=>s.id);chosen.forEach(id=>counts[id]++);next[`${task.id}:${day}`]=chosen;}));
  state.draft=next;state.draftDirty=true;persist();render();toast('已重新生成随机排班');
}
async function importStudentExcel(file){
  if(!file)return;
  if(!window.XLSX)return toast('Excel 组件加载失败，请检查网络后重试');
  try{
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    const imported=rows.map((row,index)=>({
      id:crypto.randomUUID(),
      name:String(row['姓名']||row['学生姓名']||row['name']||'').trim(),
      number:String(row['学号']||row['编号']||row['number']||`S${String(state.students.length+index+1).padStart(3,'0')}`).trim(),
      gender:String(row['性别']||row['gender']||'').trim()||'未填写'
    })).filter(student=>student.name);
    if(!imported.length)return toast('未识别到学生，请检查“姓名”列');
    const existing=new Set(state.students.map(student=>student.name));
    const unique=imported.filter(student=>!existing.has(student.name));
    state.students.push(...unique);persist();render();toast(`成功导入 ${unique.length} 名学生${unique.length<imported.length?'，已跳过重名学生':''}`);
  }catch(error){toast('文件解析失败，请使用下载的模板重新填写');}
}
function downloadStudentTemplate(){
  const csv='\ufeff姓名,学号,性别\n张三,S001,男\n李四,S002,女';
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='学生名单导入模板.csv';link.click();URL.revokeObjectURL(link.href);
}
function startRollCall(){
  const candidates=state.students.filter(student=>!isLeaveOnDate(student.id,localDateValue()));
  if(rollCallTimer) return;
  if(!candidates.length){toast('今天可点名的学生为空');return;}
  const name=document.querySelector('#rollcall-name');
  const eyebrow=document.querySelector('#rollcall-eyebrow');
  const button=document.querySelector('#rollcall-draw');
  if(!name || !eyebrow || !button) return;
  button.disabled=true;button.classList.add('running');button.textContent='正在抽取…';
  name.classList.remove('placeholder');eyebrow.textContent='随机抽取中';
  let ticks=0;
  rollCallTimer=setInterval(()=>{
    name.textContent=candidates[Math.floor(Math.random()*candidates.length)].name;
    if(++ticks>=14){
      clearInterval(rollCallTimer);rollCallTimer=null;
      const values=new Uint32Array(1);crypto.getRandomValues(values);
      name.textContent=candidates[values[0]%candidates.length].name;
      eyebrow.textContent='本次点到';button.textContent='再点一名';button.classList.remove('running');button.disabled=false;
    }
  },75);
}
function exportExcel(){
  const schedule=Object.keys(state.published).length?state.published:state.draft;
  const rows=state.tasks.map(t=>`<tr><td>${esc(t.name)}（${t.count}人）</td>${DAYS.map(d=>`<td>${getCell(schedule,t.id,d).map(id=>state.students.find(s=>s.id===id)?.name||'').join('、')}</td>`).join('')}</tr>`).join('');
  const html=`<html><meta charset="UTF-8"><body><h2>${esc(currentClass())} 每周值日表</h2><table border="1"><tr><th>任务</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr>${rows}</table></body></html>`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'application/vnd.ms-excel'}));a.download=`${currentClass()}_每周值日表.xls`;a.click();URL.revokeObjectURL(a.href);toast('Excel 已导出');
}
function downloadCsv(filename,rows){const csv='\ufeff'+rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=filename;a.click();URL.revokeObjectURL(a.href);}
function exportAttendance(){
  const period=state.attendanceStatsPeriod||'week';const range=statisticRange(period,state.attendanceFocusDate||localDateValue());
  const affected=state.students.map(student=>{
    const dates=new Set();let leaveCount=0;let lateCount=0;
    Object.keys(state.leaves||{}).forEach(key=>{const split=key.lastIndexOf(':');const id=key.slice(0,split);const date=key.slice(split+1);if(id===student.id&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&dateInStatisticRange(date,range)){leaveCount++;dates.add(`${date} 请假`);}});
    Object.keys(state.lates||{}).forEach(key=>{const split=key.lastIndexOf(':');const id=key.slice(0,split);const date=key.slice(split+1);if(id===student.id&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&dateInStatisticRange(date,range)){lateCount++;dates.add(`${date} 迟到`);}});
    return {student,leaveCount,lateCount,details:[...dates].sort().join('；')};
  }).filter(item=>item.leaveCount||item.lateCount);
  if(!affected.length)return toast('该统计周期暂无请假或迟到记录');
  const rows=[['学生','学号','请假次数','迟到次数','异常明细'],...affected.map(item=>[item.student.name,item.student.number||'',item.leaveCount,item.lateCount,item.details])];
  downloadCsv(`${currentClass()}_${range.label}_考勤异常统计.csv`,rows);toast(`已导出 ${affected.length} 名异常学生`);
}
function exportDailyHomework(){
  const period=state.homeworkStatsPeriod||'day';const anchor=state.homeworkDate||localDateValue();const range=statisticRange(period,anchor);
  const assignments=(state.assignments||[]).filter(item=>dateInStatisticRange(assignmentDate(item),range));
  const missing=assignments.flatMap(item=>state.students.filter(student=>homeworkStudentStatus(item,student.id)==='未交').map(student=>[assignmentDate(item),item.subject,item.title,student.name,student.number||'','未交',homeworkLeaveLinked(item,student.id)?'请假':'']));
  if(!missing.length)return toast('该统计周期暂无未交记录');
  downloadCsv(`${currentClass()}_${range.label}_作业未交统计.csv`,[['作业日期','学科','作业内容','学生','学号','状态','备注'],...missing]);toast(`已导出 ${missing.length} 条未交记录`);
}
function exportHomework(){
  const a=(state.assignments||[]).find(x=>x.id===state.homeworkDetailId);if(!a)return toast('请先打开一项作业');
  const missing=state.students.filter(s=>homeworkStudentStatus(a,s.id)==='未交');if(!missing.length)return toast('该作业暂无未交学生');
  downloadCsv(`${currentClass()}_${a.subject}_${a.title}_未交名单.csv`,[['学生','学号','状态','备注'],...missing.map(s=>[s.name,s.number||'','未交',homeworkLeaveLinked(a,s.id)?'请假':''])]);toast(`已导出 ${missing.length} 名未交学生`);
}
async function syncDisplayAlerts(){
  if(!serverReady||!state.loggedIn||!String(state.view).startsWith('display'))return;
  try{
    const result=await apiFetch('/api/state');const remote=result.state||{};
    const remoteCalls=remote.studentCalls||[];const callsChanged=JSON.stringify(remoteCalls)!==JSON.stringify(state.studentCalls||[]);
    state.studentCalls=remoteCalls;state.studentCallReceipts=remote.studentCallReceipts||state.studentCallReceipts||{};keepRecentStudentCalls();
    state.announcements=remote.announcements||state.announcements||[];state.announcementReceipts=remote.announcementReceipts||state.announcementReceipts||{};
    const pending=[...state.studentCalls].filter(item=>!state.studentCallReceipts?.[item.id]).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if(pending&&state.modal?.id!==pending.id){state.modal={type:'student-call-popup',id:pending.id};render();return;}
    if(callsChanged)render();
  }catch{}
}
setInterval(syncDisplayAlerts,3000);
bootstrap();
