# 部署说明（服务器 124.221.222.190）

> 版本 v1.0.0 · 部署日期 2026-10-28

## 访问地址

**http://124.221.222.190/kaoyan/**

无需登录（本项目自身无鉴权），直接打开即可使用。

## 部署架构

服务器上原本已运行「股票宏观分析系统」，80/443 由 Caddy 独占。本项目以**子路径**方式挂载，两者互不干扰：

```
Caddy (80 / 443)
├── /kaoyan/*        → 静态文件  /var/www/kaoyan-progress     ← 本项目
└── /*（其余）        → basic_auth + 反代 127.0.0.1:5000      ← 股票系统（未改动）
```

用 Caddy 的 `handle` 互斥分组实现：`/kaoyan/*` 命中后立即终止，不会再落到 `basic_auth`。

## 服务器上的目录

| 路径 | 用途 |
|------|------|
| `/var/www/kaoyan-progress/` | 站点实际文件（www-data 所有） |
| `/home/ubuntu/kaoyan-progress/update.sh` | 一键更新脚本 |
| `/home/ubuntu/kaoyan-progress/upload.tar.gz` | 待部署的更新包 |
| `/home/ubuntu/kaoyan-progress/backups/` | 每次更新前的自动备份 |
| `/home/ubuntu/kaoyan-progress/releases/` | 按时间戳留存的历史版本 |
| `/etc/caddy/kaoyan.conf` | 本项目路由配置（被 Caddyfile import） |
| `/etc/caddy/Caddyfile.bak.20261028005252` | 本次改动前的 Caddyfile 备份 |

## 更新流程

### 1. 本地构建（必须是 /kaoyan/ 前缀）

```bash
cd "C:\Users\17412\Desktop\Mrshock的考研之旅\study-progress-app"
MSYS_NO_PATHCONV=1 npx vite build --base=/kaoyan/
```

> **`MSYS_NO_PATHCONV=1` 不能省**。Git Bash 会把 `/kaoyan/` 当成 Unix 路径改写成
> `/workbuddy/resources/vendor/PortableGit/kaoyan/`，导致资源 404。

### 2. 打包并上传

```bash
tar -czf /tmp/kaoyan-dist.tar.gz -C dist .
scp -P 22 /tmp/kaoyan-dist.tar.gz ubuntu@124.221.222.190:/home/ubuntu/kaoyan-progress/upload.tar.gz
```

### 3. 服务器上执行更新

```bash
ssh ubuntu@124.221.222.190
sudo bash /home/ubuntu/kaoyan-progress/update.sh
```

脚本会自动：备份当前版本 → 解压新版本 → 原子切换 → 健康检查 → 失败则回滚。

## 常用运维命令

```bash
# 看 Caddy 状态
sudo systemctl status caddy

# 改完配置先校验，通过再 reload（reload 不断开现有连接）
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy

# 回滚到某个备份
sudo rm -rf /var/www/kaoyan-progress
sudo mkdir -p /var/www/kaoyan-progress
sudo tar -xzf /home/ubuntu/kaoyan-progress/backups/site-<时间戳>.tar.gz -C /var/www/kaoyan-progress
sudo chown -R www-data:www-data /var/www/kaoyan-progress
```

## 注意事项

1. **不要动 Caddyfile 里 `:80 {}` 和 `https://124.221.222.190 {}` 之外的 macro_app 片段定义** —— 那是股票系统的配置。
2. 本项目**纯前端**，所有数据存在**用户浏览器本地**（localStorage + IndexedDB）。服务器只存静态文件，**不存任何用户数据**。换设备/换浏览器，数据不会同步，需要先在应用内「数据备份 → 导出」再导入。
3. AI 功能区需要用户在页面上填自己的 API Key，Key 存在各自浏览器里，服务器不接触。
4. 资源路径与 `/kaoyan/` 前缀绑定。若将来改到根路径或独立域名，必须重新用新的 `--base` 构建，否则会白屏。
5. 服务器无域名，443 用的是 Caddy 自签证书（`tls internal`），浏览器会提示不安全 —— 这也是推荐用 http 80 的原因。

## 与原股票系统的关系

本次部署**未修改** `macro_app` 片段、`stock-web.service`、`stock-scheduler.service` 的任何内容，仅在两个 site block 内各包了一层 `handle`。

验证结果：Caddy 自 2026-10-18 起持续运行未重启（本次为 reload 平滑重载），`/` 仍返回 401（basic_auth 正常拦截），股票系统访问方式与之前完全一致。