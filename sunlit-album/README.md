# 晴日相册

一个轻盈的个人相册：保留照片比例的照片墙、沉浸式轮播、移动端左右滑动、收藏、评论、上传及删除。

## 数据与图片

使用 Tiana Web 的 `window.tiana.files` 文件客户端与动态账号授权。原图、640px WebP 缩略图和最长边 2400px 的 WebP 预览图保存在应用自己的文件目录。SQLite 仅保存照片元信息、收藏、评论及首次导入标记。小图用于照片墙，预览图用于轮播，相邻两张图片提前加载；查看原图或下载才请求原图。

首次打开自动把六张示例图片导入文件存储。初始化标记保存在 SQLite，删除照片或清空相册后不会重新预置。照片收藏与评论由相册成员共享。上传前在浏览器生成缩略图；文件全部上传成功后保存照片元信息，失败会提示，未确认写入不自动重放。

支持浏览器可解码的 JPEG、PNG、WebP、GIF；GIF 原图保留，照片墙和轮播使用静态预览。暂不提供视频、HEIC 转码、照片编辑或回收站。删除会移除三份图片和照片评论。

## 开发

1. 创建并绑定 SQLite、Git、Web 资源，Web 入口固定为 `assets/app.js`。
2. 填写 `source.json`，在所绑定 SQLite 上执行 `schema.sql`。
3. `npm ci`，提交源码后执行 `npm run build -- <完整提交号>`。
4. 使用 `tiana web serve WEB_ID --dir dist --port 4174` 预览，或通过 `tiana web publish WEB_ID --dir dist` 托管。

运行环境必须提供 `window.tiana.files`，应用使用公共 npm SDK `@tianacloud/serverless` 连接数据库，凭据不写入工程。图片来源与许可见 `public/starter/manifest.json`；展示标题为合成文案。图像作为应用示例素材使用，不作为图库分发服务。
