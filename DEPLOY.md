# 班务通部署说明

## 服务器要求

- 中国大陆可访问的 Linux 服务器
- Docker 与 Docker Compose
- 建议配置域名和 HTTPS
- 若服务器位于中国大陆，公网域名通常需要完成 ICP 备案

## 启动

```bash
docker compose up -d --build
```

默认访问地址为 `http://服务器IP:4174`。正式使用时建议用 Nginx 反向代理到该端口，并配置 HTTPS。

## 数据与备份

- 数据库：`./data/class-manager.sqlite`
- 自动备份：`./data/backups/`
- 系统每日保留一份 SQLite 备份，最多保留 7 天
- 教师还可在“个人信息”中下载或恢复自己的班级数据

服务器迁移时必须一并备份 `data` 目录。

## 短信验证码

忘记密码的真实短信能力需要短信服务商账号、已审核签名和模板。在完成服务商配置前，不应将演示验证码用于正式环境。
