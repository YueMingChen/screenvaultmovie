import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createAppServer } from '../server.mjs';

async function start() {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('server exposes health, home, search and detail endpoints', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.ok(health.movies >= 90);

  const home = await fetch(`${base}/api/home`).then((response) => response.json());
  assert.ok(home.hero.length > 0);
  assert.equal(home.meta.stats.total, health.movies);

  const search = await fetch(`${base}/api/movies?q=${encodeURIComponent('蜘蛛')}`).then((response) =>
    response.json(),
  );
  assert.ok(search.total >= 1);

  const id = home.trending[0].id;
  const detail = await fetch(`${base}/api/movies/${id}`).then((response) => response.json());
  assert.equal(detail.item.id, id);
  assert.ok(Array.isArray(detail.related));

  const random = await fetch(`${base}/api/random`).then((response) => response.json());
  assert.ok(random.item.id);
});

test('server returns safe errors and security headers', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');

  const missing = await fetch(`${base}/api/movies/99999999`);
  assert.equal(missing.status, 404);
  const body = await missing.json();
  assert.match(body.error, /没有找到/);

  const missingPage = await fetch(`${base}/not-a-page`);
  assert.equal(missingPage.status, 404);
});
