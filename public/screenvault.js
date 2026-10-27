const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE = {
  library: 'screenvault:library:v1',
  view: 'screenvault:view:v1',
};

const RAIL_COPY = {
  trending: '此刻热度最高的电影，按 TMDB 流行度排序。',
  topRated: '经过时间检验的高分作品，评分与评价人数双重筛选。',
  fresh: '刚刚上映或即将登陆银幕的新片，按上映日期排列。',
};

const LANGUAGE_NAMES = {
  en: '英语',
  zh: '汉语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  it: '意大利语',
  ru: '俄语',
  hi: '印地语',
  pt: '葡萄牙语',
  cn: '粤语',
  sv: '瑞典语',
  da: '丹麦语',
  no: '挪威语',
  nl: '荷兰语',
  pl: '波兰语',
  tr: '土耳其语',
  th: '泰语',
};

const state = {
  home: null,
  hero: [],
  heroIndex: 0,
  heroInitialized: false,
  heroFrameIndex: 0,
  heroTimer: null,
  railId: 'trending',
  movies: [],
  page: 1,
  pageSize: window.matchMedia('(max-width: 760px)').matches ? 12 : 18,
  total: 0,
  hasMore: false,
  loading: false,
  requestId: 0,
  controller: null,
  detailRequestId: 0,
  query: '',
  genre: 0,
  decade: 'all',
  rating: 0,
  sort: 'popular',
  view: 'grid',
  library: loadLibrary(),
  drawerTab: 'favorites',
  activeMovie: null,
  lastFocused: null,
  toastTimer: null,
  scrimTimer: null,
  searchTimer: null,
};

const els = {
  header: $('#siteHeader'),
  searchForm: $('#searchForm'),
  searchInput: $('#searchInput'),
  searchClear: $('#searchClear'),
  genreFilters: $('#genreFilters'),
  decadeFilter: $('#decadeFilter'),
  ratingFilter: $('#ratingFilter'),
  sortFilter: $('#sortFilter'),
  gridView: $('#gridView'),
  listView: $('#listView'),
  activeFilters: $('#activeFilters'),
  resetFilters: $('#resetFilters'),
  resultSummary: $('#resultSummary'),
  movieGrid: $('#movieGrid'),
  emptyState: $('#emptyState'),
  emptyReset: $('#emptyReset'),
  loadMore: $('#loadMore'),
  endNote: $('#endNote'),
  rankRail: $('#rankRail'),
  railDescription: $('#railDescription'),
  railPrev: $('#railPrev'),
  railNext: $('#railNext'),
  hero: $('#home'),
  heroTitle: $('#heroTitle'),
  heroOriginal: $('#heroOriginal'),
  heroMeta: $('#heroMeta'),
  heroOverview: $('#heroOverview'),
  heroIndex: $('#heroIndex'),
  heroDots: $('#heroDots'),
  heroYear: $('#heroYear'),
  heroScore: $('#heroScore'),
  heroDetail: $('#heroDetail'),
  heroFavorite: $('#heroFavorite'),
  heroRating: $('#heroRating'),
  catalogBadge: $('#catalogBadge'),
  statTotal: $('#statTotal'),
  statGenres: $('#statGenres'),
  statRating: $('#statRating'),
  statYears: $('#statYears'),
  updateInfo: $('#updateInfo'),
  libraryButton: $('#libraryButton'),
  libraryCount: $('#libraryCount'),
  mobileLibrary: $('#mobileLibrary'),
  mobileCount: $('#mobileCount'),
  libraryDrawer: $('#libraryDrawer'),
  closeLibrary: $('#closeLibrary'),
  libraryList: $('#libraryList'),
  favoritesTabCount: $('#favoritesTabCount'),
  watchedTabCount: $('#watchedTabCount'),
  scrim: $('#scrim'),
  detailModal: $('#detailModal'),
  detailContent: $('#detailContent'),
  closeDetail: $('#closeDetail'),
  toast: $('#toast'),
  dataSource: $('#dataSource'),
  footerCount: $('#footerCount'),
  footerUpdated: $('#footerUpdated'),
  yearNow: $('#yearNow'),
};

const heroFrames = [$('#heroFrameA'), $('#heroFrameB')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function escapeHTML(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function debounce(callback, delay) {
  return (...args) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => callback(...args), delay);
  };
}

function number(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year) return '';
  return [year, month, day].filter(Boolean).join('.');
}

function formatRuntime(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return '未知';
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return hours ? `${hours} 小时 ${rest ? `${rest} 分` : ''}`.trim() : `${rest} 分钟`;
}

function languageName(code) {
  return LANGUAGE_NAMES[code] || (code ? code.toUpperCase() : '未知');
}

function scoreText(value) {
  const score = Number(value) || 0;
  return score ? score.toFixed(1) : '—';
}

function yearText(movie) {
  return movie?.year || (movie?.releaseDate ? String(movie.releaseDate).slice(0, 4) : '');
}

function genreText(movie, limit = 2) {
  return (movie?.genres || []).slice(0, limit).join(' / ');
}

function loadLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE.library) || '{}');
    const clean = (list) =>
      Array.isArray(list)
        ? list.filter((movie) => movie && Number.isFinite(Number(movie.id))).slice(0, 500)
        : [];
    return { favorites: clean(raw.favorites), watched: clean(raw.watched) };
  } catch {
    return { favorites: [], watched: [] };
  }
}

function saveLibrary() {
  try {
    localStorage.setItem(STORAGE.library, JSON.stringify(state.library));
  } catch {
    toast('浏览器存储空间不足，片单未能保存');
  }
}

function isIn(bucket, id) {
  return state.library[bucket].some((movie) => Number(movie.id) === Number(id));
}

function snapshot(movie) {
  return {
    id: Number(movie.id),
    title: movie.title,
    posterUrl: movie.posterUrl || '',
    year: yearText(movie),
    voteAverage: Number(movie.voteAverage) || 0,
    genres: (movie.genres || []).slice(0, 2),
  };
}

function toggleLibrary(bucket, movie) {
  const index = state.library[bucket].findIndex(
    (entry) => Number(entry.id) === Number(movie.id),
  );
  let added = false;
  if (index >= 0) {
    state.library[bucket].splice(index, 1);
  } else {
    state.library[bucket].unshift(snapshot(movie));
    added = true;
  }
  saveLibrary();
  syncLibraryUI();
  if (isDrawerOpen()) renderLibrary();
  return added;
}

function removeFromLibrary(bucket, id) {
  state.library[bucket] = state.library[bucket].filter(
    (movie) => Number(movie.id) !== Number(id),
  );
  saveLibrary();
  syncLibraryUI();
  renderLibrary();
  toast('已从片单移除');
}

function cachedMovie(id) {
  const target = Number(id);
  if (state.activeMovie && Number(state.activeMovie.id) === target) return state.activeMovie;
  const local = state.movies.find((movie) => Number(movie.id) === target);
  if (local) return local;
  if (state.home) {
    const pools = [state.home.hero, state.home.trending, state.home.topRated, state.home.fresh];
    for (const pool of pools) {
      const movie = (pool || []).find((entry) => Number(entry.id) === target);
      if (movie) return movie;
    }
  }
  for (const bucket of ['favorites', 'watched']) {
    const movie = state.library[bucket].find((entry) => Number(entry.id) === target);
    if (movie) return movie;
  }
  return null;
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

/* ── Boot ────────────────────────────────────────────────── */

async function boot() {
  readURL();
  applyView(state.view, false);
  bindEvents();
  renderSkeletons();

  try {
    const home = await fetchJSON('/api/home');
    applyHome(home);
    await fetchMovies({ reset: true });
  } catch (error) {
    console.error(error);
    showFatalState(error);
  }
}

function readURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    state.query = (params.get('q') || '').trim();
    state.genre = Number(params.get('genre')) || 0;
    state.decade = params.get('decade') || 'all';
    state.rating = Number(params.get('rating')) || 0;
    const sort = params.get('sort');
    if (['popular', 'rating', 'newest', 'votes'].includes(sort)) state.sort = sort;
    const storedView = localStorage.getItem(STORAGE.view);
    if (storedView === 'list' || storedView === 'grid') state.view = storedView;
  } catch {
    /* URL 参数或本地存储不可用时使用默认值 */
  }

  els.searchInput.value = state.query;
  els.searchClear.hidden = !state.query;
  els.ratingFilter.value = String(state.rating);
  els.sortFilter.value = state.sort;
}

function showFatalState(error) {
  els.movieGrid.innerHTML = '';
  els.movieGrid.setAttribute('aria-busy', 'false');
  els.emptyState.hidden = false;
  els.emptyState.querySelector('h3').textContent = '片库暂时没有回应';
  els.emptyState.querySelector('p').textContent =
    '请确认本地服务正在运行，并且 data/movies.json 可以正常读取。';
  els.resultSummary.textContent = '片库读取失败';
  els.heroTitle.textContent = '银幕暂时离线';
  els.heroOverview.textContent =
    '数据文件没有成功载入。运行 npm start 启动网站，或检查 data/movies.json 是否存在。';
  els.updateInfo.textContent = '无法连接本地片库';
  toast(error.message || '片库读取失败');
}

/* ── Home rendering ──────────────────────────────────────── */

function applyHome(home) {
  state.home = home;
  const meta = home.meta || {};
  const stats = meta.stats || {};

  els.catalogBadge.hidden = !meta.demo;
  els.catalogBadge.textContent = '演示片库';
  els.catalogBadge.title = meta.demo
    ? '当前为 TMDB 公开目录快照。配置 API Key 并运行 npm run sync 可扩展为完整片库。'
    : '';

  animateNumber(els.statTotal, stats.total || 0, 0);
  animateNumber(els.statGenres, stats.genreCount || 0, 0);
  animateNumber(els.statRating, stats.averageRating || 0, 1);
  els.statYears.textContent =
    stats.yearMin && stats.yearMax ? `${stats.yearMin}—${stats.yearMax}` : '—';

  els.updateInfo.textContent = meta.demo
    ? `演示数据 · 更新于 ${formatDate(meta.updatedAt) || '最近'}`
    : `TMDB API · 更新于 ${formatDate(meta.updatedAt) || '最近'}`;

  els.dataSource.textContent = meta.demo ? '演示快照 · TMDB' : 'TMDB API';
  els.footerCount.textContent = number(meta.count || stats.total || 0);
  els.footerUpdated.textContent = meta.updatedAt
    ? `最后更新 ${formatDate(meta.updatedAt)}`
    : '尚未同步真实片库';
  els.yearNow.textContent = String(new Date().getFullYear());

  renderGenres(home.genres || []);
  renderDecades(home.decades || []);
  setupHero((home.hero && home.hero.length ? home.hero : home.trending || []).slice(0, 5));
  renderRail(state.railId);
  updateActiveFilters();
  updateURL();
}

function animateNumber(element, target, digits) {
  const finalValue = Number(target) || 0;
  if (reducedMotion.matches || finalValue > 100000) {
    element.textContent = digits ? finalValue.toFixed(digits) : number(finalValue);
    return;
  }
  const duration = 1100;
  const started = performance.now();
  const from = 0;
  function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const value = from + (finalValue - from) * eased;
    element.textContent = digits ? value.toFixed(digits) : number(Math.round(value));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderGenres(genres) {
  const total = state.home?.meta?.stats?.total || 0;
  els.genreFilters.innerHTML = [
    `<button class="genre-chip ${state.genre === 0 ? 'is-active' : ''}" data-genre="0" aria-pressed="${state.genre === 0}">全部<small>${number(total)}</small></button>`,
    ...genres.map(
      (genre) =>
        `<button class="genre-chip ${state.genre === Number(genre.id || 0) ? 'is-active' : ''}" data-genre="${escapeAttr(genre.id || '')}" data-genre-name="${escapeAttr(genre.name)}" aria-pressed="false">${escapeHTML(genre.name)}<small>${number(genre.count)}</small></button>`,
    ),
  ].join('');
  syncGenreButtons();
}

function syncGenreButtons() {
  $$('.genre-chip', els.genreFilters).forEach((button) => {
    const active = Number(button.dataset.genre) === Number(state.genre);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderDecades(decades) {
  const current = state.decade;
  const options = [
    '<option value="all">全部年代</option>',
    ...decades.map(
      (entry) =>
        `<option value="${entry.decade}s">${escapeHTML(entry.label)}</option>`,
    ),
  ];
  if (!decades.some((entry) => `${entry.decade}s` === current) && current !== 'all') {
    options.push(
      `<option value="${escapeAttr(current)}">${current === 'classic' ? '1990 年前' : escapeHTML(current)}</option>`,
    );
  }
  els.decadeFilter.innerHTML = options.join('');
  els.decadeFilter.value = current;
}

/* ── Hero ────────────────────────────────────────────────── */

function setupHero(movies) {
  state.hero = movies.filter(Boolean);
  state.heroIndex = 0;
  state.heroInitialized = false;

  if (!state.hero.length) return;

  els.heroDots.innerHTML = state.hero
    .map(
      (movie, index) =>
        `<button type="button" role="tab" aria-selected="false" aria-label="第 ${index + 1} 部：${escapeAttr(movie.title)}" data-hero-index="${index}"></button>`,
    )
    .join('');

  $$('.hero-counter-total').forEach((node) => {
    node.textContent = `/ ${pad(state.hero.length)}`;
  });

  showHero(0);
  startHeroTimer();
}

function showHero(index) {
  if (!state.hero.length) return;
  const total = state.hero.length;
  const position = ((index % total) + total) % total;
  const movie = state.hero[position];
  state.heroIndex = position;

  setHeroBackdrop(movie.backdropUrl || movie.posterUrl);
  els.heroTitle.textContent = movie.title;
  els.heroOriginal.textContent =
    movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : '';
  els.heroOverview.textContent = movie.overview || '这部电影还没有中文简介。';

  const meta = [];
  if (yearText(movie)) meta.push(escapeHTML(yearText(movie)));
  if (movie.runtime) meta.push(escapeHTML(formatRuntime(movie.runtime)));
  if (movie.genres?.length) meta.push(escapeHTML(genreText(movie, 2)));
  els.heroMeta.innerHTML = meta
    .map((item, itemIndex) =>
      itemIndex === 0
        ? `<span>${item}</span>`
        : `<span class="meta-dot"></span><span>${item}</span>`,
    )
    .join('');

  els.heroIndex.textContent = pad(position + 1);
  els.heroYear.textContent = yearText(movie) || '—';
  els.heroScore.textContent = scoreText(movie.voteAverage);
  els.heroDetail.dataset.id = String(movie.id);
  els.heroFavorite.dataset.id = String(movie.id);

  $$('.hero-dots button', els.heroDots).forEach((dot, dotIndex) => {
    const active = dotIndex === position;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
  });

  syncLibraryUI();
  preloadBackdrop(state.hero[(position + 1) % total]);
}

function setHeroBackdrop(url) {
  if (!url) return;
  if (!state.heroInitialized) {
    heroFrames[0].style.backgroundImage = `url("${url}")`;
    heroFrames[0].classList.add('is-active');
    heroFrames[1].classList.remove('is-active');
    state.heroFrameIndex = 0;
    state.heroInitialized = true;
    return;
  }
  if (heroFrames[state.heroFrameIndex].style.backgroundImage.includes(url)) return;

  const nextIndex = 1 - state.heroFrameIndex;
  const next = heroFrames[nextIndex];
  const current = heroFrames[state.heroFrameIndex];
  next.style.backgroundImage = `url("${url}")`;
  next.classList.add('is-active');
  current.classList.remove('is-active');
  state.heroFrameIndex = nextIndex;
}

function preloadBackdrop(movie) {
  if (!movie?.backdropUrl) return;
  const image = new Image();
  image.src = movie.backdropUrl;
}

function startHeroTimer() {
  clearInterval(state.heroTimer);
  if (reducedMotion.matches || state.hero.length < 2) return;
  state.heroTimer = setInterval(() => {
    if (!document.hidden) showHero(state.heroIndex + 1);
  }, 8000);
}

function restartHeroTimer() {
  startHeroTimer();
}

/* ── Rail ────────────────────────────────────────────────── */

function renderRail(id) {
  if (!state.home) return;
  state.railId = id;
  const items = state.home[id] || [];

  els.rankRail.innerHTML = items
    .map((movie, index) => rankCard(movie, index + 1))
    .join('');
  els.railDescription.textContent = RAIL_COPY[id] || '';
  els.rankRail.scrollLeft = 0;

  $$('[data-rail]').forEach((button) => {
    const active = button.dataset.rail === id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  updateRailArrows();
}

function rankCard(movie, rank) {
  const meta = [yearText(movie), genreText(movie, 1)].filter(Boolean).join(' · ');
  return `
    <article class="rank-card" data-id="${movie.id}">
      <div class="rank-poster">
        <a class="movie-poster-link" href="#movie-${movie.id}" data-open="${movie.id}" aria-label="查看《${escapeAttr(movie.title)}》详情">
          <img src="${escapeAttr(movie.posterUrl)}" alt="${escapeAttr(movie.title)} 海报" loading="lazy" decoding="async" />
        </a>
        <span class="rank-number" aria-hidden="true">${pad(rank)}</span>
        <span class="rank-score">★ ${scoreText(movie.voteAverage)}</span>
      </div>
      <div class="rank-info">
        <h3><button type="button" data-open="${movie.id}">${escapeHTML(movie.title)}</button></h3>
        <p>${escapeHTML(meta || '电影')}</p>
      </div>
    </article>`;
}

function updateRailArrows() {
  const max = els.rankRail.scrollWidth - els.rankRail.clientWidth;
  els.railPrev.disabled = els.rankRail.scrollLeft <= 4;
  els.railNext.disabled = els.rankRail.scrollLeft >= max - 4;
}

/* ── Movie grid ──────────────────────────────────────────── */

function movieCard(movie) {
  const list = state.view === 'list';
  const year = yearText(movie);
  const meta = [year, genreText(movie, 2)].filter(Boolean);
  const isFavorite = isIn('favorites', movie.id);

  return `
    <article class="movie-card ${list ? 'is-list' : ''}" data-id="${movie.id}">
      <div class="movie-poster-wrap">
        <a class="movie-poster-link" href="#movie-${movie.id}" data-open="${movie.id}" aria-label="查看《${escapeAttr(movie.title)}》详情">
          <img src="${escapeAttr(movie.posterUrl)}" alt="${escapeAttr(movie.title)} 海报" loading="lazy" decoding="async" />
        </a>
        <span class="movie-score"><svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>${scoreText(movie.voteAverage)}</span>
        <button
          class="favorite-button ${isFavorite ? 'is-active' : ''}"
          type="button"
          data-favorite="${movie.id}"
          aria-label="${isFavorite ? '从片单移除' : '加入片单'}"
          aria-pressed="${isFavorite}"
          title="${isFavorite ? '从片单移除' : '加入片单'}"
        >
          <svg class="icon" aria-hidden="true"><use href="#icon-heart"></use></svg>
        </button>
        <div class="movie-hover" aria-hidden="true">
          <p>${escapeHTML(movie.overview || '暂无简介')}</p>
          <span>查看详情 <svg class="icon"><use href="#icon-arrow-right"></use></svg></span>
        </div>
      </div>
      <div class="movie-info">
        <div class="movie-info-main">
          <h3 class="movie-title"><a href="#movie-${movie.id}" data-open="${movie.id}">${escapeHTML(movie.title)}</a></h3>
          <p class="movie-sub">${meta
            .map((item, index) =>
              index === 0 ? `<span>${escapeHTML(item)}</span>` : `<span class="sub-dot"></span><span>${escapeHTML(item)}</span>`,
            )
            .join('')}</p>
          <p class="movie-list-summary">${escapeHTML(movie.overview || '暂无简介')}</p>
        </div>
        <span class="movie-year">${escapeHTML(year || '—')}</span>
      </div>
      <div class="movie-list-side">
        <span class="list-score">★ ${scoreText(movie.voteAverage)}</span>
        <span class="movie-year">${escapeHTML(year || '—')}</span>
        <button
          class="favorite-inline ${isFavorite ? 'is-active' : ''}"
          type="button"
          data-favorite="${movie.id}"
          aria-label="${isFavorite ? '从片单移除' : '加入片单'}"
          aria-pressed="${isFavorite}"
        >
          <svg class="icon" aria-hidden="true"><use href="#icon-heart"></use></svg>
        </button>
      </div>
    </article>`;
}

function renderCards(items, append) {
  const html = items.map(movieCard).join('');
  if (append) els.movieGrid.insertAdjacentHTML('beforeend', html);
  else els.movieGrid.innerHTML = html;
  syncLibraryUI();
}

function renderSkeletons() {
  els.movieGrid.setAttribute('aria-busy', 'true');
  if (state.view === 'list') {
    els.movieGrid.innerHTML = Array.from(
      { length: 8 },
      () => `
        <div class="movie-card skeleton" aria-hidden="true">
          <div class="sk-poster"></div>
          <div>
            <div class="sk-line"></div>
            <div class="sk-line short"></div>
          </div>
        </div>`,
    ).join('');
    return;
  }
  els.movieGrid.innerHTML = Array.from(
    { length: 12 },
    () => `
      <div class="movie-card skeleton" aria-hidden="true">
        <div class="sk-poster"></div>
        <div class="sk-line"></div>
        <div class="sk-line short"></div>
      </div>`,
  ).join('');
}

async function fetchMovies({ reset = false } = {}) {
  if (!reset && (state.loading || !state.hasMore)) return;

  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;
  const page = reset ? 1 : state.page + 1;

  state.loading = true;

  if (reset) {
    state.page = 1;
    state.total = 0;
    state.hasMore = false;
    state.movies = [];
    els.emptyState.hidden = true;
    els.emptyState.querySelector('h3').textContent = '没有找到匹配的电影';
    els.emptyState.querySelector('p').textContent = '换一个关键词，或者把筛选条件放宽一点。';
    els.endNote.hidden = true;
    els.loadMore.hidden = true;
    els.resultSummary.textContent = '正在检索片库…';
    renderSkeletons();
  } else {
    els.loadMore.disabled = true;
    els.loadMore.textContent = '加载中…';
  }

  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(state.pageSize),
      sort: state.sort,
    });
    if (state.query) params.set('q', state.query);
    if (state.genre) params.set('genre', String(state.genre));
    if (state.decade && state.decade !== 'all') params.set('decade', state.decade);
    if (state.rating) params.set('rating', String(state.rating));

    const data = await fetchJSON(`/api/movies?${params}`, { signal: controller.signal });
    if (requestId !== state.requestId) return;

    state.total = data.total;
    state.page = data.page;
    state.hasMore = data.hasMore;
    state.movies = reset ? data.items : state.movies.concat(data.items);

    if (reset) els.movieGrid.innerHTML = '';
    renderCards(data.items, !reset);

    updateResultSummary(data);
    updateActiveFilters();
    updateURL();

    els.emptyState.hidden = data.total !== 0;
    els.loadMore.hidden = !data.hasMore;
    els.endNote.hidden = !(data.total > state.pageSize && !data.hasMore);
    if (!data.total) {
      els.movieGrid.innerHTML = '';
      els.emptyState.hidden = false;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    if (requestId !== state.requestId) return;
    toast('电影列表加载失败，请稍后重试');
    if (reset) {
      els.movieGrid.innerHTML = '';
      els.emptyState.hidden = false;
      els.emptyState.querySelector('h3').textContent = '列表暂时无法加载';
      els.emptyState.querySelector('p').textContent = '请稍等片刻再试，或刷新页面。';
      els.resultSummary.textContent = '加载失败';
    }
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      els.movieGrid.setAttribute('aria-busy', 'false');
      els.loadMore.disabled = false;
      els.loadMore.textContent = '加载更多';
    }
  }
}

function updateResultSummary(data) {
  const parts = [];
  if (state.query) {
    parts.push(`与 <em>“${escapeHTML(state.query)}”</em> 相关`);
  }
  if (state.genre) {
    const name = state.home?.genres?.find((genre) => Number(genre.id) === Number(state.genre));
    if (name) parts.push(`类型 <em>${escapeHTML(name.name)}</em>`);
  }
  if (state.rating) parts.push(`评分 <em>${state.rating}+</em>`);
  if (state.decade !== 'all') {
    const label = els.decadeFilter.selectedOptions[0]?.textContent || '';
    if (label) parts.push(escapeHTML(label));
  }

  const prefix = parts.length ? `${parts.join(' · ')} · ` : '';
  els.resultSummary.innerHTML = `${prefix}共 <strong>${number(data.total)}</strong> 部电影`;
}

/* ── Filters / URL ───────────────────────────────────────── */

function updateActiveFilters() {
  const pills = [];
  if (state.query) {
    pills.push(
      `<span class="filter-pill">“${escapeHTML(state.query)}”<button type="button" data-clear="query" aria-label="清除搜索"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`,
    );
  }
  if (state.genre) {
    const genre = state.home?.genres?.find((entry) => Number(entry.id) === Number(state.genre));
    if (genre) {
      pills.push(
        `<span class="filter-pill">${escapeHTML(genre.name)}<button type="button" data-clear="genre" aria-label="清除类型筛选"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`,
      );
    }
  }
  if (state.decade !== 'all') {
    const label =
      els.decadeFilter.selectedOptions[0]?.textContent ||
      (state.decade === 'classic' ? '1990 年前' : state.decade);
    pills.push(
      `<span class="filter-pill">${escapeHTML(label)}<button type="button" data-clear="decade" aria-label="清除年代筛选"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`,
    );
  }
  if (state.rating) {
    pills.push(
      `<span class="filter-pill">${state.rating} 分以上<button type="button" data-clear="rating" aria-label="清除评分筛选"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`,
    );
  }

  els.activeFilters.hidden = pills.length === 0;
  els.activeFilters.innerHTML = pills.join('');
  els.resetFilters.hidden = pills.length === 0;
  syncGenreButtons();
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.genre) params.set('genre', String(state.genre));
  if (state.decade !== 'all') params.set('decade', state.decade);
  if (state.rating) params.set('rating', String(state.rating));
  if (state.sort !== 'popular') params.set('sort', state.sort);
  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  window.history.replaceState(null, '', url);
}

function applyFilters() {
  state.page = 1;
  updateActiveFilters();
  fetchMovies({ reset: true });
}

function resetAllFilters() {
  state.query = '';
  state.genre = 0;
  state.decade = 'all';
  state.rating = 0;
  state.sort = 'popular';
  els.searchInput.value = '';
  els.searchClear.hidden = true;
  els.decadeFilter.value = 'all';
  els.ratingFilter.value = '0';
  els.sortFilter.value = 'popular';
  applyFilters();
}

/* ── View mode ───────────────────────────────────────────── */

function applyView(view, persist = true) {
  state.view = view === 'list' ? 'list' : 'grid';
  els.movieGrid.classList.toggle('is-list', state.view === 'list');
  els.gridView.classList.toggle('is-active', state.view === 'grid');
  els.listView.classList.toggle('is-active', state.view === 'list');
  $$('.movie-card', els.movieGrid).forEach((card) => {
    card.classList.toggle('is-list', state.view === 'list');
  });
  if (persist) {
    try {
      localStorage.setItem(STORAGE.view, state.view);
    } catch {
      /* 忽略本地存储失败 */
    }
  }
}

/* ── Detail ──────────────────────────────────────────────── */

async function openDetail(id) {
  const movie = cachedMovie(id);
  if (isDrawerOpen()) closeLibrary(false);
  state.activeMovie = movie || { id: Number(id) };
  if (!isDetailOpen()) state.lastFocused = document.activeElement;

  state.detailRequestId += 1;
  const requestId = state.detailRequestId;

  els.detailModal.classList.add('is-open');
  els.detailModal.setAttribute('aria-hidden', 'false');
  if (movie) {
    els.detailContent.innerHTML = detailMarkup(movie, []);
    setDetailBackdrop(movie);
  } else {
    els.detailContent.innerHTML = detailLoadingMarkup();
  }
  els.detailContent.scrollTop = 0;
  syncBodyLock();
  els.closeDetail.focus({ preventScroll: true });

  try {
    const data = await fetchJSON(`/api/movies/${id}`);
    if (requestId !== state.detailRequestId || !isDetailOpen()) return;
    state.activeMovie = data.item;
    els.detailContent.innerHTML = detailMarkup(data.item, data.related || []);
    setDetailBackdrop(data.item);
    els.detailContent.scrollTop = 0;
    syncLibraryUI();
  } catch (error) {
    if (requestId !== state.detailRequestId) return;
    console.error(error);
    if (!movie) {
      els.detailContent.innerHTML = `
        <div class="detail-loading">
          <h2 id="detailTitle" class="sr-only">详情加载失败</h2>
          <span>这部电影暂时无法打开，请稍后再试。</span>
        </div>`;
    }
    toast('详情加载失败，请稍后重试');
  }
}

function detailLoadingMarkup() {
  return `
    <div class="detail-loading">
      <h2 id="detailTitle" class="sr-only">正在载入电影详情</h2>
      <span>正在从片库中取出这部电影…</span>
    </div>`;
}

function detailMarkup(movie, related) {
  const favourite = isIn('favorites', movie.id);
  const watched = isIn('watched', movie.id);
  const year = yearText(movie);
  const meta = [year, genreText(movie, 2), movie.voteCount ? `${number(movie.voteCount)} 人评价` : '']
    .filter(Boolean)
    .map(
      (item, index) =>
        `${index ? '<span class="meta-dot"></span>' : ''}<span>${escapeHTML(item)}</span>`,
    )
    .join('');

  const facts = [
    ['上映日期', formatDate(movie.releaseDate) || '未知'],
    ['片长', movie.runtime ? formatRuntime(movie.runtime) : '未知'],
    ['地区', movie.country || '未知'],
    ['原始语言', languageName(movie.originalLanguage)],
  ]
    .map(
      ([label, value]) =>
        `<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`,
    )
    .join('');

  const genreButtons = (movie.genres || [])
    .map(
      (genre) =>
        `<button type="button" data-genre-jump="${escapeAttr(genre)}">${escapeHTML(genre)}</button>`,
    )
    .join('');

  const relatedSection = related.length
    ? `<section class="detail-related">
        <div class="detail-related-head">
          <h3>你还会喜欢</h3>
          <span>MORE LIKE THIS</span>
        </div>
        <div class="related-grid">
          ${related
            .slice(0, 6)
            .map(
              (item) => `
                <article class="related-card">
                  <a href="#movie-${item.id}" data-open="${item.id}" aria-label="查看《${escapeAttr(item.title)}》">
                    <img src="${escapeAttr(item.posterUrl)}" alt="${escapeAttr(item.title)} 海报" loading="lazy" decoding="async" />
                    <h4>${escapeHTML(item.title)}</h4>
                    <p>${escapeHTML(yearText(item) || '—')} · ★ ${scoreText(item.voteAverage)}</p>
                  </a>
                </article>`,
            )
            .join('')}
        </div>
      </section>`
    : '';

  return `
    <section class="detail-hero">
      <div class="detail-backdrop" id="detailBackdrop"></div>
      <div class="detail-inner">
        <div class="detail-poster">
          <img src="${escapeAttr(movie.posterUrl)}" alt="${escapeAttr(movie.title)} 海报" />
        </div>
        <div class="detail-copy">
          <p class="eyebrow"><span class="eyebrow-mark"></span>电影档案<span class="eyebrow-en">FILM DETAIL</span></p>
          <h2 id="detailTitle">${escapeHTML(movie.title)}</h2>
          <p class="detail-original">${movie.originalTitle && movie.originalTitle !== movie.title ? escapeHTML(movie.originalTitle) : ''}</p>
          ${movie.tagline ? `<p class="detail-tagline">“${escapeHTML(movie.tagline)}”</p>` : ''}
          <div class="detail-meta">
            <span class="detail-score">★ ${scoreText(movie.voteAverage)}</span>
            <span class="meta-dot"></span>
            ${meta || '<span>暂无信息</span>'}
          </div>
          ${genreButtons ? `<div class="detail-genres">${genreButtons}</div>` : ''}
          <p class="detail-overview">${escapeHTML(movie.overview || '这部电影还没有中文简介。')}</p>
          <div class="detail-actions">
            <button class="button button-primary ${favourite ? 'is-active' : ''}" type="button" data-detail-favorite>
              <svg class="icon"><use href="#icon-heart"></use></svg>
              <span>${favourite ? '已在片单' : '加入片单'}</span>
            </button>
            <button class="button button-ghost ${watched ? 'is-active' : ''}" type="button" data-detail-watched>
              <svg class="icon"><use href="#icon-check"></use></svg>
              <span>${watched ? '已看过' : '标记看过'}</span>
            </button>
            <a class="button button-ghost" href="https://www.themoviedb.org/movie/${movie.id}" target="_blank" rel="noreferrer">
              TMDB 页面 ↗
            </a>
          </div>
          <dl class="detail-facts">${facts}</dl>
        </div>
      </div>
    </section>
    ${relatedSection}`;
}

function setDetailBackdrop(movie) {
  const node = $('#detailBackdrop');
  if (!node || !movie) return;
  const url = movie.backdropUrl || movie.posterUrl;
  if (url) node.style.backgroundImage = `url("${url}")`;
}

function syncDetailButtons() {
  if (!state.activeMovie || !isDetailOpen()) return;
  const favourite = isIn('favorites', state.activeMovie.id);
  const watched = isIn('watched', state.activeMovie.id);
  const favoriteButton = $('[data-detail-favorite]', els.detailContent);
  const watchedButton = $('[data-detail-watched]', els.detailContent);

  if (favoriteButton) {
    favoriteButton.classList.toggle('is-active', favourite);
    favoriteButton.innerHTML = `<svg class="icon"><use href="#icon-heart"></use></svg><span>${favourite ? '已在片单' : '加入片单'}</span>`;
  }
  if (watchedButton) {
    watchedButton.classList.toggle('is-active', watched);
    watchedButton.innerHTML = `<svg class="icon"><use href="#icon-check"></use></svg><span>${watched ? '已看过' : '标记看过'}</span>`;
  }
}

function closeDetail(restoreFocus = true) {
  if (!isDetailOpen()) return;
  state.detailRequestId += 1;
  els.detailModal.classList.remove('is-open');
  els.detailModal.setAttribute('aria-hidden', 'true');
  state.activeMovie = null;
  syncBodyLock();
  setTimeout(() => {
    if (!isDetailOpen()) els.detailContent.innerHTML = '';
  }, 420);
  if (restoreFocus && state.lastFocused instanceof HTMLElement) {
    state.lastFocused.focus({ preventScroll: true });
  }
}

function isDetailOpen() {
  return els.detailModal.classList.contains('is-open');
}

/* ── Library ─────────────────────────────────────────────── */

function syncLibraryUI() {
  const favoriteCount = state.library.favorites.length;
  const watchedCount = state.library.watched.length;

  els.libraryCount.textContent = String(favoriteCount);
  els.mobileCount.textContent = String(favoriteCount);
  els.favoritesTabCount.textContent = String(favoriteCount);
  els.watchedTabCount.textContent = String(watchedCount);

  $$('[data-favorite]').forEach((button) => {
    const active = isIn('favorites', Number(button.dataset.favorite));
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '从片单移除' : '加入片单');
    button.title = active ? '从片单移除' : '加入片单';
  });

  $$('.favorite-inline').forEach((button) => {
    const active = isIn('favorites', Number(button.dataset.favorite));
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '从片单移除' : '加入片单');
  });

  const heroMovie = state.hero[state.heroIndex];
  if (heroMovie) {
    const active = isIn('favorites', heroMovie.id);
    els.heroFavorite.classList.toggle('is-active', active);
    els.heroFavorite.setAttribute('aria-pressed', String(active));
    els.heroFavorite.innerHTML = `<svg class="icon"><use href="#icon-heart"></use></svg><span>${active ? '已在片单' : '加入片单'}</span>`;
  }

  syncDetailButtons();
  if (isDrawerOpen()) renderLibrary();
}

function renderLibrary() {
  const bucket = state.drawerTab;
  const items = state.library[bucket];

  $$('[data-library-tab]').forEach((button) => {
    const active = button.dataset.libraryTab === bucket;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (!items.length) {
    els.libraryList.innerHTML = `
      <div class="drawer-empty">
        <svg class="icon"><use href="#icon-${bucket === 'favorites' ? 'heart' : 'check'}"></use></svg>
        <strong>${bucket === 'favorites' ? '片单还是空的' : '还没有标记看过'}</strong>
        <p>${bucket === 'favorites' ? '在电影卡片上点一下爱心，就会留在这里。' : '看过之后，回来打个勾。'}</p>
      </div>`;
    return;
  }

  els.libraryList.innerHTML = items
    .map(
      (movie) => `
        <article class="library-item">
          <a class="library-thumb" href="#movie-${movie.id}" data-open="${movie.id}" aria-label="查看《${escapeAttr(movie.title)}》">
            <img src="${escapeAttr(movie.posterUrl)}" alt="" loading="lazy" />
          </a>
          <div>
            <h3><button type="button" data-open="${movie.id}">${escapeHTML(movie.title)}</button></h3>
            <p><span>★ ${scoreText(movie.voteAverage)}</span> · ${escapeHTML(movie.year || '—')}</p>
          </div>
          <button class="remove-library" type="button" data-remove-bucket="${bucket}" data-remove-id="${movie.id}" aria-label="从片单移除 ${escapeAttr(movie.title)}">
            <svg class="icon"><use href="#icon-close"></use></svg>
          </button>
        </article>`,
    )
    .join('');
}

function openLibrary(tab = 'favorites') {
  if (isDetailOpen()) closeDetail(false);
  state.drawerTab = tab;
  renderLibrary();
  state.lastFocused = document.activeElement;
  els.scrim.hidden = false;
  clearTimeout(state.scrimTimer);
  requestAnimationFrame(() => els.scrim.classList.add('is-visible'));
  els.libraryDrawer.inert = false;
  els.libraryDrawer.classList.add('is-open');
  els.libraryDrawer.setAttribute('aria-hidden', 'false');
  syncBodyLock();
  els.closeLibrary.focus({ preventScroll: true });
}

function closeLibrary(restoreFocus = true) {
  if (!isDrawerOpen()) return;
  els.libraryDrawer.classList.remove('is-open');
  els.libraryDrawer.setAttribute('aria-hidden', 'true');
  els.libraryDrawer.inert = true;
  els.scrim.classList.remove('is-visible');
  state.scrimTimer = setTimeout(() => {
    if (!isDrawerOpen()) els.scrim.hidden = true;
  }, 360);
  syncBodyLock();
  if (restoreFocus && state.lastFocused instanceof HTMLElement) {
    state.lastFocused.focus({ preventScroll: true });
  }
}

function isDrawerOpen() {
  return els.libraryDrawer.classList.contains('is-open');
}

function syncBodyLock() {
  document.body.classList.toggle('is-locked', isDetailOpen() || isDrawerOpen());
}

/* ── Toast / navigation / shortcuts ─────────────────────── */

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
}

async function randomMovie(useFilters = false) {
  try {
    const params = new URLSearchParams();
    if (useFilters) {
      if (state.query) params.set('q', state.query);
      if (state.genre) params.set('genre', String(state.genre));
      if (state.decade !== 'all') params.set('decade', state.decade);
      if (state.rating) params.set('rating', String(state.rating));
    }
    const suffix = params.toString();
    const data = await fetchJSON(`/api/random${suffix ? `?${suffix}` : ''}`);
    if (data.item) openDetail(data.item.id);
  } catch (error) {
    console.error(error);
    toast(error.message || '暂时找不到随机电影');
  }
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = $$(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    container,
  ).filter((node) => node.getClientRects().length > 0);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape') {
    if (isDetailOpen()) closeDetail();
    else if (isDrawerOpen()) closeLibrary();
  }

  if (event.key === '/' && !isDetailOpen() && !isDrawerOpen()) {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
    if (!typing) {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
  }

  if (isDetailOpen()) trapFocus(event, els.detailModal);
  else if (isDrawerOpen()) trapFocus(event, els.libraryDrawer);
}

function bindEvents() {
  window.addEventListener(
    'scroll',
    () => {
      els.header.classList.toggle('is-scrolled', window.scrollY > 24);
    },
    { passive: true },
  );

  window.addEventListener('keydown', handleGlobalKeydown);

  els.searchForm.addEventListener('submit', (event) => event.preventDefault());
  els.searchInput.addEventListener('input', () => {
    const value = els.searchInput.value;
    els.searchClear.hidden = !value;
    const run = debounce(() => {
      state.query = value.trim();
      applyFilters();
    }, 300);
    run();
  });
  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.hidden = true;
    state.query = '';
    applyFilters();
    els.searchInput.focus();
  });

  els.genreFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-genre]');
    if (!button) return;
    state.genre = Number(button.dataset.genre) || 0;
    applyFilters();
  });

  els.decadeFilter.addEventListener('change', () => {
    state.decade = els.decadeFilter.value;
    applyFilters();
  });
  els.ratingFilter.addEventListener('change', () => {
    state.rating = Number(els.ratingFilter.value) || 0;
    applyFilters();
  });
  els.sortFilter.addEventListener('change', () => {
    state.sort = els.sortFilter.value;
    applyFilters();
  });

  els.gridView.addEventListener('click', () => applyView('grid'));
  els.listView.addEventListener('click', () => applyView('list'));

  els.resetFilters.addEventListener('click', resetAllFilters);
  els.emptyReset.addEventListener('click', resetAllFilters);
  els.loadMore.addEventListener('click', () => fetchMovies());

  els.activeFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear]');
    if (!button) return;
    const key = button.dataset.clear;
    if (key === 'query') {
      state.query = '';
      els.searchInput.value = '';
      els.searchClear.hidden = true;
    } else if (key === 'genre') {
      state.genre = 0;
    } else if (key === 'decade') {
      state.decade = 'all';
      els.decadeFilter.value = 'all';
    } else if (key === 'rating') {
      state.rating = 0;
      els.ratingFilter.value = '0';
    }
    applyFilters();
  });

  $$('[data-rail]').forEach((button) => {
    button.addEventListener('click', () => renderRail(button.dataset.rail));
  });
  els.rankRail.addEventListener('scroll', updateRailArrows, { passive: true });
  els.railPrev.addEventListener('click', () => {
    els.rankRail.scrollBy({ left: -Math.max(300, els.rankRail.clientWidth * 0.7), behavior: 'smooth' });
  });
  els.railNext.addEventListener('click', () => {
    els.rankRail.scrollBy({ left: Math.max(300, els.rankRail.clientWidth * 0.7), behavior: 'smooth' });
  });

  els.heroDots.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hero-index]');
    if (!button) return;
    showHero(Number(button.dataset.heroIndex));
    restartHeroTimer();
  });
  els.hero.addEventListener('mouseenter', () => clearInterval(state.heroTimer));
  els.hero.addEventListener('mouseleave', restartHeroTimer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(state.heroTimer);
    else restartHeroTimer();
  });

  els.heroDetail.addEventListener('click', () => {
    if (els.heroDetail.dataset.id) openDetail(Number(els.heroDetail.dataset.id));
  });
  els.heroFavorite.addEventListener('click', () => {
    const movie = state.hero[state.heroIndex];
    if (!movie) return;
    const added = toggleLibrary('favorites', movie);
    toast(added ? `《${movie.title}》已加入片单` : `《${movie.title}》已从片单移除`);
  });

  els.libraryButton.addEventListener('click', () => openLibrary('favorites'));
  els.mobileLibrary.addEventListener('click', () => openLibrary('favorites'));
  $('#footerLibrary').addEventListener('click', () => openLibrary('favorites'));
  $('#footerWatched').addEventListener('click', () => openLibrary('watched'));
  els.closeLibrary.addEventListener('click', () => closeLibrary());
  els.scrim.addEventListener('click', () => closeLibrary());
  els.closeDetail.addEventListener('click', () => closeDetail());

  $$('[data-library-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.drawerTab = button.dataset.libraryTab;
      renderLibrary();
    });
  });

  els.libraryList.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-id]');
    if (!remove) return;
    removeFromLibrary(remove.dataset.removeBucket, Number(remove.dataset.removeId));
  });

  els.detailContent.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-detail-favorite]');
    if (favorite && state.activeMovie) {
      const movie = state.activeMovie;
      const added = toggleLibrary('favorites', movie);
      toast(added ? `《${movie.title}》已加入片单` : `《${movie.title}》已从片单移除`);
      return;
    }

    const watched = event.target.closest('[data-detail-watched]');
    if (watched && state.activeMovie) {
      const movie = state.activeMovie;
      const added = toggleLibrary('watched', movie);
      toast(added ? `已标记《${movie.title}》为看过` : `《${movie.title}》已取消看过`);
      return;
    }

    const genre = event.target.closest('[data-genre-jump]');
    if (genre) {
      const name = genre.dataset.genreJump;
      const match = state.home?.genres?.find((entry) => entry.name === name);
      if (match) {
        closeDetail(false);
        state.genre = Number(match.id);
        applyFilters();
        $('#discover').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      }
    }
  });

  document.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      event.preventDefault();
      const id = Number(favorite.dataset.favorite);
      const movie = cachedMovie(id);
      if (!movie) return;
      const added = toggleLibrary('favorites', movie);
      toast(added ? `《${movie.title}》已加入片单` : `《${movie.title}》已从片单移除`);
      return;
    }

    const opener = event.target.closest('[data-open]');
    if (opener) {
      event.preventDefault();
      openDetail(Number(opener.dataset.open));
    }
  });

  $('#randomButton')?.addEventListener('click', () => randomMovie(false));
  $('#footerRandom')?.addEventListener('click', () => randomMovie(false));
  $('#surpriseButton')?.addEventListener('click', () => randomMovie(true));

  document.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        event.target.classList.add('is-broken');
        event.target.alt = '';
      }
    },
    true,
  );

  updateLibraryUI();
}

function updateLibraryUI() {
  syncLibraryUI();
}

boot();
