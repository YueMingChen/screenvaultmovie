#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENRE_MAP } from '../lib/catalog.mjs';
import { loadEnv } from '../lib/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadEnv(path.join(ROOT, '.env'));

const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(name);
}

function option(name, fallback) {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) {
    return argv[index + 1];
  }
  return fallback;
}

function positiveInt(value, fallback, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
银幕片库同步工具

用法：
  npm run sync                         同步约 80 页 × 5 个榜单
  npm run sync -- --pages 500          每个榜单最多抓取 500 页
  npm run sync:full                    抓满 TMDB 允许的全部分页
  npm run sync -- --fresh              丢弃旧片库，只保留本次结果
  npm run sync -- --out data/movies.json

参数：
  --pages <n>        每个榜单的最大页数（默认 80，最多 500）
  --concurrency <n>  并发请求数（默认 5，最多 12）
  --language <code>  TMDB 语言（默认 zh-CN）
  --region <code>    地区（默认 CN）
  --fresh            不合并旧数据
  --full             抓取各榜单的全部分页
  --out <file>       输出文件（默认 data/movies.json）
  --help             显示帮助

环境变量：
  TMDB_API_KEY       TMDB v3 Key 或 v4 Read Access Token
  TMDB_API_BASE      默认 https://api.tmdb.org/3
`);
  process.exit(0);
}

const full = hasFlag('--full');
const pages = positiveInt(option('--pages', full ? '500' : '80'), full ? 500 : 80, 500);
const concurrency = positiveInt(
  option('--concurrency', process.env.SYNC_CONCURRENCY || '5'),
  5,
  12,
);
const language = option('--language', 'zh-CN');
const region = option('--region', 'CN');
const fresh = hasFlag('--fresh');
const outFile = path.resolve(ROOT, option('--out', 'data/movies.json'));
const apiBase = (process.env.TMDB_API_BASE || 'https://api.tmdb.org/3').replace(/\/$/, '');
const apiKey = (process.env.TMDB_API_KEY || '').trim();

if (!apiKey) {
  console.error(`
缺少 TMDB_API_KEY。

1. 在 https://www.themoviedb.org/settings/api 免费申请 API Key
2. cp .env.example .env
3. 在 .env 中填入 TMDB_API_KEY
4. 再运行 npm run sync

国内网络默认使用 https://api.tmdb.org/3，通常比 api.themoviedb.org 更稳定。
`);
  process.exit(1);
}

const bearer = apiKey.startsWith('eyJ') || apiKey.split('.').length === 3;

const COLLECTIONS = [
  {
    id: 'popular',
    label: '热门电影',
    path: '/movie/popular',
  },
  {
    id: 'top_rated',
    label: '高分电影',
    path: '/movie/top_rated',
  },
  {
    id: 'now_playing',
    label: '正在上映',
    path: '/movie/now_playing',
  },
  {
    id: 'upcoming',
    label: '即将上映',
    path: '/movie/upcoming',
  },
  {
    id: 'discover',
    label: '高热度片库',
    path: '/discover/movie',
    extra: { sort_by: 'popularity.desc', 'vote_count.gte': '20', include_adult: 'false' },
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(pathname, params = {}) {
  const url = new URL(`${apiBase}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  if (!bearer) url.searchParams.set('api_key', apiKey);
  return url;
}

async function request(pathname, params = {}, label = pathname) {
  const url = buildUrl(pathname, params);
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(bearer ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) return await response.json();

      const body = await response.text().catch(() => '');
      const error = new Error(
        `TMDB 返回 ${response.status}${body ? `：${body.slice(0, 180)}` : ''}`,
      );
      error.status = response.status;

      if (response.status === 401 || response.status === 403) throw error;
      if (response.status !== 429 && response.status < 500) throw error;

      const retryAfter = Number(response.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 700 * 2 ** (attempt - 1);
      console.warn(`  ! ${label} 请求失败（${response.status}），${Math.round(wait)}ms 后重试`);
      await sleep(wait);
      lastError = error;
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      lastError = error;
      if (attempt === 4) break;
      const wait = 700 * 2 ** (attempt - 1);
      console.warn(`  ! ${label} 网络异常，${wait}ms 后重试`);
      await sleep(wait);
    }
  }

  throw lastError;
}

function normalize(result, genreMap) {
  const posterPath = result.poster_path || '';
  const backdropPath = result.backdrop_path || '';
  const genreIds = Array.isArray(result.genre_ids)
    ? result.genre_ids.map(Number).filter((id) => genreMap.has(id))
    : [];

  return {
    id: Number(result.id),
    title: result.title || result.original_title || result.name || '',
    originalTitle: result.original_title || result.title || '',
    overview: result.overview || '',
    tagline: '',
    posterPath,
    backdropPath,
    releaseDate: result.release_date || '',
    voteAverage: Number(result.vote_average) || 0,
    voteCount: Number(result.vote_count) || 0,
    popularity: Number(result.popularity) || 0,
    genreIds,
    genres: genreIds.map((id) => genreMap.get(id)),
    runtime: 0,
    country: '',
    originalLanguage: result.original_language || '',
    adult: Boolean(result.adult),
  };
}

async function fetchCollection(collection, maxPages, genreMap, stats) {
  const baseParams = {
    language,
    region,
    include_adult: 'false',
    ...collection.extra,
  };

  const first = await request(collection.path, { ...baseParams, page: 1 }, `${collection.label} 第 1 页`);
  const totalAvailable = Math.max(1, Number(first.total_pages) || 1);
  const totalPages = Math.min(maxPages, totalAvailable);
  let fetched = 1;
  let movies = first.results || [];

  console.log(
    `\n▸ ${collection.label}：计划 ${totalPages} 页（TMDB 共 ${totalAvailable} 页）`,
  );

  let nextPage = 2;
  async function worker() {
    while (nextPage <= totalPages) {
      const page = nextPage;
      nextPage += 1;
      try {
        const payload = await request(
          collection.path,
          { ...baseParams, page },
          `${collection.label} 第 ${page} 页`,
        );
        movies = movies.concat(payload.results || []);
        fetched += 1;
        if (fetched % 25 === 0 || fetched === totalPages) {
          console.log(`  · ${collection.label} ${fetched}/${totalPages} 页`);
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        console.warn(`  ! ${collection.label} 第 ${page} 页跳过：${error.message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, totalPages - 1)) }, () => worker()),
  );

  const normalized = movies
    .map((movie) => normalize(movie, genreMap))
    .filter((movie) => movie.id && movie.title && !movie.adult);

  stats[collection.id] = {
    label: collection.label,
    pages: fetched,
    records: normalized.length,
  };

  console.log(`  ✓ ${collection.label}：${normalized.length} 条记录`);
  return normalized;
}

async function readExisting() {
  if (fresh) return null;
  try {
    const payload = JSON.parse(await readFile(outFile, 'utf8'));
    if (!Array.isArray(payload.movies)) return null;
    // 第一次同步时，用真实 API 数据替换演示片库。
    if (payload.meta?.demo) {
      console.log('检测到演示片库，本次同步将替换为 TMDB API 数据。');
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  console.log('');
  console.log('  银幕 · TMDB 片库同步');
  console.log(`  API：${apiBase}`);
  console.log(`  语言：${language}    地区：${region}`);
  console.log(`  每榜最多 ${pages} 页    并发 ${concurrency}`);
  console.log('');

  let genreEntries = Object.entries(GENRE_MAP).map(([id, name]) => ({ id: Number(id), name }));
  try {
    const genrePayload = await request('/genre/movie/list', { language }, '类型列表');
    if (Array.isArray(genrePayload.genres) && genrePayload.genres.length) {
      genreEntries = genrePayload.genres;
    }
  } catch (error) {
    console.warn(`类型列表获取失败，使用内置类型表：${error.message}`);
  }
  const genreMap = new Map(genreEntries.map((genre) => [Number(genre.id), genre.name]));

  const existing = await readExisting();
  const merged = new Map();
  if (existing) {
    for (const movie of existing.movies) merged.set(Number(movie.id), movie);
    console.log(`已载入旧片库 ${existing.movies.length} 部，将合并去重。`);
  }

  const stats = {};
  let newRecords = 0;

  for (const collection of COLLECTIONS) {
    const movies = await fetchCollection(collection, pages, genreMap, stats);
    newRecords += movies.length;
    for (const movie of movies) merged.set(movie.id, movie);
  }

  const movies = [...merged.values()].filter((movie) => movie.title && movie.id);
  movies.sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0));

  const payload = {
    meta: {
      source: 'TMDB API',
      sourceUrl: 'https://www.themoviedb.org',
      updatedAt: new Date().toISOString(),
      language,
      region,
      count: movies.length,
      demo: false,
      pages,
      collections: stats,
      genres: genreEntries,
    },
    movies,
  };

  const json = JSON.stringify(payload);
  await mkdir(path.dirname(outFile), { recursive: true });
  const tempFile = `${outFile}.tmp`;
  await writeFile(tempFile, json, 'utf8');
  await rename(tempFile, outFile);

  console.log('');
  console.log('  ─────────────────────────────');
  console.log(`  ✓ 完成：${movies.length} 部电影`);
  console.log(`  · 本次抓取 ${newRecords} 条，去重后写入 ${movies.length} 条`);
  console.log(`  · 文件：${outFile}`);
  console.log(`  · 大小：${formatBytes(Buffer.byteLength(json))}`);
  console.log(`  · 刷新网页即可看到新片库`);
  console.log('');
}

main().catch((error) => {
  console.error('\n同步失败：', error.message);
  if (error.status === 401 || error.status === 403) {
    console.error('请检查 TMDB_API_KEY 是否正确、是否已通过邮箱验证。');
  }
  process.exit(1);
});
