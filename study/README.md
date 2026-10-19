# 心屿 · 学习计划

个人专注与建岛应用，按标签和标题记录一轮投入。支持暂停继续、刷新恢复、终止确认、建筑详情、金币解锁、首页本周足迹和七天复盘。默认空库，不包含任务清单。完整流程和边界见 docs/product.md。

## 安装与发布

使用 tiana web init-template study --dir <新目录> 下载。读取 metadata.json，创建本次应用的 SQLite 与 Git 实例，用真实回执替换 source.json 中声明的两个占位符，执行 schema.sql。连接通过运行时 window.tiana.connection() 与动态 auth provider 取得，不写入凭据。

执行 npm ci 安装锁定依赖。按公开 Tiana Git 流程提交完整源码并推送，确认干净工作树和远端提交，再执行 node scripts/build.mjs <完整源码提交号>。构建输出 TIANA_PROJECT_PARAMS，按实际 entry、SQLite、Git 和源码提交创建或配置 Web 项目。使用 tiana web serve 预览并用 tiana web publish 发布 dist。源码静态资源 public/icon.png 会输出到 dist/icon.png，安装继承此图标。

执行 npm test 进行完成专注回归检查。预览 showcase/preview.html 可直接体验，数据只保留在本页。可自定义 src/main.js 中的 TAGS 和 BUILDINGS、src/markup.html 的文案、src/style.css 的样式。
