import path from 'node:path';

import {
  buildHome,
  findMovie,
  loadCatalog,
  publicMovie,
  queryMovies,
  relatedMovies,
} from './catalog.mjs';

const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.cwd(), process.env.DATA_FILE)
  : path.join(process.cwd(), 'data', 'movies.json');

function response(status, body, cache = 'no-store', headers = {}) {
  return { status, body, cache, headers };
}

function routeFromRequest(request) {
  const url = new URL(request.url);
  const route = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean);
  return { url, route };
}

function randomMovie(catalog, params) {
  const pool = queryMovies(catalog, { ...params, page: 1, pageSize: 1 });
  if (!pool.total) return null;
  const page = 1 + Math.floor(Math.random() * pool.totalPages);
  const result = queryMovies(catalog, { ...params, page, pageSize: 1 });
  return result.items[0] || pool.items[0] || null;
}

/**
 * Shared request router for the Vercel Web Handler.
 * It takes a standard Request and returns a plain result object, which makes
 * it easy to test outside the Vercel runtime.
 */
export async function handleApiRequest(request) {
  const method = request.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return response(405, { error: '仅支持 GET 请求', status: 405 }, 'no-store', {
      Allow: 'GET, HEAD',
    });
  }

  const { url, route } = routeFromRequest(request);

  if (!route.length) {
    return response(404, { error: '接口不存在', status: 404 });
  }

  if (route[0] === 'health' && route.length === 1) {
    const catalog = await loadCatalog(DATA_FILE);
    return response(
      200,
      {
        ok: true,
        movies: catalog.movies.length,
        updatedAt: catalog.meta.updatedAt,
        source: catalog.meta.source,
        runtime: 'vercel',
      },
      'public, s-maxage=60, stale-while-revalidate=300',
    );
  }

  if (route[0] === 'home' && route.length === 1) {
    const catalog = await loadCatalog(DATA_FILE);
    return response(200, buildHome(catalog), 'public, s-maxage=60, stale-while-revalidate=300');
  }

  if (route[0] === 'movies' && route.length === 1) {
    const catalog = await loadCatalog(DATA_FILE);
    const params = Object.fromEntries(url.searchParams.entries());
    return response(200, queryMovies(catalog, params), 'public, s-maxage=60, stale-while-revalidate=300');
  }

  if (route[0] === 'movies' && route.length === 2 && /^\d+$/.test(route[1])) {
    const catalog = await loadCatalog(DATA_FILE);
    const movie = findMovie(catalog, route[1]);
    if (!movie) return response(404, { error: '没有找到这部电影', status: 404 });
    return response(
      200,
      { item: publicMovie(movie), related: relatedMovies(catalog, movie) },
      'public, s-maxage=120, stale-while-revalidate=600',
    );
  }

  if (route[0] === 'random' && route.length === 1) {
    const catalog = await loadCatalog(DATA_FILE);
    if (!catalog.movies.length) return response(404, { error: '片库为空', status: 404 });
    const params = Object.fromEntries(url.searchParams.entries());
    const item = randomMovie(catalog, params);
    if (!item) return response(404, { error: '没有符合筛选条件的电影', status: 404 });
    return response(200, { item });
  }

  return response(404, { error: '接口不存在', status: 404 });
}

export function toWebResponse(result, method = 'GET') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': result.cache,
    ...(result.headers || {}),
  };
  if (method === 'HEAD') {
    return new Response(null, { status: result.status, headers });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}
