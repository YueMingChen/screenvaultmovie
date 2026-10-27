import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import handler from '../api/[...route].mjs';

async function start() {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('Vercel catch-all function serves all API routes', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.runtime, 'vercel');
  assert.ok(health.movies >= 90);

  const home = await fetch(`${base}/api/home`).then((response) => response.json());
  assert.ok(home.hero.length > 0);
  assert.equal(home.meta.stats.total, health.movies);

  const list = await fetch(`${base}/api/movies?pageSize=3&q=${encodeURIComponent('蜘蛛')}`).then(
    (response) => response.json(),
  );
  assert.ok(list.total >= 1);
  assert.equal(list.items.length, 3);

  const id = home.hero[0].id;
  const detail = await fetch(`${base}/api/movies/${id}`).then((response) => response.json());
  assert.equal(detail.item.id, id);

  const random = await fetch(`${base}/api/random`).then((response) => response.json());
  assert.ok(random.item.id);

  const missing = await fetch(`${base}/api/does-not-exist`);
  assert.equal(missing.status, 404);

  const post = await fetch(`${base}/api/health`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('Vercel handler supports HEAD and cache headers', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());

  const health = await fetch(`${base}/api/health`, { method: 'HEAD' });
  assert.equal(health.status, 200);
  assert.match(health.headers.get('cache-control'), /s-maxage=60/);
  assert.match(health.headers.get('content-type'), /application\/json/);
  assert.equal(await health.text(), '');
});

test('vercel.json keeps the catalog in the function bundle', async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), 'vercel.json'), 'utf8'),
  );
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.functions['api/**/*.mjs'].includeFiles, 'data/movies.json');
  assert.match(config.headers[0].headers[0].value, /default-src 'self'/);
});
