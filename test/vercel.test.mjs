import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import healthHandler from '../api/health.mjs';
import homeHandler from '../api/home.mjs';
import moviesHandler from '../api/movies/index.mjs';
import detailHandler from '../api/movies/[id].mjs';
import pingHandler from '../api/ping.mjs';
import randomHandler from '../api/random.mjs';
import { handleApiRequest } from '../lib/vercel-api.mjs';

const call = (handler, url, init) => handler.fetch(new Request(url, init));

test('Vercel functions serve health, home, search, detail and random', async () => {
  const healthResponse = await call(healthHandler, 'https://example.com/api/health');
  assert.equal(healthResponse.status, 200);
  assert.match(healthResponse.headers.get('cache-control'), /s-maxage=60/);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.runtime, 'vercel');
  assert.ok(health.movies >= 90);

  const homeResponse = await call(homeHandler, 'https://example.com/api/home');
  assert.equal(homeResponse.status, 200);
  const home = await homeResponse.json();
  assert.ok(home.hero.length > 0);
  assert.equal(home.meta.stats.total, health.movies);

  const searchResponse = await call(
    moviesHandler,
    `https://example.com/api/movies?pageSize=3&q=${encodeURIComponent('蜘蛛')}`,
  );
  const search = await searchResponse.json();
  assert.ok(search.total >= 1);
  assert.equal(search.items.length, 3);

  const id = home.hero[0].id;
  const detailResponse = await call(detailHandler, `https://example.com/api/movies/${id}`);
  const detail = await detailResponse.json();
  assert.equal(detail.item.id, id);
  assert.ok(Array.isArray(detail.related));

  const randomResponse = await call(randomHandler, 'https://example.com/api/random');
  const random = await randomResponse.json();
  assert.ok(random.item.id);
});

test('Vercel ping is independent of the catalog bundle', async () => {
  const response = await call(pingHandler, 'https://example.com/api/ping');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pong, true);
  assert.equal(body.runtime, 'vercel');
});

test('Vercel handlers return proper errors and HEAD responses', async () => {
  const missing = await call(healthHandler, 'https://example.com/api/does-not-exist');
  assert.equal(missing.status, 404);

  const head = await call(healthHandler, 'https://example.com/api/health', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-type'), /application\/json/);
  assert.equal(await head.text(), '');

  const post = await handleApiRequest(
    new Request('https://example.com/api/health', { method: 'POST' }),
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('vercel.json keeps the catalog in the function bundle', async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), 'vercel.json'), 'utf8'),
  );
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.functions['api/**/*.mjs'].includeFiles, 'data/movies.json');
  assert.match(config.headers[0].headers[0].value, /default-src 'self'/);
});
