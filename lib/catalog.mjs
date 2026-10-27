import { stat, readFile } from 'node:fs/promises';

export const GENRE_MAP = Object.freeze({
  28: '动作',
  12: '冒险',
  16: '动画',
  35: '喜剧',
  80: '犯罪',
  99: '纪录',
  18: '剧情',
  10751: '家庭',
  14: '奇幻',
  36: '历史',
  27: '恐怖',
  10402: '音乐',
  9648: '悬疑',
  10749: '爱情',
  878: '科幻',
  10770: '电视电影',
  53: '惊悚',
  10752: '战争',
  37: '西部',
});

const SORTS = new Set(['popular', 'rating', 'newest', 'votes']);
const MAX_PAGE_SIZE = 60;

let cache = null;

function text(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function imageUrl(path, size) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.IMAGE_BASE || 'https://image.tmdb.org/t/p').replace(/\/$/, '');
  return `${base}/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

function yearOf(movie) {
  const explicit = Number(movie.year);
  if (Number.isInteger(explicit) && explicit > 1800) return explicit;
  const fromDate = String(movie.releaseDate || '').slice(0, 4);
  const parsed = Number(fromDate);
  return Number.isInteger(parsed) && parsed > 1800 ? parsed : null;
}

function enrichMovie(raw, genreMap) {
  const genreIds = Array.isArray(raw.genreIds)
    ? raw.genreIds.map(Number).filter((id) => genreMap.has(id))
    : [];
  const providedGenres = Array.isArray(raw.genres)
    ? raw.genres.filter((genre) => typeof genre === 'string' && genre.trim())
    : [];
  const genres = providedGenres.length
    ? [...new Set(providedGenres.map((genre) => genre.trim()))]
    : [...new Set(genreIds.map((id) => genreMap.get(id)))];

  const title = String(raw.title || raw.name || '').trim();
  if (!title) return null;

  const releaseDate = String(raw.releaseDate || '').slice(0, 10);
  const year = yearOf(raw) || (releaseDate ? Number(releaseDate.slice(0, 4)) : null);
  const originalTitle = String(raw.originalTitle || raw.original_title || title).trim();
  const country = Array.isArray(raw.country)
    ? raw.country.filter(Boolean).join(' / ')
    : String(raw.country || '').trim();

  const movie = {
    id: Number(raw.id),
    title,
    originalTitle,
    overview: String(raw.overview || '').trim(),
    tagline: String(raw.tagline || '').trim(),
    posterPath: String(raw.posterPath || raw.poster_path || ''),
    backdropPath: String(raw.backdropPath || raw.backdrop_path || ''),
    releaseDate,
    year,
    decade: year ? Math.floor(year / 10) * 10 : null,
    voteAverage: Math.round(toNumber(raw.voteAverage ?? raw.vote_average) * 10) / 10,
    voteCount: Math.max(0, Math.round(toNumber(raw.voteCount ?? raw.vote_count))),
    popularity: toNumber(raw.popularity),
    genreIds,
    genres,
    runtime: Math.max(0, Math.round(toNumber(raw.runtime))),
    country,
    originalLanguage: String(raw.originalLanguage || raw.original_language || ''),
    adult: Boolean(raw.adult),
  };

  movie.posterUrl = raw.posterUrl || imageUrl(movie.posterPath, 'w500');
  movie.backdropUrl = raw.backdropUrl || imageUrl(movie.backdropPath, 'w1280');
  movie.score = movie.voteAverage;
  movie.searchText = text(
    [
      movie.title,
      movie.originalTitle,
      movie.overview,
      movie.country,
      movie.year,
      ...movie.genres,
    ].join(' '),
  );

  return movie;
}

function sortMovies(movies, sort) {
  const list = [...movies];
  switch (sort) {
    case 'rating':
      return list.sort(
        (a, b) =>
          b.voteAverage - a.voteAverage ||
          b.voteCount - a.voteCount ||
          b.popularity - a.popularity,
      );
    case 'newest':
      return list.sort(
        (a, b) =>
          String(b.releaseDate).localeCompare(String(a.releaseDate)) ||
          b.popularity - a.popularity,
      );
    case 'votes':
      return list.sort((a, b) => b.voteCount - a.voteCount || b.voteAverage - a.voteAverage);
    case 'popular':
    default:
      return list.sort(
        (a, b) =>
          b.popularity - a.popularity ||
          b.voteCount - a.voteCount ||
          b.voteAverage - a.voteAverage,
      );
  }
}

function buildStats(movies, genreCounts, decadeCounts) {
  const rated = movies.filter((movie) => movie.voteAverage > 0);
  const years = movies.map((movie) => movie.year).filter(Boolean);
  return {
    total: movies.length,
    genreCount: genreCounts.length,
    countryCount: new Set(movies.map((movie) => movie.country).filter(Boolean)).size,
    yearMin: years.length ? Math.min(...years) : null,
    yearMax: years.length ? Math.max(...years) : null,
    averageRating: rated.length
      ? Math.round((rated.reduce((sum, movie) => sum + movie.voteAverage, 0) / rated.length) * 10) / 10
      : 0,
    voteCount: movies.reduce((sum, movie) => sum + movie.voteCount, 0),
    decades: decadeCounts,
  };
}

/**
 * 读取并标准化片库。文件没变化时命中内存缓存，便于开发时热更新。
 */
export async function loadCatalog(dataFile) {
  const info = await stat(dataFile);
  const version = `${info.mtimeMs}:${info.size}`;
  if (cache?.file === dataFile && cache.version === version) {
    return cache.catalog;
  }

  const payload = JSON.parse(await readFile(dataFile, 'utf8'));
  if (!Array.isArray(payload.movies)) {
    throw new Error('数据文件格式错误：缺少 movies 数组');
  }

  const genreMap = new Map(Object.entries(GENRE_MAP).map(([id, name]) => [Number(id), name]));
  if (payload.meta?.genres && Array.isArray(payload.meta.genres)) {
    for (const genre of payload.meta.genres) {
      if (genre?.id && genre?.name) genreMap.set(Number(genre.id), String(genre.name));
    }
  }

  const seen = new Set();
  const movies = payload.movies
    .map((movie) => enrichMovie(movie, genreMap))
    .filter((movie) => movie && Number.isFinite(movie.id) && !movie.adult)
    .filter((movie) => {
      if (seen.has(movie.id)) return false;
      seen.add(movie.id);
      return true;
    });

  const genreCounter = new Map();
  const decadeCounter = new Map();
  for (const movie of movies) {
    for (const genre of movie.genres) {
      genreCounter.set(genre, (genreCounter.get(genre) || 0) + 1);
    }
    if (movie.decade) decadeCounter.set(movie.decade, (decadeCounter.get(movie.decade) || 0) + 1);
  }

  const genreNameToId = new Map([...genreMap.entries()].map(([id, name]) => [name, id]));
  const genreCounts = [...genreCounter.entries()]
    .map(([name, count]) => ({ id: genreNameToId.get(name) || null, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));

  const decadeCounts = [...decadeCounter.entries()]
    .map(([decade, count]) => ({ decade, label: `${decade} 年代`, count }))
    .sort((a, b) => b.decade - a.decade);

  const meta = {
    source: payload.meta?.source || '本地片库',
    updatedAt: payload.meta?.updatedAt || null,
    language: payload.meta?.language || 'zh-CN',
    demo: Boolean(payload.meta?.demo),
    pages: payload.meta?.pages || null,
    collections: payload.meta?.collections || [],
  };

  const catalog = {
    meta,
    movies,
    genreMap,
    genreCounts,
    decadeCounts,
    stats: buildStats(movies, genreCounts, decadeCounts),
    loadedAt: new Date().toISOString(),
  };

  cache = { file: dataFile, version, catalog };
  return catalog;
}

export function publicMovie(movie) {
  if (!movie) return null;
  const { searchText, ...rest } = movie;
  return rest;
}

export function queryMovies(catalog, params = {}) {
  const page = clamp(Math.floor(toNumber(params.page, 1)), 1, 100000);
  const pageSize = clamp(Math.floor(toNumber(params.pageSize, 18)), 1, MAX_PAGE_SIZE);
  const q = text(params.q);
  const terms = q.split(' ').filter(Boolean);
  const genre = Number(params.genre) || 0;
  const decadeParam = String(params.decade || '').toLowerCase();
  const minRating = clamp(toNumber(params.rating ?? params.minRating, 0), 0, 10);
  const sort = SORTS.has(String(params.sort)) ? String(params.sort) : 'popular';

  let items = catalog.movies;

  if (terms.length) {
    items = items.filter((movie) => terms.every((term) => movie.searchText.includes(term)));
  }

  if (genre) {
    items = items.filter((movie) => movie.genreIds.includes(genre));
  }

  if (decadeParam && decadeParam !== 'all') {
    if (decadeParam === 'classic') {
      items = items.filter((movie) => movie.year && movie.year < 1990);
    } else {
      const start = Number(decadeParam.replace(/s$/, ''));
      if (Number.isFinite(start) && start > 1800) {
        items = items.filter(
          (movie) => movie.year && movie.year >= start && movie.year <= start + 9,
        );
      }
    }
  }

  if (minRating > 0) {
    items = items.filter((movie) => movie.voteAverage >= minRating);
  }

  const sorted = sortMovies(items, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  const pageItems = sorted.slice(offset, offset + pageSize);

  return {
    items: pageItems.map(publicMovie),
    total,
    page,
    pageSize,
    totalPages,
    hasMore: offset + pageItems.length < total,
    applied: { q, genre, decade: decadeParam || 'all', rating: minRating, sort },
  };
}

export function buildHome(catalog) {
  const { movies, stats } = catalog;
  const yearNow = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const popular = sortMovies(movies, 'popular');
  const heroes = popular.filter(
    (movie) =>
      movie.backdropUrl &&
      movie.voteCount >= 50 &&
      movie.voteAverage >= 6.3 &&
      (!movie.year || movie.year >= yearNow - 3),
  );

  const hero = (heroes.length >= 4 ? heroes : popular.filter((movie) => movie.backdropUrl)).slice(
    0,
    6,
  );

  const trending = popular.slice(0, 14);

  const topRated = sortMovies(
    movies.filter((movie) => movie.voteCount >= 80),
    'rating',
  ).slice(0, 14);

  let fresh = movies
    .filter((movie) => movie.releaseDate && movie.releaseDate <= today)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .slice(0, 14);
  if (fresh.length < 6) {
    fresh = sortMovies(movies.filter((movie) => movie.releaseDate), 'newest').slice(0, 14);
  }

  const hiddenGems = sortMovies(
    movies.filter(
      (movie) =>
        movie.voteAverage >= 7.3 &&
        movie.voteCount >= 30 &&
        movie.voteCount <= 5000 &&
        movie.backdropUrl,
    ),
    'rating',
  ).slice(0, 14);

  return {
    meta: {
      ...catalog.meta,
      count: catalog.movies.length,
      stats,
    },
    hero: hero.map(publicMovie),
    trending: trending.map(publicMovie),
    topRated: topRated.map(publicMovie),
    fresh: fresh.map(publicMovie),
    hiddenGems: hiddenGems.map(publicMovie),
    genres: catalog.genreCounts,
    decades: catalog.decadeCounts,
  };
}

export function findMovie(catalog, id) {
  return catalog.movies.find((movie) => movie.id === Number(id)) || null;
}

export function relatedMovies(catalog, movie, limit = 8) {
  if (!movie) return [];
  const genreSet = new Set(movie.genreIds);
  return catalog.movies
    .filter((candidate) => candidate.id !== movie.id)
    .map((candidate) => {
      const shared = candidate.genreIds.filter((id) => genreSet.has(id)).length;
      const languageBonus = candidate.originalLanguage === movie.originalLanguage ? 0.2 : 0;
      return { candidate, score: shared * 3 + languageBonus + candidate.voteAverage / 10 };
    })
    .filter((entry) => entry.score > 0.8)
    .sort((a, b) => b.score - a.score || b.candidate.popularity - a.candidate.popularity)
    .slice(0, limit)
    .map((entry) => publicMovie(entry.candidate));
}
