# 魂斗罗 · 单人研究应用

使用 JSNES 2.1.0 在浏览器中运行用户提供的美版 NES 卡带，Tiana SQLite 保存三个即时存档。原版规则、关卡、画面和音乐来自本地卡带。当前验证覆盖游戏启动、输入、画面和音频生成、状态恢复及真实数据库读写；没有完成逐关通关或与原机逐帧对照，不能据此宣称百分之百的硬件一致性。

## 本地运行

要求 Node.js 22+、Tiana CLI 1.0.2+ 及已登录账号。Contra USA ROM 位于 `private/contra.nes`，构建时复制到 `dist/contra.nes`。依赖目录和构建产物由 `.gitignore` 排除。

按 `metadata.json` 将 `source.json` 中的 SQLite、Git 和 Web 占位符替换为本次应用的实际 ID，并将 Web 应用绑定到这两个实例。以下命令中的 `<web-id>` 和 `<sqlite-instance-id>` 分别填写本次应用的 Web ID 和 SQLite 实例 ID。

```sh
npm ci
npm run build
npm test
tiana web serve <web-id> --dir dist --port 4176
```

首次初始化数据库：

```sh
tiana sqlite shell <sqlite-instance-id> -f schema.sql --format json
```

先初始化数据库，再使用 CLI 显示的授权启动链接打开页面。预览仅监听本机；远程访问可通过 SSH 本地端口转发。构建会复制 ROM 到忽略的 `dist`；此目录包含游戏内容，源码仓库的许可不授予 ROM 的分发权。

## 操作

- 点击「开始游戏」，进入原版标题画面后按 Enter。
- 方向键移动和瞄准，Z 射击，X 跳跃，Enter 为原版 START。
- Esc 或界面「暂停」暂停模拟；离开页面时自动暂停。
- 手机使用屏幕方向键、A/B 和 START；支持模拟器标准手柄输入。
- 「保存」记录当前位置，已有存档的按钮标为「覆盖存档」。存档时暂停游戏，保存完成后点击「继续游戏」。
- 「读取」恢复位置并继续运行。刷新页面后可以直接读取云存档。
- 「重新开始」重启卡带，保留已保存的存档。

## 存储

`save_slots` 以 ROM SHA-256 和存档位为联合主键，保存 gzip/base64 编码的模拟器状态、画面缩略图和时间。三个存档位属于本应用绑定的数据库。同一 ROM 的进度可在页面刷新后恢复。全部列表查询限定 ROM，存档读写限定主键。

凭据由 Tiana Bootstrap 与 SDK 动态提供。SQL 写入不自动重试；连接或回执失败时通过「刷新」读取存档列表确认结果。没有将浏览器缓存作为云存档的替代存储。

## 依赖

- [JSNES](https://github.com/bfirsh/jsnes)，Apache-2.0，提供 NES 模拟。
- `@tianacloud/serverless`，连接 Tiana SQLite。
- esbuild，打包本地应用。

构建时将 JSNES AudioWorklet 提取为同源静态文件，以适配预览页面的内容策略；音频上下文固定 44100 Hz，与模拟器生成频率一致，并在暂停过程中取消过期的异步音频启动。

模拟器测试验证图像与音频生成，以及即时存档恢复后的 CPU 和画面轨迹一致性；它依赖本地 ROM，不连接云数据库。SQLite 持久化需在绑定的 Web 应用中通过保存、刷新页面和读取存档验证。

本仓库的 MIT 许可适用于应用源码，第三方依赖保持各自许可，见 `THIRD_PARTY_NOTICES.txt`。`private/contra.nes` 包含的魂斗罗游戏程序、画面和音乐不受本仓库 MIT 或 JSNES Apache-2.0 许可覆盖。
