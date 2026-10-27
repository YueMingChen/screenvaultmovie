import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildHome,
  findMovie,
  loadCatalog,
  publicMovie,
  queryMovies,
  relatedMovies,
} from '../lib/catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'movies.json');

test('catalog loads and normalizes the movie library', async () => {
  const catalog = await loadCatalog(DATA_FILE);
  assert.ok(catalog.movies.length >= 90);
  assert.equal(catalog.stats.total, catalog.movies.length);
  assert.ok(catalog.genreCounts.length >= 10);
  assert.ok(catalog.genreCounts.every((genre) => Number.isInteger(genre.id)));
  assert.ok(catalog.movies.every((movie) => movie.title));
  assert.ok(catalog.movies.filter((movie) => movie.posterUrl).length / catalog.movies.length > 0.9);
  assert.ok(catalog.movies.every((movie) => !('searchText' in publicMovie(movie))));
});

test('query filters by Chinese keyword and keeps the full result count', async () => {
  const catalog = await loadCatalog(DATA_FILE);
  const result = queryMovies(catalog, { q: '蜘蛛', pageSize: 5 });
  assert.ok(result.total >= 1);
  assert.ok(result.items.some((movie) => movie.title.includes('蜘蛛')));
  assert.ok(result.items.length <= 5);
});

test('query supports genre, rating, decade and rating sort', async () => {
  const catalog = await loadCatalog(DATA_FILE);

  const action = queryMovies(catalog, { genre: 28, pageSize: 60 });
  assert.ok(action.total > 0);
  assert.ok(action.items.every((movie) => movie.genreIds.includes(28)));

  const highRated = queryMovies(catalog, { rating: 8, sort: 'rating', pageSize: 60 });
  assert.ok(highRated.total > 0);
  assert.ok(highRated.items.every((movie) => movie.voteAverage >= 8));
  for (let i = 1; i < highRated.items.length; i += 1) {
    assert.ok(highRated.items[i - 1].voteAverage >= highRated.items[i].voteAverage);
  }

  const nineties = queryMovies(catalog, { decade: '1990s', pageSize: 60 });
  assert.ok(nineties.total > 0);
  assert.ok(nineties.items.every((movie) => movie.year >= 1990 && movie.year <= 1999));
});

test('pagination is stable and empty searches are handled', async () => {
  const catalog = await loadCatalog(DATA_FILE);
  const first = queryMovies(catalog, { page: 1, pageSize: 10 });
  const second = queryMovies(catalog, { page: 2, pageSize: 10 });
  assert.equal(first.total, second.total);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(first.items.length, 10);
  assert.equal(first.hasMore, true);

  const empty = queryMovies(catalog, { q: '绝对不存在的电影关键词zzzz' });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);
});

test('home payload exposes hero, rails and genre metadata', async () => {
  const catalog = await loadCatalog(DATA_FILE);
  const home = buildHome(catalog);
  assert.ok(home.hero.length >= 1);
  assert.ok(home.hero.length <= 6);
  assert.ok(home.trending.length > 0);
  assert.ok(home.topRated.length > 0);
  assert.ok(home.fresh.length > 0);
  assert.equal(home.meta.stats.total, catalog.movies.length);
  assert.ok(home.genres.every((genre) => Number.isInteger(genre.id)));

  const movie = findMovie(catalog, home.hero[0].id);
  assert.equal(movie.id, home.hero[0].id);
  assert.ok(relatedMovies(catalog, movie, 6).length <= 6);
});
