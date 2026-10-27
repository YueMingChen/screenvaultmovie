# 发布到 Vercel

Vercel 版本使用「静态页面 + 一个 Serverless Function」，不需要保持 Node 进程常驻，也不需要绑定银行卡。现有本地 `npm start` 仍然可用。

## 结构

```text
public/                 静态页面、CSS、JS、TMDB logo
api/[...route].mjs      /api/* 的统一入口
lib/vercel-api.mjs      API 路由、缓存头、错误处理
lib/catalog.mjs         搜索、筛选、排序、推荐
data/movies.json        已同步的 6,781 部电影
vercel.json             build、Function、CSP 配置
```

## 发布步骤

1. 登录 **https://vercel.com**，用 GitHub 账号登录。
2. 点击 **Add New** → **Project**。
3. 选择仓库 `YueMingChen/screenvaultmovie`，点击 **Import**。
4. 按下面填写：

| 配置 | 值 |
| --- | --- |
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Install Command | 默认 |
| Environment Variables | 不需要 |

5. 点击 **Deploy**。

`vercel.json` 里已经配置了：

- Function 入口：`api/**/*.mjs`
- 把 `data/movies.json` 打包进 Function
- 新加坡 Function 区域 `sin1`
- CSP、安全响应头
- 静态文件输出目录 `public`

## 验证

部署完成后 Vercel 会给一个类似：

```text
https://screenvaultmovie.vercel.app
```

打开：

```text
https://你的地址/api/health
```

应该返回：

```json
{
  "ok": true,
  "movies": 6781,
  "source": "TMDB API",
  "runtime": "vercel"
}
```

然后检查首页、搜索、类型筛选、详情页和相关推荐。

## 常见问题

**页面能打开，但 API 500**

查看 Vercel Function Logs。通常是因为 Function 没有打包到 `data/movies.json`，确认 `vercel.json` 里的：

```json
"includeFiles": "data/movies.json"
```

**部署时报 Output Directory 不存在**

确认 Vercel 的 Output Directory 设置为 `public`，并确认仓库根目录有 `public/index.html`。

**打开很慢**

静态页面由 CDN 提供，通常很快。第一次请求 Function 可能有冷启动；数据文件约 6.3 MB，属于正常范围。

**更新片库**

本地执行：

```bash
npm run sync
npm test
git add data/movies.json
git commit -m "Update movie catalog"
git push
```

Vercel 会自动重新部署。

## 免费额度和限制

- Vercel Hobby 计划通常不需要信用卡
- 适合个人项目和非商业展示
- 不要接广告、收费或商业客户；商业用途需要相应授权
- 本项目不提供影片播放、下载或盗版片源

## 公开上线前

- TMDB 应用描述建议从 personal/local 更新为 **public non-commercial project**
- 页脚已保留 TMDB 官方 logo 和 `This product uses the TMDB API but is not endorsed or certified by TMDB.`
- Vercel 上不需要配置 `TMDB_API_KEY`；同步只在本地进行
- 不要提交 `.env`，它已在 `.gitignore` 中
