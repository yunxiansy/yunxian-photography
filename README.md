# 云闲摄影

个人摄影作品展示站：发布作品、访客注册留言、管理员后台管理。

- **首页**：作品墙（响应式网格，支持按分类筛选），点击进入作品详情
- **作品详情**：大图、标题、说明、发布日期、留言列表；登录用户可留言
- **用户**：注册 / 登录 / 退出，密码经 bcrypt 哈希存储；封禁用户无法登录
- **管理后台**（`/admin`，仅管理员）：上传作品、编辑/删除作品、删除任意留言、管理用户（删除 / 封禁）

技术栈：Node.js + Express + SQLite（Node 24 内置 `node:sqlite`，无需原生编译）+ EJS 服务端渲染，无前端构建步骤。

## 本地运行

```bash
npm install
ADMIN_EMAIL=你的邮箱 ADMIN_PASSWORD=你的强密码 SESSION_SECRET=任意随机字符串 npm start
```

然后打开 http://localhost:3000

- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：首次启动时据此创建管理员账号（用户名默认为 `admin`，可用 `ADMIN_USERNAME` 另行指定）。**站内没有写死任何默认管理员密码**；如果不设这两个变量，启动时会打印警告，且不创建管理员。
- `SESSION_SECRET`：登录会话密钥，不设也能跑，但重启后登录会失效，生产部署请务必设置。
- `PORT`：监听端口，默认 3000。

数据与文件：

- SQLite 数据库：`./data/site.db`（首次启动自动创建）
- 上传的作品图片：`./uploads/`（通过 `/uploads/...` 访问）
- 示例照片：`./public/seed/`（随代码进仓库）

## 管理员账号说明

- 管理员用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登录，登录后自动进入 `/admin`。
- 管理员拥有全部权限：发布/编辑/删除作品、删除任意留言、删除用户、封禁/解封用户。管理员账号本身不可删除、不可封禁。
- 如果忘记管理员密码：删除 `./data/site.db` 会清空全部数据并重建（慎用），或直接用 sqlite3 打开数据库修改 `users` 表。

## 替换示例照片

首次启动时，网站自带 6 张示例照片（来自 picsum.photos，标题分别为「山间晨雾」「街角的光」「湖畔黄昏」「窗边的猫」「城市夜色」「林间小径」），在后台和页面上都标有「示例」。

替换方法（二选一）：

1. **推荐**：登录管理员账号，在 `/admin` 上传自己的作品，然后在「作品管理」里逐一删除 6 张示例照片。
2. 直接把 `./public/seed/` 下的图片换成自己的同名文件，并修改 `server.js` 里 `SAMPLE_PHOTOS` 的标题与说明（仅在数据库为空时生效；已有数据时需先删 `data/site.db` 再重启）。

## 部署到 Altare

Altare 免费档支持从 GitHub 仓库部署 Node.js 应用。

1. 把本项目推送到 GitHub 仓库（`data/`、`uploads/`、`node_modules/` 已在 `.gitignore` 中，不会进仓库）。
2. 打开 Altare 控制台（console.altare.gg）→ 创建应用 → 选择 **GitHub repository**，选中该仓库。
3. 在应用的环境变量（Variables / Environment）里设置：
   - `ADMIN_EMAIL`：管理员邮箱
   - `ADMIN_PASSWORD`：管理员密码（强密码）
   - `SESSION_SECRET`：任意随机长字符串
4. 点 Deploy 部署。Altare 会自动识别 Node.js 并执行 `npm start`。
5. 部署完成后访问分配的域名（如 `xxx.go.altare.global`），用管理员账号登录 `/admin` 上传作品。

注意事项：

- 免费档的磁盘是临时的，**不要把作品照片只存在服务器上**：`uploads/` 和 `data/site.db` 在重新部署或实例回收后可能丢失。正式使用前请定期备份，或把图片改存到对象存储。
- 示例照片随仓库部署，可随时在后台删除替换。
