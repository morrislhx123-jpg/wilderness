# AI自媒体内容生产线展示网站

这是一个纯静态的一页式展示网站，适合直接放到 GitHub Pages。

## 本地预览

直接打开 `index.html` 即可预览。

如果希望模拟线上访问，也可以在当前目录启动一个本地静态服务。

当前本机预览地址：

```text
http://127.0.0.1:4173
```

## 后续替换

- 演示视频：当前使用压缩后的视频 `assets/ai-media-demo.mp4`。新版视频做好后，替换同名文件即可。
- 联系方式：当前使用 `assets/wechat-qr.jpg` 作为底部微信二维码。
- 案例数据：如果后续有更强客户案例，可以优先替换“为什么是 Morris”区域的数据。

## GitHub Pages

建议新建一个公开仓库，把本目录里的文件上传到仓库根目录，然后在仓库的 `Settings -> Pages` 里选择从 `main` 分支部署。

如果仓库名是 `ai-media-system`，发布后的地址通常是：

```text
https://你的GitHub用户名.github.io/ai-media-system/
```

注意：GitHub 不适合直接放很大的视频文件。当前网页用的是约 13MB 的压缩版视频，适合先做展示；如果未来视频更高清或更长，建议上传到视频平台或对象存储，再在页面里嵌入链接。

## 从零上传到 GitHub Pages

1. 登录 GitHub，新建一个公开仓库，例如 `ai-media-system-site`。
2. 把本目录里的 `index.html`、`styles.css`、`README.md` 和 `assets` 文件夹上传到仓库根目录。
3. 打开仓库的 `Settings -> Pages`。
4. 在 `Build and deployment` 中选择 `Deploy from a branch`。
5. 分支选择 `main`，目录选择 `/root`，保存。
6. 等 1-3 分钟，GitHub 会给出一个公开访问地址。
