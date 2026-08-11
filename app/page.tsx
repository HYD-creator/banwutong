"use client";

import { useEffect, useState } from "react";

type Screen =
  | "login"
  | "profile"
  | "class"
  | "students"
  | "display"
  | "duty-week"
  | "manage"
  | "duty";

const routes: Record<Screen, string> = {
  login: "/login",
  profile: "/setup/profile",
  class: "/setup/class",
  students: "/setup/students",
  display: "/display",
  "duty-week": "/display/duty-week",
  manage: "/manage",
  duty: "/manage/duty",
};

const screenByPath = Object.fromEntries(
  Object.entries(routes).map(([key, path]) => [path, key]),
) as Record<string, Screen>;

const students = ["王小明", "李华", "张琳", "陈晨", "赵可", "周宁", "林雨", "孙悦"];
const tasks = [
  ["扫地（2人）", "王小明、李华", "张琳、陈晨", "赵可、周宁", "林雨、孙悦", "吴桐、郑欣"],
  ["拖地（2人）", "周宁、林雨", "孙悦、吴桐", "郑欣、王小明", "李华、张琳", "陈晨、赵可"],
  ["擦黑板（1人）", "陈晨", "赵可", "周宁", "林雨", "孙悦"],
  ["倒垃圾（2人）", "吴桐、郑欣", "王小明、李华", "张琳、陈晨", "赵可、周宁", "林雨、孙悦"],
];

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input placeholder={placeholder} />
    </label>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [modal, setModal] = useState<"manage" | "task" | "random" | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const sync = () => setScreen(screenByPath[window.location.pathname] || "login");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const go = (next: Screen) => {
    window.history.pushState({}, "", routes[next]);
    setScreen(next);
    setModal(null);
    setNotice("");
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const topbar = (title: string, back?: Screen) => (
    <header className="topbar">
      <div>{back && <button className="link" onClick={() => go(back)}>← 返回</button>}</div>
      <strong>{title}</strong>
      <span className="prototype">LO-FI 原型</span>
    </header>
  );

  return (
    <main>
      {screen === "login" && (
        <section className="center-page">
          <div className="auth-card">
            <p className="eyebrow">班级管理系统 · 低保真原型</p>
            <h1>教师登录</h1>
            <Field label="手机号" placeholder="请输入手机号" />
            <Field label="密码" placeholder="请输入密码" />
            <button className="primary" onClick={() => go("profile")}>登录</button>
            <button className="link" onClick={() => flash("注册与重置密码页面暂以提示代替")}>注册账号 / 忘记密码</button>
          </div>
        </section>
      )}

      {screen === "profile" && (
        <section className="center-page">
          <div className="form-card">
            <Step current={1} />
            <h1>完善个人信息</h1>
            <Field label="教师姓名" placeholder="王老师" />
            <Field label="学校名称" placeholder="实验小学" />
            <Field label="管理密码" placeholder="用于切换教师管理模式" />
            <button className="primary" onClick={() => go("class")}>保存并继续</button>
          </div>
        </section>
      )}

      {screen === "class" && (
        <section className="center-page">
          <div className="form-card">
            <Step current={2} />
            <h1>创建班级</h1>
            <Field label="年级" placeholder="三年级" />
            <Field label="班号" placeholder="2" />
            <Field label="班级名称" placeholder="三年级（2）班" />
            <Field label="学年" placeholder="2026—2027" />
            <div className="actions"><button onClick={() => go("profile")}>上一步</button><button className="primary" onClick={() => go("students")}>创建班级</button></div>
          </div>
        </section>
      )}

      {screen === "students" && (
        <section className="page narrow">
          {topbar("添加学生", "class")}
          <Step current={3} />
          <div className="panel">
            <div className="panel-head"><h1>学生名单</h1><button onClick={() => flash("已新增一行学生输入框")}>＋ 添加学生</button></div>
            <div className="student-grid">{students.map((name, index) => <div className="student-row" key={name}><span>{index + 1}</span><input defaultValue={name} /><button aria-label={`删除${name}`}>×</button></div>)}</div>
            <div className="actions"><button onClick={() => flash("已识别粘贴的名单")}>批量粘贴</button><button className="primary" onClick={() => go("display")}>完成设置</button></div>
          </div>
        </section>
      )}

      {screen === "display" && (
        <section className="display-page">
          {topbar("三年级（2）班 · 教室展示模式")}
          <div className="display-hero"><div><p>8月11日 · 星期二</p><h1>上午好，同学们</h1></div><button onClick={() => setModal("manage")}>切换到教师管理模式</button></div>
          <div className="module-grid">
            {[["课堂点名", "随机抽取一名学生"], ["班级公告", "2 条公告"], ["座位表", "查看当前座位"], ["本周值日表", "查看今日安排"], ["考勤管理", "实到 38 人"], ["作业提交", "语文作业"]].map(([name, sub]) => (
              <button className="module" key={name} onClick={() => name === "本周值日表" ? go("duty-week") : flash(`${name}页面将在后续原型中补充`)}><strong>{name}</strong><span>{sub}</span></button>
            ))}
          </div>
        </section>
      )}

      {screen === "duty-week" && (
        <section className="page wide">
          {topbar("本周值日表", "display")}
          <div className="toolbar"><button>← 上一周</button><strong>8月10日—8月14日</strong><button>下一周 →</button><button onClick={() => flash("已回到本周")}>回到本周</button></div>
          <DutyTable />
          <p className="muted">最近更新：2026-08-09 18:30（教师已发布）</p>
        </section>
      )}

      {screen === "manage" && (
        <section className="page wide">
          {topbar("教师管理模式")}
          <div className="manage-head"><div><p>王老师</p><h1>三年级（2）班</h1></div><button onClick={() => go("display")}>切换到教室展示模式</button></div>
          <div className="manage-grid">
            {[["点名管理", "课堂点名与名单"], ["公告管理", "发布和删除公告"], ["值日管理", "任务与排班"], ["考勤管理", "请假和考勤"], ["作业管理", "本学科提交情况"]].map(([name, sub]) => <button className="manage-card" key={name} onClick={() => name === "值日管理" ? go("duty") : flash(`${name}功能暂未展开`)}><strong>{name}</strong><span>{sub}</span></button>)}
          </div>
          <div className="summary"><h2>今日概览</h2><p>应到 42 人　｜　实到 38 人　｜　请假 3 人　｜　迟到 1 人</p></div>
        </section>
      )}

      {screen === "duty" && (
        <section className="page duty-page">
          {topbar("值日表管理", "manage")}
          <div className="toolbar duty-tools"><div><button className="selected">手动排班</button><button onClick={() => setModal("random")}>随机排班</button></div><div><button onClick={() => flash("已撤销上一步")}>撤销</button><button onClick={() => flash("已重做")}>重做</button><button onClick={() => setModal("random")}>一键随机排班</button><button onClick={() => setModal("task")}>＋ 添加值日任务</button></div></div>
          <DutyTable editable />
          <div className="validation"><span>检查结果：缺少安排 1 处　｜　人员冲突 0 处</span><div><button onClick={() => flash("草稿已保存")}>保存草稿</button><button onClick={() => go("duty-week")}>预览展示效果</button><button className="primary" onClick={() => flash("值日表已发布")}>保存并发布</button></div></div>
        </section>
      )}

      {modal === "manage" && <Modal title="切换到教师管理模式" onClose={() => setModal(null)}><p>此模式包含管理功能，需要验证身份。</p><Field label="管理密码" placeholder="请输入管理密码" /><button className="primary" onClick={() => go("manage")}>确认切换</button></Modal>}
      {modal === "task" && <Modal title="新增值日任务" onClose={() => setModal(null)}><Field label="任务名称" placeholder="例如：扫地" /><Field label="每天需要人数" placeholder="2" /><button className="primary" onClick={() => { setModal(null); flash("值日任务已添加"); }}>保存任务</button></Modal>}
      {modal === "random" && <Modal title="随机排班" onClose={() => setModal(null)}><p>系统将按任务人数随机分配学生，并避开同日重复与请假学生。</p><label className="check"><input type="checkbox" defaultChecked /> 保留已手动安排的学生</label><button className="primary" onClick={() => { setModal(null); flash("已生成新的随机排班"); }}>开始随机排班</button></Modal>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function Step({ current }: { current: number }) {
  return <div className="steps"><span className={current >= 1 ? "on" : ""}>1 个人信息</span><span className={current >= 2 ? "on" : ""}>2 创建班级</span><span className={current >= 3 ? "on" : ""}>3 添加学生</span></div>;
}

function DutyTable({ editable = false }: { editable?: boolean }) {
  return <div className="table-wrap"><table className="duty-table"><thead><tr><th>任务 / 人数</th>{["周一 8/10", "周二 8/11", "周三 8/12", "周四 8/13", "周五 8/14"].map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{tasks.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{editable && index === 0 ? <><strong>{cell}</strong><button className="mini">编辑</button></> : cell}</td>)}</tr>)}</tbody></table></div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="panel-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</div></div>;
}
