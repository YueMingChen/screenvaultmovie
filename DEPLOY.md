# 发布到 Render

这份说明对应仓库里的 `render.yaml`。Render 会以 Node Web Service 的方式运行现有项目，不需要改成 Serverless，也不需要把代码重写一遍。

## 发布前确认

- 项目根目录有 `package.json`、`server.mjs` 和 `data/movies.json`
- `.env` 不会被提交（已在 `.gitignore` 中）
- **Render 上不需要配置 `TMDB_API_KEY`**：网站运行时只读取本地 `data/movies.json`，不会实时调用 TMDB API。Key 只在你本地运行 `npm run sync` 时使用。
- 如果这个仓库要公开，确认数据与海报的使用符合 TMDB 的非商业开发者条款，并在页面上保留 TMDB 署名。

## 1. 把项目推到 GitHub

项目已经在本地初始化过 Git。先创建一个空的 GitHub 仓库（不要勾选自动生成 README），然后执行：

```bash
git remote add origin https://github.com/<你的GitHub用户名>/screenvault.git
git push -u origin main
```

如果还没有初始化 Git：

```bash
git init -b main
git add .
git commit -m "Initial ScreenVault"
git remote add origin https://github.com/<你的GitHub用户名>/screenvault.git
git push -u origin main
```

提交前务必检查 `.env` 没有被加入：

```bash
git status --short
git check-ignore .env
```

看到 `.env` 被忽略才继续。

## 2. 在 Render 创建服务

1. 登录 <https://dashboard.render.com>，用 GitHub 账号登录并授权仓库访问。
2. 点击 **New +** → **Blueprint**。
3. 选择刚才推送的 `screenvault` 仓库，Render 会自动读取根目录的 `render.yaml`。
4. 确认服务配置后点击 **Apply**。

`render.yaml` 已经包含：

| 配置 | 值 |
| --- | --- |
| 运行环境 | Node |
| 区域 | Singapore |
| 计划 | Free |
| 构建命令 | `npm install --no-audit --no-fund` |
| 启动命令 | `npm start` |
| 健康检查 | `/api/health` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| Node 版本 | `22.14.0` |

`HOST=0.0.0.0` 是关键：Render 需要服务监听所有网卡，不能继续监听本地的 `127.0.0.1`。

如果当前 Render 账号不支持 Blueprint 里的 `plan: free`，改为手动创建：

- New + → Web Service
- 选择仓库
- Runtime 选 Node
- Build Command：`npm install --no-audit --no-fund`
- Start Command：`npm start`
- 添加环境变量：`HOST=0.0.0.0`、`NODE_ENV=production`
- 选择 Free 计划

## 3. 第一次部署后验证

Render 会生成一个类似下面的公开地址：

```text
https://screenvault-xxxx.onrender.com
```

依次检查：

```text
https://你的地址/api/health
```

应返回类似：

```json
{"ok":true,"movies":6781,"source":"TMDB API"}
```

然后检查首页、搜索、筛选和详情页。首次访问如果遇到约一分钟的等待，这是 Render 免费实例从休眠状态启动。

如果部署失败：

- **502 / 服务不可用**：看 Render 的 Logs，确认 `HOST=0.0.0.0`
- **启动后立刻退出**：检查 `data/movies.json` 是否存在于仓库
- **页面 404**：确认 Start Command 是 `npm start`，分支是 `main`
- **数据为空**：确认 `data/movies.json` 不是 Git LFS 占位文件

## 4. 以后更新片库

本地同步：

```bash
npm run sync
npm test
```

提交并推送：

```bash
git add data/movies.json
git commit -m "Update movie catalog"
git push
```

`render.yaml` 中开启了 `autoDeployTrigger: commit`，Render 会自动重新部署。不要在公共仓库或公用电脑上提交 `.env`。

## 5. 绑定自己的域名（可选）

Render 控制台 → 你的服务 → **Settings** → **Custom Domains**：

1. 添加域名，例如 `screen.example.com`
2. 按提示在 DNS 服务商添加 CNAME，指向 Render 提供的 `xxxx.onrender.com`
3. 等待 TLS 证书自动签发

如果使用 Cloudflare，建议先把记录设为 **DNS only**，证书签发完成后再决定是否开启代理。

## 6. 免费计划的限制

- 15 分钟没有访问会休眠
- 下次访问需要约 1 分钟冷启动
- 每月有免费实例时长限制
- 不适合正式商用或高流量项目

如果你希望别人打开就能立即访问，建议升级到 Render 的付费实例，或部署到自己的 VPS。

## 7. 公开上线前的合规检查

- 你申请 TMDB Key 时填写的是个人/本地用途；公开上线后，建议把 TMDB 应用描述更新为 **public non-commercial project**，不要继续声称只在本地个人使用。
- 保持页脚署名：`This product uses the TMDB API but is not endorsed or certified by TMDB.`
- 页脚已经放置 TMDB 官方 logo 和文字署名，发布时不要移除或遮挡。
- 不要接广告、订阅或收费；这些属于商业用途，需要单独授权。
- 本站只展示元数据和海报，不提供影片播放或下载。
- 如果使用中国大陆服务器和域名，需要 ICP 备案；Render 的新加坡节点不需要 ICP，但国内访问速度取决于网络。
