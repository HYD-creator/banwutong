# 班务通｜班级管理系统

面向班主任的电脑端班级管理系统。当前版本已从纯前端原型升级为可持久化运行的前后端项目。

## 技术结构

- 前端：原生 HTML、CSS、JavaScript，适合教师电脑与教室大屏
- 后端：Node.js 原生 HTTP 服务
- 数据库：SQLite（单文件存储，启用 WAL）
- 登录：手机号和密码；密码使用 scrypt 加盐哈希
- 会话：HttpOnly、SameSite Cookie
- Excel：组件随项目安装，不依赖境外 CDN

SQLite 不依赖外部数据库服务，适合学校内网、国内云服务器或单机部署。后续数据规模扩大时，可以再迁移到 MySQL/PostgreSQL。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run server
```

浏览器访问 `http://localhost:4174`。首次使用时，在登录页填写手机号和至少 6 位密码，然后点击“立即注册”。

## Docker 部署

```bash
docker compose up -d --build
```

数据库保存在项目的 `data/class-manager.sqlite`。备份时复制该文件即可；服务运行中备份时，应同时保留同目录下可能出现的 `-wal` 和 `-shm` 文件，或先停止服务。

## 现有后端接口

- `GET /api/health`：健康检查
- `POST /api/auth/register`：教师注册
- `POST /api/auth/login`：教师登录
- `POST /api/auth/logout`：退出登录
- `GET /api/auth/me`：查询会话
- `GET /api/state`：读取当前教师的班级数据
- `PUT /api/state`：保存当前教师的班级数据
- `DELETE /api/account`：注销教师账号并删除关联数据

## 国内部署建议

- 校内使用：部署在学校局域网中的一台常开电脑或服务器。
- 互联网使用：部署在阿里云、腾讯云、华为云等中国大陆服务器；对公网提供服务时需按实际域名和地区完成备案及 HTTPS 配置。
- 生产环境建议在应用前放置 Nginx，并启用 HTTPS、访问日志和每日数据库备份。
