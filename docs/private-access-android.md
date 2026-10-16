# 私人访问与 Android 返回

## 平台配置

Netlify 生产环境变量（Builds 和 Functions 作用域）：
- `FLOAT_ACCESS_KEY`：访问密钥，建议密码管理器生成较长随机值。
- `FLOAT_SESSION_SECRET`：至少 32 字符的随机字符串。
- 保留 `NEXT_PUBLIC_SELF_HOSTED_MODE=true`；它不再绕过固定密钥检查。

添加或更换后重新部署。缺少配置时关闭访问。更换任一值使全部旧会话失效。
会话为 30 天 HttpOnly、Secure、SameSite=Strict Cookie，不把密钥写进前端或 APK。
设置 → 访问授权可以退出并重新验证，不清除本地存档。

GitHub Repository secrets：`SHELL_SITE_URL`，填写完整 HTTPS 部署地址。
工作流不接受明文输入或 Variables；缺少 Secret 时仅以无效占位域名编译检查 Kotlin，随后明确停止，不打包或上传无效 APK。
签名继续沿用可选的 `SHELL_KEYSTORE_BASE64`、`SHELL_KEYSTORE_PASSWORD`、`SHELL_KEY_ALIAS`、`SHELL_KEY_PASSWORD`，不自动生成正式签名。

## 返回机制

系统返回和左缘手势共用原生 requestWebBack，优先收键盘，再调用网页 floatShellBack。
网页关闭最上层弹窗/抽屉、聊天菜单/表情/贴纸/多选/引用，触发现有可见页面返回按钮，最后交给桌面状态导航。
网页明确未处理时才尝试同源 WebView 历史；桌面、验证页、加载期间不退出。
自定义手势限左缘 20dp，排除输入框、横向滚动容器和 data-shell-swipe-ignore，垂直或多指触摸取消。
第三方 iframe/自定义应用可能只能退回桌面，需要按具体应用适配内部返回。

## 安全与数据

验证在原账号与自部署分支之前运行；所有 API 受保护，只有固定验证端点公开。
平台 Edge Function 提供分布式 IP 限流，另有进程内每分钟 5 次防护。平台计数存在短暂延迟，不能彻底抵御分布式猜测，应使用强密钥。
登录/退出校验同源并限制请求体；首页及 API 不共享缓存，SW 不缓存文档，不改 IndexedDB/localStorage。
静态素材和开源代码仍公开；共享密钥可能被转发。历史提交未重写，APK 仍含运行必需的地址。

包名保持 app.floatphone.shell，versionCode 13 / versionName 1.0.14。
历史构建 Decode keystore 为 skipped：旧 debug 包使用 runner 临时签名，无法从 APK 恢复私钥，不能保证覆盖安装。
没有固定签名时，新 debug 也使用临时签名，release 为 unsigned。不要把 unsigned 包当成可安装的正式包。
若覆盖失败，保留旧 APP，先从旧版完整导出到 APP 外，确认备份可读可导入，再确认签名与迁移；不要直接卸载或清除存储。

## 检查

运行 node scripts/check-access-control.cjs：会话篡改/过期/换钥匙/缺配置、自部署/API 绕过、Cookie 属性、限流、同源、退出与请求体限制。
运行 npm run build；全仓 TypeScript 检查与原提交对照，均有相同的 35 条历史错误，本次未新增诊断。
自动化检查覆盖 62 个受保护 API 路由模式。
运行 node scripts/check-shell-back.cjs：在确定性 DOM 适配器上检查返回优先级、去重、隐藏页面、桌面、输入和横向手势排除；不替代真机布局与触摸测试。
真机测试：聊天子页逐级返回、弹窗优先、聊天菜单/多选/引用、键盘、首页不退出、纵向滚动和横向卡片不误触，系统返回键与左缘手势一致。
验证测试：首次拦截、错误密钥、连续尝试、正确密钥、重开免输入、退出后 API 拒绝、换钥匙后旧会话失效。
安装前完整备份；安装后回归角色卡、聊天、上传下载、通知和导入导出。

## 2026-10-17 通知与性能修复

- 自部署模式通过 shellPushSupported=false 明确告知安卓壳：没有原账号云推送频道。新版壳停止这项不可用的云连接服务，移除误导性的常驻通知；前台网页通知、通话和截屏等独立服务保持原逻辑。
- 云推送配置请求改为有限超时，区别授权未完成、服务未配置和网络失败，相同状态不重复刷新通知，后台连接通知静音。
- 桌面翻页缓存本次手势宽度，按动画帧合并位移写入，取消手势不切页；移动时暂时暂停玻璃组件的实时模糊，稳定后恢复。
- 状态栏背景采样缓存最近 16 张图，共享进行中的解码，失败可重试；找到有效背景即停止继续扫描 DOM。
- 六个较大的应用改为按需加载。首次使用仍可能受网络影响，聊天和设置继续直接加载。
- 回归脚本：node scripts/check-shell-performance.cjs，另运行现有访问控制与返回分发检查。修改前后全仓 TypeScript 诊断均为 35 条，无新增。
- 真机复测：新版授权后旧错误常驻通知消失；桌面连续翻页、聊天/设置打开、返回、玻璃组件静止后恢复；首次打开大应用与第二次打开分别观察。
