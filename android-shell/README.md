# Float 小手机 · 安卓壳（FloatShell）

一个极薄的安卓 App 壳：全屏 WebView 直接加载你自己的线上站点，外加一个**不依赖 Google 服务**的离线推送长连接。目标用户：安卓机上收不到 Web Push 的用户（国行机无 GMS、或所在网络到不了 Google 推送服务器）。

## 它解决什么

| 能力 | 网页版（安卓 Chrome） | 安卓壳 |
| --- | --- | --- |
| 页面功能 | ✅ | ✅ 完全一致（加载同一网页） |
| 离线推送 | 依赖 FCM（需 GMS + 能连 Google） | ✅ 自建 Supabase Realtime 长连接，无 GMS 也能收 |
| 网页更新 | 自动 | ✅ 同样自动（壳只是浏览器，部署即生效） |

推送链路：`push-generate` 边缘函数生成完离线消息后，除了发 Web Push，还会向 Supabase Realtime 的个人频道 `shellpush:<userId>` 广播一份；壳内前台服务保持一条 WebSocket 长连接订阅该频道，收到即弹系统通知。设置页的「测试」按钮走同一条链路，可直接验证。

## 一键构建（GitHub Actions）

仓库已带工作流 `.github/workflows/android-shell.yml`：

1. 在仓库 **Settings → Secrets and variables → Actions → New repository secret** 设置 `SHELL_SITE_URL`，值为自己的 HTTPS 站点地址。不要使用公开 Variables 或工作流输入。
2. 在同一页面设置 `SHELL_SIGNING_BUNDLE`，值为私下保存的签名备份 JSON 文件全文。它包含加密密钥库及密码，不能公开、截图或提交到仓库。
3. 打开 **Actions → Build Android Shell APK → Run workflow**。工作流验证固定证书后才上传 APK。
4. 下载 `float-shell-release`（正式安装包）或 `float-shell-debug`（调试包）。两者使用同一固定签名；建议后续保持使用同一种包。

## 固定签名与更新

仓库只保存公开证书指纹 `signing-certificate.sha256`。私钥由 GitHub Actions Secret 提供；缺少 Secret 或指纹不匹配时停止出包，不再退回临时签名。准备 Secret 后重新运行失败的工作流即可。

签名备份 JSON 包含 `keystoreBase64`、`storePassword`、`keyAlias`、`keyPassword`。请长期私下保管，另做安全备份，不要重新生成来覆盖它。GitHub 保存后不能直接读取 Secret；Netlify 环境变量也不会自动同步到 GitHub。

以往临时 debug 签名的安装包通常不能直接升级到固定签名。先在旧 App 的数据管理中导出完整备份，确认备份和恢复方法可用后再迁移，不要直接卸载。使用同一固定签名的后续版本才具备正常覆盖升级的条件。

## 安装与首次设置

1. 把 APK 传到手机（微信文件传输助手 / 网盘 / 数据线均可），点开安装；系统提示「未知来源」时，按系统指引允许该来源安装。
2. 打开 App，正常登录账号。
3. 允许**通知权限**（首次启动会弹）。
4. 保活（收推送的关键，尤其国产 ROM）：
   - 系统设置里把「小手机」加入**电池优化白名单 / 无限制后台**；
   - 允许**自启动**（小米/华为/OPPO/vivo 在各自的手机管家里）；
   - 最近任务里把它**锁定**（下拉卡片 → 锁），避免一键清理杀掉。
5. 通知栏会有一条「小手机 · 后台连接」的常驻小通知——这是长连接保活的代价。不想看到可以长按它 → 把「后台连接」这个通知渠道关掉显示，**不要关「角色消息」渠道**。

设置 → 离线推送里点「测试」：杀掉后台，约 6 秒后应收到系统通知即为连通。

## 数据存放与迁移

壳内网页数据（聊天记录、角色等）存在 App 自己的 WebView 沙箱里，和手机浏览器**不互通**。从浏览器搬家：

- 浏览器里 设置 → 数据管理 → **导出备份**，壳里同一入口**导入**；
- 或两边都登录同一账号，用**云端备份**过渡。

卸载 App 会清掉壳内数据，卸载前记得先导出或云备份。

## 更新模型

- **网页功能更新**：零成本。壳加载的是线上站点，网站重新部署后，壳里会加载线上最新页面。
- **APK 更新**：只有改壳本身（推送逻辑、原生能力）才需要重新构建安装，预期很少。

## 实现速览

```
android-shell/
├── app/src/main/java/app/floatphone/shell/
│   ├── MainActivity.kt   # 全屏 WebView：站内导航/外链/文件选择/下载/返回键
│   ├── PushService.kt    # 前台服务：借 WebView Cookie 取配置 → WS 长连接订阅 shellpush:<userId>
│   └── BootReceiver.kt   # 开机自启
└── ...gradle 工程
```

- 壳的 UA 追加了 ` FloatShell/<版本>`，网页可借 `window.AndroidShell` 或 UA 识别壳环境；桥上有 `getVersion()` / `openAppSettings()` / `requestIgnoreBatteryOptimization()` 三个方法。
- 推送服务首次连上后会向站点注册一条合成订阅（endpoint `shell:<userId>`），用途是让离线消息排期的「账号已订阅」门控放行；服务端对它只做 Realtime 广播，不做 Web Push 投递。
- 壳内设置页的「离线推送」开关由壳自动接管（显示为已开启且不可关），Web Push 在 WebView 里本来就不可用。

## 服务端前提

- Supabase 项目已按 `docs/push-supabase.sql` 配好离线推送（pg_cron + 边缘函数）。
- `supabase/functions/push-generate/index.ts` 需要是包含 shellpush 广播的最新版（改动后需重新部署边缘函数）。
- Realtime 广播用 service key 直接调 HTTP API，无需额外建表或改配置。

### Fixed signing certificate

CI now requires the private `SHELL_SIGNING_BUNDLE` repository Actions secret. Its
value is a JSON object containing `keystoreBase64`, `storePassword`, `keyAlias`,
and `keyPassword`. Keep its backup private; never add it to git, workflow inputs,
issues, or build artifacts. The public SHA-256 fingerprint in
`signing-certificate.sha256` pins the certificate. CI verifies both debug and
release APKs before uploading them, and refuses missing or mismatched credentials.
This replaces the earlier optional four-secret signing setup for CI.

A previously installed APK signed with an ephemeral runner debug key cannot
usually be updated with this certificate. Export all app data before migration;
do not uninstall until the backup and a way to restore it have been verified.
Future APKs signed with this same certificate retain the normal update path.

### Phone-local AI APIs

Shell 1.0.15 adds an origin-scoped `FloatLocalApi` WebMessage transport. Only the
configured HTTPS site's main frame may invoke it. Requests are limited to numeric
loopback (or localhost mapped to 127.0.0.1), AI endpoint paths and GET/POST. No
redirects, cloud proxy, website cookies, arbitrary headers or external HTTP hosts
are allowed. Replies use bounded, demand-driven chunks; abort/navigation cancels
the native call. Network security permits cleartext only on loopback. WebView
mixed-content settings remain at their secure default. Older installed shells
need an APK update to acquire this native capability; website deployment alone
cannot add it. Browser usage still requires the local API's CORS support and any
browser local-network permission.
