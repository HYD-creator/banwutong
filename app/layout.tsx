import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "班级管理系统｜值日表低保真原型",
  description: "班级管理系统的登录、首次设置、教室展示和随机排班交互原型。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
