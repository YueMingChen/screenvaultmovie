import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildHome,
  findMovie,
  loadCatalog,
  publicMovie,
  queryMovies,
  relatedMovies,
} from './lib/catalog.mjs';
import { loadEnv } from './lib/env.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_DATA_FILE = path.join(ROOT, 'data', 'movies.json');

await loadEnv(path.join(ROOT, '.env'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function imageOrigin() {
  try {
    return new URL(process.env.IMAGE_BASE || 'https://image.tmdb.org/t/p').origin;
  } catch {
    return 'https://image.tmdb.org';
  }
}

function securityHeaders() {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      `img-src 'self' ${imageOrigin()} data:`,
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message, status });
}

async function handleApi(req, res, url, dataFile) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(res, 405, '仅支持 GET 请求');
  }

  const catalog = await loadCatalog(dataFile);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      movies: catalog.movies.length,
      updatedAt: catalog.meta.updatedAt,
      source: catalog.meta.source,
    });
  }

  if (url.pathname === '/api/home') {
    return sendJson(res, 200, buildHome(catalog));
  }

  if (url.pathname === '/api/movies') {
    const params = Object.fromEntries(url.searchParams.entries());
    return sendJson(res, 200, queryMovies(catalog, params));
  }

  if (url.pathname === '/api/random') {
    if (!catalog.movies.length) return sendError(res, 404, '片库为空');
    const params = Object.fromEntries(url.searchParams.entries());
    const pool = queryMovies(catalog, { ...params, page: 1, pageSize: 1 });
    if (!pool.total) return sendError(res, 404, '没有符合筛选条件的电影');
    const page = 1 + Math.floor(Math.random() * pool.totalPages);
    const result = queryMovies(catalog, { ...params, page, pageSize: 1 });
    const item = result.items[0] || pool.items[0];
    if (!item) return sendError(res, 404, '没有符合筛选条件的电影');
    return sendJson(res, 200, { item });
  }

  const detailMatch = url.pathname.match(/^\/api\/movies\/(\d+)$/);
  if (detailMatch) {
    const movie = findMovie(catalog, detailMatch[1]);
    if (!movie) return sendError(res, 404, '没有找到这部电影');
    return sendJson(res, 200, {
      item: publicMovie(movie),
      related: relatedMovies(catalog, movie),
    });
  }

  return sendError(res, 404, '接口不存在');
}

async function serveStatic(req, res, url, publicDir = PUBLIC_DIR) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(res, 405, '仅支持 GET 请求');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendError(res, 400, '请求路径无效');
  }

  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(publicDir, `.${pathname}`);
  if (resolved !== publicDir && !resolved.startsWith(`${publicDir}${path.sep}`)) {
    return sendError(res, 403, '禁止访问');
  }

  let info;
  try {
    info = await stat(resolved);
  } catch {
    return sendError(res, 404, '页面不存在');
  }

  if (!info.isFile()) return sendError(res, 404, '页面不存在');

  const ext = path.extname(resolved).toLowerCase();
  const headers = {
    ...securityHeaders(),
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    return res.end();
  }

  res.writeHead(200, headers);
  createReadStream(resolved).pipe(res);
}

export function createAppServer({ dataFile = DEFAULT_DATA_FILE, publicDir = PUBLIC_DIR } = {}) {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, dataFile);
      } else {
        await serveStatic(req, res, url, publicDir);
      }

      if (process.env.NODE_ENV !== 'test' && !url.pathname.startsWith('/api/')) {
        res.once('finish', () => {
          if (res.statusCode >= 400) {
            console.warn(`[${res.statusCode}] ${req.method} ${url.pathname} ${Date.now() - started}ms`);
          }
        });
      }
    } catch (error) {
      console.error('Request failed:', error);
      if (!res.headersSent) {
        sendError(res, 500, '服务器出错了，请稍后再试');
      } else {
        res.end();
      }
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT) || 4173;
  const host = process.env.HOST || '127.0.0.1';
  const dataFile = process.env.DATA_FILE
    ? path.resolve(ROOT, process.env.DATA_FILE)
    : DEFAULT_DATA_FILE;

  try {
    const info = await stat(dataFile);
    if (!info.isFile()) throw new Error('not a file');
    JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    console.error(`无法读取片库数据：${dataFile}`);
    console.error(error.message);
    process.exit(1);
  }

  const server = createAppServer({ dataFile });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用，可以用 PORT=8080 npm start 换一个端口。`);
    } else {
      console.error('服务启动失败：', error);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log('');
    console.log('  银幕 SCREENVAULT');
    console.log(`  → http://${host}:${port}`);
    console.log(`  片库：${dataFile}`);
    console.log('');
  });

  const shutdown = (signal) => {
    console.log(`\n收到 ${signal}，正在关闭服务…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
