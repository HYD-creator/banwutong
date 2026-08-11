const DAYS = ["周一", "周二", "周三", "周四", "周五"];
const DEFAULT_TASKS = [
  { id: crypto.randomUUID(), name: "扫地", count: 2 },
  { id: crypto.randomUUID(), name: "拖地", count: 2 },
  { id: crypto.randomUUID(), name: "擦黑板", count: 1 },
];
const DEFAULT_STUDENTS = ["王小明","李华","张琳","陈晨","赵可","周宁","林雨","孙悦","吴桐","郑欣","刘洋","高远"];
const initial = {
  loggedIn: false, accountPhone: "", setupStep: 0, profile: null, classInfo: null, students: [], leaves: {}, lates: {},
  tasks: DEFAULT_TASKS, draft: {}, published: {}, draftDirty: false, view: "login", picker: null, modal: null, popover: null,
};
let saved;
try { saved = JSON.parse(localStorage.getItem("qinghe-class-manager") || "null"); } catch { saved = null; }
let state = { ...initial, ...(saved || {}) };
if (new URLSearchParams(window.location.search).get("logout") === "1") {
  state.loggedIn = false;
  state.view = "login";
  window.history.replaceState({}, "", window.location.pathname);
}
const app = document.querySelector("#app");
let rollCallTimer = null;

function persist() {
  const { picker, modal, popover, ...data } = state;
  localStorage.setItem("qinghe-class-manager", JSON.stringify(data));
}
function toast(message) {
  const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast = setTimeout(() => el.classList.remove("show"), 2200);
}
function esc(s="") { return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function route(view) { state.view = view; state.picker = null; persist(); render(); }
function currentClass() { return state.classInfo?.name || "尚未创建班级"; }
function getCell(schedule, taskId, day) { return schedule[`${taskId}:${day}`] || []; }
function setCell(taskId, day, ids) { state.draft[`${taskId}:${day}`] = ids; state.draftDirty = true; persist(); }
function isLeave(studentId, day) { return !!state.leaves[`${studentId}:${day}`]; }
function isLate(studentId, day) { return !!state.lates?.[`${studentId}:${day}`]; }

function loginPage() {
  return `<div class="auth-page"><section class="auth-art"><div class="brand"><span class="brand-mark">班</span>班务通</div><div><h1>把班级日常，安排得清清楚楚。</h1><p>从学生名单到值日排班，一个账号连接教师办公室与教室大屏。</p></div><p>教师管理模式 · 教室展示模式</p></section><section class="auth-panel"><form class="form-card" id="login-form"><span class="eyebrow">欢迎回来</span><h1>登录教师账号</h1><p class="sub">登录后默认进入教师管理模式</p><div class="field"><label>手机号</label><input class="input" name="phone" value="13800000000" maxlength="11" required /></div><div class="field"><label for="login-password">密码</label><div class="password-field"><input class="input" id="login-password" name="password" type="password" value="123456" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="login-password" aria-pressed="false">显示</button></div></div><div class="row" style="justify-content:space-between;margin-top:12px"><label class="sub"><input type="checkbox" /> 记住账号</label><button type="button" class="btn small soft" data-action="forgot">忘记密码</button></div><button class="btn primary" style="width:100%;margin-top:22px">登录</button><p class="sub" style="text-align:center;margin-top:18px">还没有账号？ <button type="button" class="btn small" data-action="register">立即注册</button></p></form></section></div>`;
}
function setupPage() {
  const step = state.setupStep;
  const steps = ["完善个人信息","创建班级","添加学生"];
  let body = "";
  if (step === 0) body = `<form id="profile-form"><h1>完善个人信息</h1><p class="sub">这些信息会显示在教师管理首页。</p><div class="grid two"><div class="field"><label>教师姓名 *</label><input class="input" name="name" value="${esc(state.profile?.name || "王老师")}" required /></div><div class="field"><label>学校名称 *</label><input class="input" name="school" value="${esc(state.profile?.school || "实验小学")}" required /></div></div><div class="grid two"><div class="field"><label for="setup-pin">管理密码 *</label><div class="password-field"><input class="input" id="setup-pin" name="pin" type="password" minlength="6" value="${esc(state.profile?.pin || "123456")}" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="setup-pin" aria-pressed="false">显示</button></div></div><div class="field"><label for="setup-pin2">确认管理密码 *</label><div class="password-field"><input class="input" id="setup-pin2" name="pin2" type="password" minlength="6" value="${esc(state.profile?.pin || "123456")}" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="setup-pin2" aria-pressed="false">显示</button></div></div></div><div class="form-actions"><button class="btn primary">保存并继续</button></div></form>`;
  if (step === 1) body = `<form id="class-form"><h1>创建班级</h1><p class="sub">当前账号同时只管理一个班级。</p><div class="grid two"><div class="field"><label>年级 *</label><select class="select" name="grade">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n==3?'selected':''}>${["一","二","三","四","五","六"][n-1]}年级</option>`).join("")}</select></div><div class="field"><label>班号 *</label><input class="input" name="number" type="number" min="1" value="2" required /></div></div><div class="grid two"><div class="field"><label>学年 *</label><input class="input" name="year" value="2026—2027" required /></div><div class="field"><label>学期 *</label><select class="select" name="term"><option>上学期</option><option>下学期</option></select></div></div><div class="form-actions"><button class="btn primary">下一步：添加学生</button></div></form>`;
  if (step === 2) body = `<div><h1>添加学生</h1><p class="sub">支持手动添加或从 Excel 批量导入，表头使用“姓名、学号、性别”。</p><div class="import-bar"><input type="file" id="excel-import" accept=".xlsx,.xls,.csv" hidden /><button class="btn soft" data-action="import-excel">导入 Excel</button><button class="btn small" data-action="download-template">下载导入模板</button></div><form class="row" id="quick-student" style="margin-top:20px"><input class="input" name="name" placeholder="学生姓名" required /><input class="input" name="number" placeholder="学号（选填）" /><select class="select" name="gender" style="max-width:110px"><option>男</option><option>女</option></select><button class="btn primary">添加</button></form>${studentList()}<div class="form-actions"><button class="btn" data-action="fill-demo">填入示例名单</button><button class="btn primary" data-action="finish-setup" ${state.students.length?'':'disabled'}>完成设置</button></div></div>`;
  return `<div class="setup-page"><div class="card setup-card"><div class="steps">${steps.map((x,i)=>`<div class="step ${i===step?'active':i<step?'done':''}">${i+1}. ${x}</div>`).join("")}</div>${body}</div></div>`;
}
function studentList() {
  if (!state.students.length) return `<div class="student-list empty">还没有学生，请先添加一名学生。</div>`;
  return `<div class="student-list">${state.students.map((s,i)=>`<div class="student-row"><strong>${esc(s.name)}</strong><span class="sub">${esc(s.number || `S${String(i+1).padStart(3,'0')}`)}</span><span>${esc(s.gender)}</span><button class="btn small" data-edit-student="${s.id}">编辑</button><button class="icon-btn" data-remove-student="${s.id}" aria-label="移除学生">×</button></div>`).join("")}</div>`;
}
function helpPopover(id,text) {
  return `<span class="popover-wrap ${state.popover===id?'open':''}"><button type="button" class="help-button" data-popover="${id}" aria-label="查看说明" aria-expanded="${state.popover===id}">?</button><span class="popover-card" role="tooltip">${esc(text)}</span></span>`;
}
function shell(content, active="home") {
  const name = state.profile?.name || "王老师";
  return `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">班</span>班务通</div><div class="top-actions"><span class="pill green">教师管理模式</span><button class="btn small" data-action="display">切换到教室展示模式</button><div class="user-chip"><span class="avatar">${esc(name[0])}</span>${esc(name)}</div><button class="btn small" data-action="logout">退出登录</button></div></header><div class="layout"><aside class="sidebar"><div class="nav-label">主要功能</div>${[["home","⌂","管理首页","查看班级概览和待处理事项"],["rollcall","◉","随机点名","从当前班级名单随机抽取学生"],["duty","▦","值日管理","编辑、预览并发布每周值日安排"],["attendance","✓","考勤请假","登记学生请假与迟到情况"],["students","♙","学生名单","添加、导入或修改学生信息"],["class","◇","班级设置","修改班级资料和账号相关设置"]].map(([v,ic,t,tip])=>`<button class="nav-btn ${active===v?'active':''}" data-route="${v}" data-tooltip="${tip}" aria-label="${t}：${tip}"><span>${ic}</span><span class="nav-text">${t}</span></button>`).join("")}</aside><main class="main">${content}</main></div>${modal()}</div>`;
}
function dashboard() {
  const leaveCount = Object.keys(state.leaves).length;
  return shell(`<div class="hero"><div><span class="eyebrow">${esc(state.profile?.school || "实验小学")}</span><h1>上午好，${esc(state.profile?.name || "王老师")}</h1><p class="sub">当前班级：${esc(currentClass())} · ${esc(state.classInfo?.year || "")}${state.classInfo ? ` · ${esc(state.classInfo.term)}`:""}</p></div><button class="btn" data-route="class">查看班级信息</button></div><div class="grid two"><button class="action-card" data-route="class"><div class="action-icon">◇</div><h3>班级设置</h3><p>查看或修改班级名称、年级、学年与学期。</p></button><button class="action-card" data-route="students"><div class="action-icon">♙</div><h3>学生名单管理</h3><p>当前 ${state.students.length} 名学生，可添加、编辑或移出。</p></button></div><div class="section-head"><h2>核心功能</h2><span class="sub">课堂点名、值日与考勤功能已开放</span></div><div class="grid five">${[["点名管理","◉","从当前班级名单随机抽取学生","rollcall"],["公告管理","✉","功能开发中",""],["值日管理","▦","制作并发布周值日表","duty"],["考勤管理","✓","登记学生请假","attendance"],["作业管理","▤","功能开发中",""]].map(([t,ic,d,r])=>`<button class="action-card" ${r?`data-route="${r}"`:`data-action="coming"`}><div class="action-icon">${ic}</div><h3>${t}</h3><p>${d}</p></button>`).join("")}</div><div class="section-head"><h2>班级概览</h2></div><div class="grid five"><div class="card stat"><div class="label">班级人数</div><div class="value">${state.students.length}</div></div><div class="card stat"><div class="label">值日任务</div><div class="value">${state.tasks.length}</div></div><div class="card stat"><div class="label">请假记录</div><div class="value">${leaveCount}</div></div><div class="card stat"><div class="label">排班状态</div><div class="value" style="font-size:18px">${Object.keys(state.published).length?'已发布':'未发布'}</div></div><div class="card stat"><div class="label">待处理</div><div class="value">${missingCount()}</div></div></div>`, "home");
}
function rollCallPage() {
  return shell(`<div class="hero"><div><span class="eyebrow">课堂互动</span><h1>课堂随机点名</h1><p class="sub">名单来自当前班级，每次从完整名单中随机抽取，允许重复点名。</p></div><span class="pill green">${state.students.length} 名学生</span></div><section class="rollcall-layout"><article class="rollcall-stage"><div class="rollcall-head"><span class="rollcall-pill">${esc(currentClass())}</span><span class="rollcall-pill">允许重复抽取</span></div><div class="rollcall-screen" aria-live="polite"><div><div class="rollcall-eyebrow" id="rollcall-eyebrow">准备好了吗？</div><div class="rollcall-name placeholder" id="rollcall-name">点击下方按钮开始点名</div><div class="rollcall-hint">每次都从当前班级完整名单中随机抽取</div></div></div><button class="rollcall-draw" id="rollcall-draw" data-action="draw-rollcall" ${state.students.length?'':'disabled'}>开始点名</button></article><aside class="rollcall-side"><div class="card pad"><h2>当前班级</h2><div class="rollcall-count"><strong>${state.students.length}</strong><span>名学生</span></div><div class="rollcall-meta"><span>班级</span><b>${esc(currentClass())}</b></div></div><div class="card pad"><h2>使用提示</h2><ol class="rollcall-guide"><li>确认当前班级名单</li><li>点击“开始点名”</li><li>再次点击可继续抽取</li></ol></div></aside></section>`, "rollcall");
}
function displayRollCallPage() {
  return `<div class="display-page"><div class="display-rollcall-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())} · 课堂随机点名</div><div style="opacity:.8;margin-top:4px">教室展示模式 · 允许重复抽取</div></div><button class="btn" data-action="back-display">返回教室首页</button></div><div class="display-rollcall-body"><article class="rollcall-stage"><div class="rollcall-head"><span class="rollcall-pill">${esc(currentClass())}</span><span class="rollcall-pill">${state.students.length} 名学生</span></div><div class="rollcall-screen" aria-live="polite"><div><div class="rollcall-eyebrow" id="rollcall-eyebrow">准备好了吗？</div><div class="rollcall-name placeholder" id="rollcall-name">点击下方按钮开始点名</div><div class="rollcall-hint">每次都从当前班级完整名单中随机抽取</div></div></div><button class="rollcall-draw" id="rollcall-draw" data-action="draw-rollcall" ${state.students.length?'':'disabled'}>开始点名</button></article><aside class="rollcall-side"><div class="card pad"><h2>当前班级</h2><div class="rollcall-count"><strong>${state.students.length}</strong><span>名学生</span></div><div class="rollcall-meta"><span>班级</span><b>${esc(currentClass())}</b></div></div><div class="card pad"><h2>课堂操作</h2><ol class="rollcall-guide"><li>点击“开始点名”</li><li>姓名停止滚动后公布结果</li><li>点击“再点一名”继续抽取</li></ol></div></aside></div></div>${modal()}</div>`;
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
  return `<div class="picker-pop">${state.students.map(s=>`<label class="${isLeave(s.id,day)?'leave':''}"><input type="checkbox" data-pick-student="${s.id}" ${ids.includes(s.id)?'checked':''} ${isLeave(s.id,day)?'disabled':''}/> ${esc(s.name)} ${isLeave(s.id,day)?'（请假）':''}</label>`).join("")}<div class="picker-foot"><span class="sub">已选 ${ids.length}/${task.count}</span><button class="btn small primary" data-action="close-picker">完成</button></div></div>`;
}
function attendancePage() {
  return shell(`<div class="hero"><div><span class="eyebrow">考勤管理</span><h1>学生考勤登记</h1><p class="sub">请假会与值日排班联动；迟到仅作为考勤记录，不影响值日表和随机点名。</p></div></div><div class="card pad"><div class="attendance-legend"><span class="pill">正常</span><span class="pill red">已请假</span><span class="pill orange">已迟到</span></div><div class="table-wrap"><table style="min-width:980px"><thead><tr><th>学生</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>${state.students.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td>${DAYS.map(d=>`<td><div class="attendance-options"><button type="button" class="attendance-toggle ${isLeave(s.id,d)?'selected leave':''}" data-attendance="leave|${s.id}|${d}" aria-pressed="${isLeave(s.id,d)}"><span class="attendance-check">${isLeave(s.id,d)?'✓':''}</span><span>请假</span></button><button type="button" class="attendance-toggle ${isLate(s.id,d)?'selected late':''}" data-attendance="late|${s.id}|${d}" aria-pressed="${isLate(s.id,d)}"><span class="attendance-check">${isLate(s.id,d)?'✓':''}</span><span>迟到</span></button></div></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`,"attendance");
}
function studentsPage() {
  return shell(`<div class="hero"><div><span class="eyebrow">基础资料</span><h1>学生名单管理</h1><p class="sub">当前共 ${state.students.length} 名学生。</p></div><div class="row"><input type="file" id="excel-import" accept=".xlsx,.xls,.csv" hidden /><button class="btn" data-action="download-template">下载模板</button><button class="btn soft" data-action="import-excel">导入 Excel</button>${helpPopover('excel-rule','Excel 第一行应包含“姓名、学号、性别”。姓名为必填；导入时会自动跳过同名学生。')}<button class="btn primary" data-action="add-student">＋ 添加学生</button></div></div><div class="card pad">${studentList()}</div>`,"students");
}
function classPage() {
  const c=state.classInfo||{};
  return shell(`<div class="hero"><div><span class="eyebrow">基础资料</span><h1>班级设置</h1><p class="sub">修改当前班级资料，或删除后重新创建班级。</p></div></div><div class="card pad"><form id="edit-class"><div class="grid two"><div class="field"><label>班级名称</label><input class="input" name="name" value="${esc(c.name||'')}" required /></div><div class="field"><label>学年</label><input class="input" name="year" value="${esc(c.year||'')}" required /></div><div class="field"><label>学期</label><select class="select" name="term"><option ${c.term==='上学期'?'selected':''}>上学期</option><option ${c.term==='下学期'?'selected':''}>下学期</option></select></div></div><div class="form-actions" style="justify-content:space-between"><button type="button" class="btn danger" data-action="delete-class">删除当前班级</button><button class="btn primary">保存修改</button></div></form></div><section class="danger-zone"><div><h2>危险操作</h2><p class="sub">注销账号后，教师账号、班级资料、学生名单和历史记录将被删除，且无法恢复。</p></div><button class="btn danger" data-action="open-delete-account">注销账号</button></section>`,"class");
}
function displayPage() {
  return `<div class="display-page"><div class="display-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())}</div><div style="opacity:.8;margin-top:4px">教室展示模式</div></div><button class="btn" data-action="back-manage">返回教师管理模式</button></div><div class="display-home"><div class="display-welcome"><span class="eyebrow">班务通 · 课堂功能</span><h1>选择要使用的功能</h1><p class="sub">学生可在教室大屏使用课堂功能；管理设置仍受管理密码保护。</p></div><div class="display-entry-grid"><button class="display-entry rollcall-entry" data-action="display-rollcall"><span class="display-entry-icon">◉</span><span><strong>课堂随机点名</strong><small>从当前班级名单中随机抽取学生</small></span><b>进入 →</b></button><button class="display-entry duty-entry" data-action="display-duty"><span class="display-entry-icon">▦</span><span><strong>本周值日表</strong><small>查看教师已发布的固定周值日安排</small></span><b>进入 →</b></button></div></div></div>${modal()}</div>`;
}
function displayDutyPage() {
  const schedule=Object.keys(state.published).length?state.published:state.draft;
  return `<div class="display-page"><div class="display-shell"><div class="display-head"><div><div class="display-title">${esc(currentClass())} · 每周值日表</div><div style="opacity:.8;margin-top:4px">固定周安排 · 教室展示模式</div></div><button class="btn" data-action="back-display">返回教室首页</button></div><div class="table-wrap display-table" style="border:0;border-radius:0"><table><thead><tr><th>值日任务</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>${state.tasks.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="sub">${t.count} 人</div></td>${DAYS.map(d=>`<td>${getCell(schedule,t.id,d).map(id=>{const s=state.students.find(x=>x.id===id);return s?`<span class="${isLeave(id,d)?'leave-name display-leave-name':''}">${esc(s.name)}</span>`:''}).filter(Boolean).join('、')||'<span class="sub">待安排</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="toolbar"><span class="sub">灰色背景姓名表示该学生请假，请教师及时调整。</span><div class="toolbar-spacer"></div><span class="pill green">教师已发布</span></div></div>${modal()}</div>`;
}
function modal() {
  if (!state.modal) return "";
  if (state.modal.type==='task') { const t=state.tasks.find(x=>x.id===state.modal.id); return `<div class="modal-backdrop"><form class="modal" id="task-form"><div class="modal-head"><h2>${t?'编辑':'新增'}值日任务</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>任务名称 *</label><input class="input" name="name" maxlength="15" value="${esc(t?.name||'')}" required /></div><div class="field"><label>每天需要人数 *</label><input class="input" name="count" type="number" min="1" max="8" value="${t?.count||2}" required /></div><div class="form-actions" style="justify-content:${t?'space-between':'flex-end'}">${t?`<button type="button" class="btn danger" data-delete-task="${t.id}">删除任务</button>`:''}<div class="row"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">保存任务</button></div></div></form></div>`; }
  if (state.modal.type==='student') { const s=state.students.find(x=>x.id===state.modal.id); return `<div class="modal-backdrop"><form class="modal" id="student-form"><div class="modal-head"><h2>${s?'修改':'添加'}学生信息</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>学生姓名 *</label><input class="input" name="name" value="${esc(s?.name||'')}" required /></div><div class="field"><label>学号</label><input class="input" name="number" value="${esc(s?.number||'')}" /></div><div class="field"><label>性别</label><select class="select" name="gender"><option ${s?.gender==='男'?'selected':''}>男</option><option ${s?.gender==='女'?'selected':''}>女</option><option ${s?.gender==='未填写'?'selected':''}>未填写</option></select></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">${s?'保存修改':'添加'}</button></div></form></div>`; }
  if (state.modal.type==='pin') return `<div class="modal-backdrop"><form class="modal" id="pin-form"><div class="modal-head"><h2>返回教师管理模式</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><p class="sub">请输入管理密码，防止学生进入管理功能。</p><div class="field"><label for="manage-pin">管理密码</label><div class="password-field"><input class="input" id="manage-pin" type="password" name="pin" required autofocus /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="manage-pin" aria-pressed="false">显示</button></div></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn small soft" data-action="forgot-pin">忘记管理密码？</button></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary">确认返回</button></div></form></div>`;
  if (state.modal.type==='reset-pin') return `<div class="modal-backdrop"><form class="modal" id="reset-pin-form"><div class="modal-head"><h2>重设管理密码</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><p class="sub">验证账号绑定手机号后，即可设置新的管理密码。演示验证码为 <b>123456</b>。</p><div class="field"><label>绑定手机号 *</label><input class="input" name="phone" inputmode="numeric" maxlength="11" value="${esc(state.accountPhone || '')}" placeholder="请输入11位手机号" required /></div><div class="field"><label>短信验证码 *</label><div class="row"><input class="input" name="code" inputmode="numeric" maxlength="6" placeholder="请输入6位验证码" required /><button type="button" class="btn soft" data-action="send-pin-code">获取验证码</button></div></div><div class="grid two"><div class="field"><label for="reset-pin">新管理密码 *</label><div class="password-field"><input class="input" id="reset-pin" type="password" name="pin" minlength="6" placeholder="至少6位" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="reset-pin" aria-pressed="false">显示</button></div></div><div class="field"><label for="reset-pin2">确认新密码 *</label><div class="password-field"><input class="input" id="reset-pin2" type="password" name="pin2" minlength="6" placeholder="再次输入" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="reset-pin2" aria-pressed="false">显示</button></div></div></div><div class="form-actions"><button type="button" class="btn" data-action="back-pin">返回</button><button class="btn primary">确认重设</button></div></form></div>`;
  if (state.modal.type==='delete-account') return `<div class="modal-backdrop"><form class="modal" id="delete-account-form"><div class="modal-head"><h2>确认注销账号</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="delete-warning"><strong>此操作无法撤销</strong><p>账号、班级、学生、排班、考勤及其他历史记录都会被删除。</p></div><div class="field"><label>请输入“注销账号”进行确认</label><input class="input" name="confirmation" autocomplete="off" required /></div><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn danger">永久注销账号</button></div></form></div>`;
  if (state.modal.type==='duty-preview') return `<div class="modal-backdrop"><section class="modal preview-modal"><div class="modal-head"><div><span class="eyebrow">教室展示效果</span><h2>${esc(currentClass())} · 每周值日表</h2></div><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="table-wrap"><table><thead><tr><th>值日任务</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${state.tasks.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="sub">${t.count} 人</div></td>${DAYS.map(d=>`<td>${getCell(state.draft,t.id,d).map(id=>esc(state.students.find(s=>s.id===id)?.name||'')).filter(Boolean).join('、')||'<span class="sub">待安排</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="preview-foot"><span class="sub">此处仅预览当前草稿，不会切换模式，也不会自动发布。</span><button class="btn primary" data-action="close-modal">关闭预览</button></div></section></div>`;
  return "";
}
function render() {
  if (!state.loggedIn || state.view==='login') app.innerHTML=loginPage();
  else if (!state.profile || !state.classInfo || !state.students.length || state.view==='setup') app.innerHTML=setupPage();
  else if (state.view==='home') app.innerHTML=dashboard();
  else if (state.view==='rollcall') app.innerHTML=rollCallPage();
  else if (state.view==='duty') app.innerHTML=dutyPage();
  else if (state.view==='attendance') app.innerHTML=attendancePage();
  else if (state.view==='students') app.innerHTML=studentsPage();
  else if (state.view==='class') app.innerHTML=classPage();
  else if (state.view==='display') app.innerHTML=displayPage();
  else if (state.view==='display-duty') app.innerHTML=displayDutyPage();
  else if (state.view==='display-rollcall') app.innerHTML=displayRollCallPage();
  else app.innerHTML=dashboard();
}
document.addEventListener("click", e => {
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
  if(action==='logout'){state.loggedIn=false;state.view='login';persist();render();return;}
  if(action==='register'){state.loggedIn=true;state.accountPhone=document.querySelector('[name="phone"]')?.value || state.accountPhone;state.view='setup';state.setupStep=0;persist();render();}
  if(action==='forgot') toast('演示版验证码：123456');
  if(action==='fill-demo'){state.students=DEFAULT_STUDENTS.map((name,i)=>({id:crypto.randomUUID(),name,number:`S${String(i+1).padStart(3,'0')}`,gender:i%2?'女':'男'}));persist();render();}
  if(action==='finish-setup'){state.view='home';persist();render();toast('首次设置完成');}
  if(action==='coming') toast('该功能将在下一阶段开放');
  if(action==='display'){state.view='display';persist();render();}
  if(action==='display-rollcall'){state.view='display-rollcall';persist();render();}
  if(action==='display-duty'){state.view='display-duty';persist();render();}
  if(action==='back-display'){state.view='display';persist();render();}
  if(action==='draw-rollcall') startRollCall();
  if(action==='back-manage'){state.modal={type:'pin'};render();}
  if(action==='forgot-pin'){state.modal={type:'reset-pin'};render();}
  if(action==='back-pin'){state.modal={type:'pin'};render();}
  if(action==='send-pin-code') toast('验证码已发送，演示验证码：123456');
  if(action==='close-modal'){state.modal=null;render();}
  if(action==='add-task'){state.modal={type:'task'};render();}
  if(action==='add-student'){state.modal={type:'student'};render();}
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
  const picker=e.target.closest('[data-picker]'); if(picker){const [taskId,day]=picker.dataset.picker.split('|');state.picker={taskId,day};render();}
});
document.addEventListener("change", e => {
  if(e.target.matches('#excel-import')){importStudentExcel(e.target.files?.[0]);return;}
  if(e.target.matches('[data-pick-student]')){const {taskId,day}=state.picker;const task=state.tasks.find(t=>t.id===taskId);let ids=[...getCell(state.draft,taskId,day)];if(e.target.checked){if(ids.length>=task.count){e.target.checked=false;toast(`该任务最多选择 ${task.count} 人`);return;}ids.push(e.target.dataset.pickStudent);}else ids=ids.filter(x=>x!==e.target.dataset.pickStudent);setCell(taskId,day,ids);render();}
});
document.addEventListener("submit", e => {
  e.preventDefault(); const f=new FormData(e.target);
  if(e.target.id==='login-form'){state.loggedIn=true;state.accountPhone=String(f.get('phone') || '');if(!state.profile){state.view='setup';state.setupStep=0;}else state.view='home';persist();render();}
  if(e.target.id==='profile-form'){if(f.get('pin')!==f.get('pin2'))return toast('两次管理密码不一致');state.profile={name:f.get('name'),school:f.get('school'),pin:f.get('pin')};state.setupStep=1;persist();render();}
  if(e.target.id==='class-form'){const cn=['一','二','三','四','五','六'][Number(f.get('grade'))-1];state.classInfo={name:`${cn}年级（${f.get('number')}）班`,grade:Number(f.get('grade')),number:Number(f.get('number')),year:f.get('year'),term:f.get('term')};state.setupStep=2;persist();render();}
  if(e.target.id==='quick-student'){state.students.push({id:crypto.randomUUID(),name:f.get('name'),number:f.get('number'),gender:f.get('gender')});state.modal=null;persist();render();}
  if(e.target.id==='student-form'){const id=state.modal?.id;const data={id:id||crypto.randomUUID(),name:String(f.get('name')||'').trim(),number:String(f.get('number')||'').trim(),gender:f.get('gender')};if(id)state.students=state.students.map(s=>s.id===id?data:s);else state.students.push(data);state.modal=null;persist();render();toast(id?'学生信息已更新':'学生已添加');}
  if(e.target.id==='task-form'){const id=state.modal.id;const data={id:id||crypto.randomUUID(),name:f.get('name'),count:Number(f.get('count'))};if(id)state.tasks=state.tasks.map(t=>t.id===id?data:t);else state.tasks.push(data);state.modal=null;state.draftDirty=true;persist();render();}
  if(e.target.id==='edit-class'){state.classInfo={...state.classInfo,name:f.get('name'),year:f.get('year'),term:f.get('term')};persist();render();toast('班级信息已保存');}
  if(e.target.id==='pin-form'){if(f.get('pin')!==state.profile.pin)return toast('管理密码错误');state.modal=null;state.view='home';persist();render();}
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
    state.accountPhone=phone;
    state.profile={...(state.profile || {}),pin};
    state.modal={type:'pin'};
    persist();render();toast('管理密码重设成功，请使用新密码返回');
  }
  if(e.target.id==='delete-account-form'){
    if(String(f.get('confirmation') || '').trim()!=='注销账号') return toast('请输入“注销账号”后再确认');
    localStorage.removeItem('qinghe-class-manager');
    state={...initial,tasks:DEFAULT_TASKS.map(t=>({...t,id:crypto.randomUUID()}))};
    render();toast('演示账号已注销');
  }
});
function randomSchedule(){
  if(!state.students.length)return toast('请先添加学生');
  const counts=Object.fromEntries(state.students.map(s=>[s.id,0])); const next={};
  state.tasks.forEach(task=>DAYS.forEach(day=>{const available=state.students.filter(s=>!isLeave(s.id,day)).sort((a,b)=>counts[a.id]-counts[b.id]||Math.random()-.5);const usedDay=new Set(state.tasks.flatMap(t=>next[`${t.id}:${day}`]||[]));const chosen=available.filter(s=>!usedDay.has(s.id)).slice(0,task.count).map(s=>s.id);chosen.forEach(id=>counts[id]++);next[`${task.id}:${day}`]=chosen;}));
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
  if(rollCallTimer || !state.students.length) return;
  const name=document.querySelector('#rollcall-name');
  const eyebrow=document.querySelector('#rollcall-eyebrow');
  const button=document.querySelector('#rollcall-draw');
  if(!name || !eyebrow || !button) return;
  button.disabled=true;button.classList.add('running');button.textContent='正在抽取…';
  name.classList.remove('placeholder');eyebrow.textContent='随机抽取中';
  let ticks=0;
  rollCallTimer=setInterval(()=>{
    name.textContent=state.students[Math.floor(Math.random()*state.students.length)].name;
    if(++ticks>=14){
      clearInterval(rollCallTimer);rollCallTimer=null;
      const values=new Uint32Array(1);crypto.getRandomValues(values);
      name.textContent=state.students[values[0]%state.students.length].name;
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
render();
