import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { GET, HEAD } from '../api/[...route].mjs';
import { handleApiRequest } from '../lib/vercel-api.mjs';

test('Vercel Web Handler serves health, home, search and detail', async () => {
  const healthResponse = await GET(new Request('https://example.com/api/health'));
  assert.equal(healthResponse.status, 200);
  assert.match(healthResponse.headers.get('cache-control'), /s-maxage=60/);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.runtime, 'vercel');
  assert.ok(health.movies >= 90);

  const homeResponse = await GET(new Request('https://example.com/api/home'));
  assert.equal(homeResponse.status, 200);
  const home = await homeResponse.json();
  assert.ok(home.hero.length > 0);
  assert.equal(home.meta.stats.total, health.movies);

  const searchResponse = await GET(
    new Request(`https://example.com/api/movies?pageSize=3&q=${encodeURIComponent('蜘蛛')}`),
  );
  const search = await searchResponse.json();
  assert.ok(search.total >= 1);
  assert.equal(search.items.length, 3);

  const id = home.hero[0].id;
  const detailResponse = await GET(new Request(`https://example.com/api/movies/${id}`));
  const detail = await detailResponse.json();
  assert.equal(detail.item.id, id);
  assert.ok(Array.isArray(detail.related));

  const randomResponse = await GET(new Request('https://example.com/api/random'));
  const random = await randomResponse.json();
  assert.ok(random.item.id);
});

test('Vercel Web Handler returns proper errors and HEAD responses', async () => {
  const missing = await GET(new Request('https://example.com/api/does-not-exist'));
  assert.equal(missing.status, 404);

  const head = await HEAD(new Request('https://example.com/api/health'));
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
