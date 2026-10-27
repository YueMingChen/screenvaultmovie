# 银幕 SCREENVAULT

一个可以直接在本地运行的中文电影发现站。深色电影资料馆式界面，支持热度榜、筛选、搜索、随机选片和本地片单；数据来自 TMDB；当前片库已同步 6,781 部电影，并支持随时扩充。

![银幕首页预览](docs/preview.jpg)

## 发布到公网

项目内置了 Render 部署配置（`render.yaml`），可以按 [DEPLOY.md](DEPLOY.md) 发布成一个公开的 HTTPS 网站。Render 上不需要配置 TMDB Key，运行时只读取已同步好的 `data/movies.json`。

## 立即运行

需要 **Node.js 18.17+**，不需要安装任何 npm 依赖。

```bash
npm start
```

打开 <http://127.0.0.1:4173>。

当前 `data/movies.json` 已经同步了 6,781 部真实电影数据。要扩充到更多影片，重新运行同步脚本即可；片库规模只受 TMDB 分页和你的同步页数限制。

## 抓取大量电影

### 1. 申请 TMDB Key

在 <https://www.themoviedb.org/settings/api> 免费申请 API Key（v3 Key 或 v4 Read Access Token 都可以）。

### 2. 配置

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
TMDB_API_KEY=你的_key
TMDB_API_BASE=https://api.tmdb.org/3
```

> 国内网络建议保留默认的 `api.tmdb.org`，它通常比 `api.themoviedb.org` 更容易连接。海外环境可以改成 `https://api.themoviedb.org/3`。

### 3. 同步

```bash
# 默认：5 个榜单 × 最多 80 页，通常可得到数千部去重后的电影
npm run sync

# 更大量：每个榜单最多抓 500 页，通常可以上万部
npm run sync -- --pages 500

# 抓满 TMDB 允许的分页
npm run sync:full
```

同步完成后刷新网页即可。服务端会检测数据文件的修改时间，不需要重启。

常用参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--pages <n>` | `80` | 每个榜单最多抓取多少页，最大 500 |
| `--concurrency <n>` | `5` | 并发请求数，最大 12 |
| `--fresh` | 关闭 | 丢弃旧片库，只保留本次结果 |
| `--language <code>` | `zh-CN` | TMDB 返回语言 |
| `--region <code>` | `CN` | 上映地区 |
| `--out <file>` | `data/movies.json` | 输出文件 |
| `--help` | — | 查看全部参数 |

同步会合并 5 个数据源并去重：

- 热门电影 `movie/popular`
- 高分电影 `movie/top_rated`
- 正在上映 `movie/now_playing`
- 即将上映 `movie/upcoming`
- 高热度片库 `discover/movie`

数据只包含电影元数据（片名、简介、评分、类型、海报路径等），不包含、也不提供影片播放。

## 功能

- **焦点轮播**：从近期热门中挑选 5 部电影，自动轮播并支持手动切换。
- **三个榜单**：热度、高分、新片，可横向浏览。
- **大量片库**：分页接口 + “加载更多”，最多支持数万条数据。
- **组合筛选**：类型、年代、最低评分、排序方式，条件会同步到 URL。
- **即时搜索**：中文片名、原名、简介、类型都可以匹配。
- **详情页**：大图背景、评分、类型、片长、地区、相关推荐。
- **我的片单**：收藏 / 看过两个列表，保存在浏览器 `localStorage`。
- **随机选片**：全库随机，或在当前筛选结果里“手气不错”。
- **响应式**：桌面六列海报墙，移动端双列 + 底部导航。

## 项目结构

```text
.
├── server.mjs                 # 零依赖 Node HTTP 服务和 API
├── lib/
│   ├── catalog.mjs            # 数据标准化、搜索、筛选、排序、推荐
│   └── env.mjs                # 极简 .env 读取
├── scripts/
│   └── sync-tmdb.mjs          # TMDB 批量抓取与去重合并
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   └── movies.json            # 当前片库（TMDB 同步结果）
├── test/
│   ├── catalog.test.mjs
│   └── server.test.mjs
└── .env.example
```

## HTTP API

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 服务状态和片库数量 |
| `GET /api/home` | 首页焦点、榜单、类型、统计 |
| `GET /api/movies` | 分页、搜索、筛选、排序 |
| `GET /api/movies/:id` | 电影详情 + 相关推荐 |
| `GET /api/random` | 随机一部，可带筛选参数 |

`/api/movies` 支持的参数：

```text
q=关键词
genre=28
decade=2020s       # 或 classic（1990 年前）
rating=7.5
sort=popular       # popular | rating | newest | votes
page=1
pageSize=18        # 最大 60
```

示例：

```bash
curl 'http://127.0.0.1:4173/api/movies?genre=878&rating=7&sort=rating'
curl 'http://127.0.0.1:4173/api/movies?q=蜘蛛'
```

## 开发与测试

```bash
npm run dev     # 文件变化时自动重启服务
npm test        # 数据层 + HTTP 接口测试
```

项目没有前端构建步骤，也没有第三方运行时依赖。修改 `public/` 下的文件后刷新页面即可。

## 数据与版权

- 电影元数据和海报来自 [The Movie Database (TMDB)](https://www.themoviedb.org)。
- 本项目不存储、不转码、不提供任何影片播放源。
- 使用 TMDB API 时请遵守其[服务条款](https://www.themoviedb.org/documentation/api/terms-of-use)和署名要求；页脚已包含官方 logo 与署名文案。
- 本站文案中的英文署名：*This product uses the TMDB API but is not endorsed or certified by TMDB.*

## 常见问题

**页面打开是空的？**

确认 `data/movies.json` 存在，并且执行 `npm start` 的终端没有报错。可以访问 `/api/health` 检查服务状态。

**`npm run sync` 报 401？**

Key 不正确、未通过邮箱验证，或者把 v4 Token 填到了错误的字段。脚本会自动识别 `eyJ` 开头的 v4 Token。

**抓取很慢或中途失败？**

降低并发：`npm run sync -- --concurrency 3`。脚本会跳过个别失败页并保留已抓取的数据，也可以稍后再次运行增量合并。

**如何换成自己的端口？**

```bash
PORT=8080 npm start
```
