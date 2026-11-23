// 云闲摄影 — 个人摄影作品展示站
// Node.js + Express + node:sqlite（Node 24 内置，无需原生编译）
// 启动：npm start  →  node server.js ，默认监听 3000 端口（可用 PORT 环境变量覆盖）
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 目录准备 ----------
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- 数据库 ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'site.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_banned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '其他',
    path TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);
db.exec('PRAGMA foreign_keys = ON');

// ---------- 管理员账号：首次启动时从环境变量创建，绝不写死默认密码 ----------
function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || 'admin';
  if (!email || !password) {
    console.warn('[警告] 未设置 ADMIN_EMAIL / ADMIN_PASSWORD 环境变量，未创建管理员账号。');
    console.warn('       请设置后重启，例如：ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=你的强密码 npm start');
    return;
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (exists) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(username, email, hash);
  console.log(`[启动] 管理员账号已创建：${username}（${email}），请妥善保管密码。`);
}
seedAdmin();

// ---------- 示例照片：首次启动时写入 6 条样本记录 ----------
const SAMPLE_PHOTOS = [
  { file: 'sample-1.jpg', title: '峡湾蓝调', description: '站在崖顶俯瞰峡湾，海水蓝得发亮，远山一层叠着一层。', category: '风景' },
  { file: 'sample-2.jpg', title: '云雾山路', description: '山路在云雾里拐了个弯，绿坡和灰岩被水汽泡得发亮。', category: '风景' },
  { file: 'sample-3.jpg', title: '林间飞瀑', description: '瀑布从林间跌落，水雾漫过青苔，整个山谷都是水声。', category: '风景' },
  { file: 'sample-4.jpg', title: '手冲时刻', description: '热水缓缓注进滤杯，咖啡一滴一滴落进壶里，香气先飘了出来。', category: '静物' },
  { file: 'sample-5.jpg', title: '草莓红', description: '刚摘的草莓堆在一起，红得发亮，籽上还沾着一点水珠。', category: '静物' },
  { file: 'sample-6.jpg', title: '咖啡豆', description: '一把烘好的咖啡豆摊在木板上，深浅不一，油光温润。', category: '静物' },
];
function seedSamples() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO photos (title, description, category, path, is_sample) VALUES (?, ?, ?, ?, 1)'
  );
  for (const s of SAMPLE_PHOTOS) {
    insert.run(s.title, s.description, s.category, '/seed/' + s.file);
  }
  console.log('[启动] 已载入 6 张示例照片（标记为样本，请在管理后台替换为自己的作品）。');
}
seedSamples();

// ---------- 视图与中间件 ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn('[警告] 未设置 SESSION_SECRET 环境变量，登录会话将使用临时密钥，重启后所有登录会失效。生产部署请务必设置。');
}
app.use(session({
  secret: SESSION_SECRET || ('dev-only-' + Math.random().toString(36).slice(2)),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 天
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId
    ? db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(req.session.userId)
    : null;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.session.flash = { type: 'error', text: '请先登录后再操作。' };
    return res.redirect('/login');
  }
  const user = db.prepare('SELECT id, is_banned FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.is_banned) {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).render('error', { message: '仅管理员可以访问该页面。' });
  next();
}

// ---------- 上传配置 ----------
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 单张上限 10MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('只支持 JPG / PNG / WebP / GIF 图片。'));
  },
});
const CATEGORIES = ['风光', '人文', '街头', '自然', '建筑', '夜色', '其他'];

// ---------- 公开页面 ----------
// 首页：作品墙（可按分类筛选）
app.get('/', (req, res) => {
  const category = (req.query.category || '').trim();
  const photos = category
    ? db.prepare('SELECT * FROM photos WHERE category = ? ORDER BY id DESC').all(category)
    : db.prepare('SELECT * FROM photos ORDER BY id DESC').all();
  res.render('index', { photos, categories: CATEGORIES, activeCategory: category });
});

// 作品详情：大图 +  info + 留言列表
app.get('/photo/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).render('error', { message: '没有找到这张作品。' });
  const comments = db.prepare(`
    SELECT c.*, u.username FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.photo_id = ? ORDER BY c.created_at ASC
  `).all(photo.id);
  res.render('photo', { photo, comments });
});

// 发表留言（登录用户）
app.post('/photo/:id/comments', requireLogin, (req, res) => {
  const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).render('error', { message: '没有找到这张作品。' });
  const body = (req.body.body || '').trim();
  if (!body) {
    req.session.flash = { type: 'error', text: '留言内容不能为空。' };
    return res.redirect('/photo/' + photo.id);
  }
  db.prepare('INSERT INTO comments (photo_id, user_id, body) VALUES (?, ?, ?)')
    .run(photo.id, req.session.userId, body.slice(0, 2000));
  res.redirect('/photo/' + photo.id);
});

// ---------- 注册 / 登录 / 退出 ----------
app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (username.length < 2 || username.length > 20) {
    req.session.flash = { type: 'error', text: '用户名需为 2–20 个字符。' };
    return res.redirect('/register');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.session.flash = { type: 'error', text: '请输入正确的邮箱地址。' };
    return res.redirect('/register');
  }
  if (password.length < 6) {
    req.session.flash = { type: 'error', text: '密码至少 6 位。' };
    return res.redirect('/register');
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) {
    req.session.flash = { type: 'error', text: '该用户名或邮箱已被注册。' };
    return res.redirect('/register');
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email, hash);
  req.session.userId = info.lastInsertRowid;
  res.redirect('/');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const login = (req.body.login || '').trim();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.session.flash = { type: 'error', text: '用户名/邮箱或密码不正确。' };
    return res.redirect('/login');
  }
  if (user.is_banned) {
    req.session.flash = { type: 'error', text: '该账号已被封禁，请联系管理员。' };
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  res.redirect(user.is_admin ? '/admin' : '/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- 管理后台（仅管理员） ----------
app.get('/admin', requireAdmin, (req, res) => {
  const photos = db.prepare('SELECT * FROM photos ORDER BY id DESC').all();
  const users = db.prepare('SELECT id, username, email, is_admin, is_banned, created_at FROM users ORDER BY id ASC').all();
  const comments = db.prepare(`
    SELECT c.*, u.username, p.title AS photo_title FROM comments c
    JOIN users u ON u.id = c.user_id
    JOIN photos p ON p.id = c.photo_id
    ORDER BY c.created_at DESC LIMIT 100
  `).all();
  res.render('admin', { photos, users, comments, categories: CATEGORIES });
});

// 上传新作品
app.post('/admin/photos', requireAdmin, upload.single('image'), (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : '其他';
  if (!req.file) {
    req.session.flash = { type: 'error', text: '请先选择一张图片上传。' };
    return res.redirect('/admin');
  }
  if (!title) {
    fs.unlinkSync(req.file.path);
    req.session.flash = { type: 'error', text: '请填写作品标题。' };
    return res.redirect('/admin');
  }
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
  fs.renameSync(req.file.path, path.join(UPLOAD_DIR, filename));
  db.prepare('INSERT INTO photos (title, description, category, path) VALUES (?, ?, ?, ?)')
    .run(title, description.slice(0, 1000), category, '/uploads/' + filename);
  req.session.flash = { type: 'ok', text: '作品《' + title + '》已发布。' };
  res.redirect('/admin');
});

// 编辑作品信息
app.post('/admin/photos/:id/edit', requireAdmin, (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : '其他';
  if (!title) {
    req.session.flash = { type: 'error', text: '标题不能为空。' };
    return res.redirect('/admin');
  }
  db.prepare('UPDATE photos SET title = ?, description = ?, category = ? WHERE id = ?')
    .run(title, description.slice(0, 1000), category, req.params.id);
  res.redirect('/admin');
});

// 删除作品（同时删除磁盘文件与相关留言）
app.post('/admin/photos/:id/delete', requireAdmin, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (photo) {
    db.prepare('DELETE FROM comments WHERE photo_id = ?').run(photo.id);
    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
    if (photo.path.startsWith('/uploads/')) {
      const file = path.join(UPLOAD_DIR, path.basename(photo.path));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  res.redirect('/admin');
});

// 删除任意留言
app.post('/admin/comments/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// 删除用户（同时删除其留言；管理员账号不可删）
app.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (user && !user.is_admin) {
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
  res.redirect('/admin');
});

// 封禁 / 解封用户（管理员账号不可封）
app.post('/admin/users/:id/ban', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (user && !user.is_admin) {
    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(user.is_banned ? 0 : 1, user.id);
  }
  res.redirect('/admin');
});

// ---------- 错误处理 ----------
app.use((req, res) => res.status(404).render('error', { message: '页面不存在。' }));
app.use((err, req, res, next) => {
  console.error(err);
  req.session.flash = { type: 'error', text: err.message || '服务器出错，请稍后再试。' };
  res.redirect('back');
});

app.listen(PORT, () => {
  console.log(`云闲摄影已启动：http://localhost:${PORT}`);
});
