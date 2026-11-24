# 云闲摄影（纯静态版）

个人摄影作品展示网站，纯静态，无后台、无注册、无留言。

## 网站内容

- 首页作品墙：风景 / 静物分类筛选，点击照片看大图（灯箱支持左右切换、Esc 关闭）
- 6 张示例照片：3 张风景（峡湾、山路、瀑布）+ 3 张静物（手冲咖啡、草莓、咖啡豆），标记为示例，请替换为自己的作品

## 文件说明

- `index.html`：首页（作品墙 + 灯箱）
- `photos.js`：照片数据（标题、分类、说明、路径）
- `public/style.css`：样式
- `public/seed/`：6 张示例照片
- `public/photos/`：以后放自己的照片（新建文件夹即可）

## 本地预览

```bash
python3 -m http.server 8000
```

然后打开 http://localhost:8000

## 添加自己的照片

1. 把照片放进 `public/photos/`
2. 在 `photos.js` 里加一行：

```js
{ src: 'public/photos/你的照片.jpg', title: '标题', category: '风景', desc: '一句话介绍' },
```

3. 提交到 GitHub，Altare 会自动重新部署

## 部署（Altare）

Altare 控制台 → 新建应用 → 选择 GitHub 仓库 `yunxian-photography` → 运行方式选 Static → 部署。无需环境变量。

## 注意事项

- Altare 免费档磁盘是临时的，照片文件以 GitHub 仓库为准，仓库里的文件不会丢；不要只把照片存在服务器上。
