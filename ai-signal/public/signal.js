const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const CJK = /[\u3400-\u9fff]/;
const PAGE_SIZE = 14;

const CATEGORY = {
  all: '全部',
  news: '新闻',
  launch: '发布',
  guide: '教程',
  research: '研究',
  analysis: '观点',
};

const TOOLS = [
  { name: 'ChatGPT', category: '通用', desc: '从写作、分析到 Agent 任务，最完整的大众 AI 工作台。', url: 'https://chatgpt.com/' },
  { name: 'Claude', category: '写作 / 代码', desc: '长文本理解、写作质感与代码协作都很稳，适合深度任务。', url: 'https://claude.ai/' },
  { name: 'Gemini', category: '研究 / 多模态', desc: 'Google 生态里的多模态助手，适合搜索、图像和文档。', url: 'https://gemini.google.com/' },
  { name: 'DeepSeek', category: '推理 / 中文', desc: '中文理解与推理能力强，API 价格友好，适合开发者。', url: 'https://chat.deepseek.com/' },
  { name: 'Perplexity', category: '搜索', desc: '带来源的 AI 搜索，适合快速建立一个新领域的资料地图。', url: 'https://www.perplexity.ai/' },
  { name: 'Cursor', category: '编程', desc: '把 AI 放进代码编辑器，适合在真实项目里小步修改和验证。', url: 'https://www.cursor.com/' },
];

const state = {
  articles: [],
  sources: [],
  guides: [],
  stats: {},
  generatedAt: null,
  filters: { q: '', category: 'all', source: 'all', time: 'all' },
  savedOnly: false,
  visible: PAGE_SIZE,
  saved: loadSaved(),
  translations: loadTranslations(),
  currentArticle: null,
  currentGuide: null,
  lastFocus: null,
  searchTimer: null,
  toastTimer: null,
  layer: null,
};

function loadSaved() {
  try {
    const value = JSON.parse(localStorage.getItem('signal:saved:v1') || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSaved() {
  try {
    localStorage.setItem('signal:saved:v1', JSON.stringify([...state.saved]));
  } catch {
    /* localStorage may be unavailable */
  }
}

function loadTranslations() {
  try {
    return JSON.parse(localStorage.getItem('signal:translations:v1') || '{}');
  } catch {
    return {};
  }
}

function saveTranslations() {
  try {
    localStorage.setItem('signal:translations:v1', JSON.stringify(state.translations));
  } catch {
    /* ignore */
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

function hasChinese(value) {
  return CJK.test(String(value || ''));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function categoryLabel(category) {
  return CATEGORY[category] || category || '信号';
}

function formatRelative(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  const date = new Date(time);
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatClock(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function sourceFor(article) {
  return state.sources.find((source) => source.id === article.sourceId) || {};
}

function sourceColor(article) {
  return article.sourceColor || sourceFor(article).color || '#11120f';
}

function readingText(article) {
  return `${article.readingMinutes || 2} 分钟阅读`;
}

function articleTitle(article) {
  return article.titleZh || article.titleOriginal || '未命名信号';
}

function summaryText(article) {
  return article.summaryZh || article.summaryOriginal || `来自 ${article.sourceName} 的最新信号，点击阅读原文查看完整内容。`;
}

function isTranslated(article) {
  return article.lang === 'zh' || Boolean(article.titleZh && hasChinese(article.titleZh));
}

function articleById(id) {
  return state.articles.find((article) => String(article.id) === String(id));
}

function matches(article) {
  const { q, category, source, time } = state.filters;
  if (state.savedOnly && !state.saved.has(String(article.id))) return false;
  if (category !== 'all' && article.category !== category) return false;
  if (source !== 'all' && article.sourceId !== source) return false;
  if (time !== 'all') {
    const age = Date.now() - new Date(article.publishedAt).getTime();
    if (!Number.isFinite(age) || age > Number(time) * 3600000) return false;
  }
  if (q) {
    const haystack = [
      article.titleZh,
      article.titleOriginal,
      article.summaryZh,
      article.summaryOriginal,
      article.sourceName,
      ...(article.tags || []),
    ]
      .join(' ')
      .toLowerCase();
    if (!q.toLowerCase().split(/\s+/).every((term) => haystack.includes(term))) return false;
  }
  return true;
}

function filteredArticles() {
  return state.articles.filter(matches);
}

function setHero(article) {
  if (!article) return;
  state.hero = article;
  $('#heroCategory').textContent = categoryLabel(article.category);
  $('#heroTitle').textContent = articleTitle(article);
  const original = article.titleOriginal && article.titleOriginal !== article.titleZh ? article.titleOriginal : '';
  $('#heroOriginal').textContent = original;
  $('#heroSummary').textContent = summaryText(article);
  $('#heroMeta').innerHTML = [
    `<span class="meta-source">${escapeHtml(article.sourceName)}</span>`,
    '<span class="meta-sep"></span>',
    `<span>${escapeHtml(formatRelative(article.publishedAt))}</span>`,
    '<span class="meta-sep"></span>',
    `<span>${escapeHtml(readingText(article))}</span>`,
    isTranslated(article) ? '' : '<span class="meta-sep"></span><span>EN / 待翻译</span>',
  ].join('');
  $('#heroOpen').dataset.open = article.id;
  $('#heroSave').dataset.save = article.id;
  $('#heroSource').href = article.url;
  $('#heroSource').textContent = '';
  $('#heroSource').insertAdjacentHTML('beforeend', `原文 <svg class="icon"><use href="#i-external"></use></svg>`);
  syncSaveButtons();
}

function setupHero() {
  const translated = state.articles.filter((article) => isTranslated(article));
  const lead =
    translated.find((article) => article.category !== 'guide') ||
    translated[0] ||
    state.articles.find((article) => article.category !== 'guide') ||
    state.articles[0];
  if (!lead) return;
  setHero(lead);

  const sidePool = translated.length >= 5 ? translated : state.articles;
  const side = sidePool.filter((article) => article.id !== lead.id).slice(0, 4);
  $('#heroSideCount').textContent = pad(side.length);
  $('#heroSideList').innerHTML = side
    .map(
      (article, index) => `
        <button class="hero-side-item" type="button" data-open="${article.id}">
          <span class="side-item-index">${pad(index + 1)}</span>
          <span>
            <h3>${escapeHtml(articleTitle(article))}</h3>
            <p>${escapeHtml(article.sourceName)} · ${escapeHtml(formatRelative(article.publishedAt))}</p>
          </span>
        </button>`,
    )
    .join('');
  $('#heroSideDate').textContent = formatDate(new Date()).replaceAll('.', '.');
  $('#heroSideDate').textContent = formatDate(new Date()).slice(5);
}

function setupTicker() {
  const translated = state.articles.filter((article) => isTranslated(article));
  const pool = translated.length >= 9 ? translated : state.articles;
  const items = pool.slice(0, 9).map(
    (article, index) =>
      `<span><b>${pad(index + 1)}</b>${escapeHtml(articleTitle(article))}</span>`,
  );
  $('#tickerTrack').innerHTML = `${items.join('')}${items.join('')}`;
}

function setupMeta() {
  const stats = state.stats || {};
  $('#statArticles').textContent = String(stats.total ?? state.articles.length);
  $('#statSources').textContent = String(stats.sources ?? state.sources.filter((source) => source.count).length);
  $('#statGuides').textContent = String(state.guides.length);
  $('#liveCopy').textContent = `${state.articles.length} 条信号 · ${state.sources.filter((source) => source.count).length} 个来源`;
  $('#liveUpdated').textContent = `更新于 ${formatClock(state.generatedAt)}`;
  $('#yearNow').textContent = String(new Date().getFullYear());
}

function renderCategoryFilter() {
  const counts = { all: state.articles.length };
  for (const article of state.articles) {
    counts[article.category] = (counts[article.category] || 0) + 1;
  }
  const categories = ['all', 'news', 'launch', 'guide', 'research', 'analysis'];
  $('#categoryFilter').innerHTML = categories
    .map(
      (category) =>
        `<button class="category-chip ${state.filters.category === category ? 'is-active' : ''}" type="button" data-category="${category}">
          ${categoryLabel(category)}<small>${counts[category] || 0}</small>
        </button>`,
    )
    .join('');
}

function renderSourceFilter() {
  const options = state.sources
    .filter((source) => source.count)
    .sort((a, b) => b.count - a.count)
    .map((source) => `<option value="${source.id}">${escapeHtml(source.name)} (${source.count})</option>`);
  $('#sourceFilter').innerHTML = `<option value="all">全部来源</option>${options.join('')}`;
  $('#sourceFilter').value = state.filters.source;
}

function renderSidebar() {
  $('#miniGuides').innerHTML = state.guides
    .slice(0, 3)
    .map(
      (guide, index) => `
        <button class="mini-guide" type="button" data-guide="${guide.id}">
          <span class="mini-guide-index">${pad(index + 1)}</span>
          <span>
            <h3>${escapeHtml(guide.title)}</h3>
            <p>${escapeHtml(guide.category)} · ${guide.minutes} MIN</p>
          </span>
        </button>`,
    )
    .join('');

  $('#miniTools').innerHTML = TOOLS.slice(0, 5)
    .map(
      (tool) => `
        <a class="mini-tool" href="${tool.url}" target="_blank" rel="noreferrer">
          <span><strong>${tool.name}</strong><span>${tool.category}</span></span>
          <span>↗</span>
        </a>`,
    )
    .join('');
}

function renderGuides() {
  $('#guideGrid').innerHTML = state.guides
    .map(
      (guide, index) => `
        <button class="guide-card" type="button" data-guide="${guide.id}">
          <span class="guide-card-top">
            <span>${escapeHtml(guide.category)} / ${escapeHtml(guide.level)}</span>
            <span class="guide-card-number">${pad(index + 1)}</span>
          </span>
          <h3>${escapeHtml(guide.title)}</h3>
          <p>${escapeHtml(guide.subtitle)}</p>
          <span class="guide-card-foot">
            <span>${guide.minutes} MIN READ</span>
            <svg class="icon"><use href="#i-arrow"></use></svg>
          </span>
        </button>`,
    )
    .join('');
}

function renderTools() {
  $('#toolGrid').innerHTML = TOOLS.map(
    (tool) => `
      <a class="tool-card" href="${tool.url}" target="_blank" rel="noreferrer">
        <span class="tool-card-top">
          <span class="tool-card-name">${tool.name}</span>
          <span class="tool-card-category">${tool.category}</span>
        </span>
        <p>${tool.desc}</p>
        <span class="tool-card-foot"><span>打开官网</span><svg class="icon"><use href="#i-external"></use></svg></span>
      </a>`,
  ).join('');
}

function storyMarkup(article, index) {
  const translated = isTranslated(article);
  const original = article.titleOriginal || '';
  const showOriginal = original && original !== article.titleZh;
  return `
    <article class="story" data-id="${article.id}">
      <span class="story-index">${pad(index + 1)}</span>
      <button class="story-body" type="button" data-open="${article.id}">
        <span class="story-meta">
          <span class="story-category ${article.category}">${categoryLabel(article.category)}</span>
          ${translated ? '' : '<span class="story-flag">EN / 原文</span>'}
          <span>${escapeHtml(article.sourceName)}</span>
          <span>·</span>
          <span>${escapeHtml(formatRelative(article.publishedAt))}</span>
        </span>
        <h3>${escapeHtml(articleTitle(article))}</h3>
        ${showOriginal ? `<p class="story-original">${escapeHtml(original)}</p>` : ''}
        <p class="story-summary">${escapeHtml(summaryText(article))}</p>
      </button>
      <div class="story-side">
        <span class="story-source"><i class="source-dot" style="background:${sourceColor(article)}"></i>${escapeHtml(article.sourceName)}</span>
        <span>${escapeHtml(readingText(article))}</span>
        <button class="bookmark-button ${state.saved.has(String(article.id)) ? 'is-active' : ''}" type="button" data-save="${article.id}" aria-label="保存这条信号" aria-pressed="${state.saved.has(String(article.id))}">
          <svg class="icon"><use href="#i-bookmark"></use></svg>
        </button>
      </div>
    </article>`;
}

function renderFeed() {
  const articles = filteredArticles();
  const visible = articles.slice(0, state.visible);
  $('#storyList').innerHTML = visible.map(storyMarkup).join('');
  $('#feedCount').textContent = `${articles.length} 条`;
  $('#resultSummary').textContent = state.savedOnly
    ? `已保存 ${articles.length} 条 / 共 ${state.articles.length} 条信号`
    : `${articles.length} 条信号 · ${state.sources.filter((source) => source.count).length} 个来源`;
  $('#feedLabel').textContent = state.savedOnly
    ? 'SAVED SIGNALS'
    : state.filters.category === 'all'
      ? 'ALL SIGNALS'
      : `${categoryLabel(state.filters.category).toUpperCase()} SIGNALS`;

  const active = Boolean(state.filters.q || state.filters.category !== 'all' || state.filters.source !== 'all' || state.filters.time !== 'all' || state.savedOnly);
  $('#clearFilters').hidden = !active;
  $('#emptyState').hidden = articles.length > 0;
  $('#storyList').hidden = articles.length === 0;

  const remaining = articles.length - visible.length;
  $('#loadMore').hidden = remaining <= 0;
  $('#loadCount').textContent = remaining > 0 ? `(${remaining})` : '';

  $('#categoryFilter').innerHTML = ['all', 'news', 'launch', 'guide', 'research', 'analysis']
    .map((category) => {
      const count =
        category === 'all'
          ? state.articles.length
          : state.articles.filter((article) => article.category === category).length;
      return `<button class="category-chip ${state.filters.category === category ? 'is-active' : ''}" type="button" data-category="${category}">${categoryLabel(category)}<small>${count}</small></button>`;
    })
    .join('');

  $('#savedButton').setAttribute('aria-pressed', String(state.savedOnly));
  $('#savedButton').classList.toggle('is-active', state.savedOnly);
  updateSavedCount();
  syncSaveButtons();
}

function updateSavedCount() {
  $('#savedCount').textContent = String(state.saved.size);
}

function syncSaveButtons() {
  $$('[data-save]').forEach((button) => {
    const active = state.saved.has(String(button.dataset.save));
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? '取消保存' : '保存这条信号';
    if (button.id === 'heroSave') {
      const label = button.querySelector('span');
      if (label) label.textContent = active ? '已保存' : '保存';
    }
  });
}

function refreshAfterDataChange() {
  renderFeed();
  setupHero();
  setupTicker();
  setupMeta();
}

function toggleSave(id) {
  const key = String(id);
  if (state.saved.has(key)) state.saved.delete(key);
  else state.saved.add(key);
  saveSaved();
  updateSavedCount();
  syncSaveButtons();
  if (state.savedOnly) renderFeed();
  if (String(state.currentArticle?.id) === key) renderArticleModal();
  toast(state.saved.has(key) ? '已保存到你的信号列表' : '已取消保存');
}

function closeLayers() {
  const modal = $('#articleModal');
  const guide = $('#guideModal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  guide.classList.remove('is-open');
  guide.setAttribute('aria-hidden', 'true');
  const backdrop = $('#modalBackdrop');
  backdrop.classList.remove('is-visible');
  setTimeout(() => {
    if (!modal.classList.contains('is-open') && !guide.classList.contains('is-open')) backdrop.hidden = true;
  }, 320);
  document.body.classList.remove('is-locked');
  state.layer = null;
  if (state.lastFocus instanceof HTMLElement) state.lastFocus.focus({ preventScroll: true });
}

function openLayer(modal) {
  state.lastFocus = document.activeElement;
  $('#modalBackdrop').hidden = false;
  requestAnimationFrame(() => $('#modalBackdrop').classList.add('is-visible'));
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
  state.layer = modal;
}

function articleModalMarkup(article) {
  const translated = isTranslated(article);
  const originalSummary = article.summaryOriginal || '';
  const chineseSummary = article.summaryZh || '';
  return `
    <div class="article-topline">
      <span class="tag">${categoryLabel(article.category)}</span>
      <span>${escapeHtml(article.sourceName)}</span>
      <span>·</span>
      <span>${escapeHtml(formatRelative(article.publishedAt))}</span>
      <span>·</span>
      <span>${escapeHtml(readingText(article))}</span>
    </div>
    <h1 id="articleTitle">${escapeHtml(articleTitle(article))}</h1>
    ${article.titleOriginal && article.titleOriginal !== article.titleZh ? `<p class="article-original-title">${escapeHtml(article.titleOriginal)}</p>` : ''}
    <div class="article-byline">
      <span>来源 <strong>${escapeHtml(article.sourceName)}</strong></span>
      <span>发布 ${escapeHtml(formatDate(article.publishedAt))}</span>
      <span>${translated ? '中文标题已生成' : '英文原文'}</span>
    </div>
    <p class="article-summary">${escapeHtml(chineseSummary || originalSummary || '这条信号没有提供摘要，点击阅读原文查看完整内容。')}</p>
    ${
      originalSummary && originalSummary !== chineseSummary
        ? `<div class="article-original-block"><h3>ORIGINAL SUMMARY</h3><p>${escapeHtml(originalSummary)}</p></div>`
        : ''
    }
    <div class="article-actions">
      <a class="button button-dark" href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">阅读原文 <svg class="icon"><use href="#i-external"></use></svg></a>
      <button class="button button-line" type="button" data-save="${article.id}">
        <svg class="icon"><use href="#i-bookmark"></use></svg><span>${state.saved.has(String(article.id)) ? '已保存' : '保存'}</span>
      </button>
      <button class="button button-line" type="button" data-translate="${article.id}">
        <svg class="icon"><use href="#i-translate"></use></svg><span>翻译摘要</span>
      </button>
    </div>
    <p class="translation-status ${translated ? '' : 'is-error'}" id="translationStatus">
      ${
        translated
          ? '机器翻译由 MyMemory / LLM 提供，专有名词保留英文，可能存在误差。'
          : '当前只有英文内容，点“翻译摘要”生成中文；也可以直接阅读原文。'
      }
    </p>
    <div class="article-tags">${(article.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function openArticle(id) {
  const article = articleById(id);
  if (!article) return;
  state.currentArticle = article;
  closeGuideSilently();
  $('#articleContent').innerHTML = articleModalMarkup(article);
  $('#articleContent').scrollTop = 0;
  openLayer($('#articleModal'));
  $('#articleClose').focus({ preventScroll: true });
  if (!isTranslated(article)) {
    setTimeout(() => ensureTranslation(article), 180);
  }
}

function closeGuideSilently() {
  const guide = $('#guideModal');
  if (guide.classList.contains('is-open')) {
    guide.classList.remove('is-open');
    guide.setAttribute('aria-hidden', 'true');
  }
}

function closeArticle() {
  if (state.layer !== $('#articleModal')) return;
  closeLayers();
}

function openGuide(id) {
  const guide = state.guides.find((item) => item.id === id);
  if (!guide) return;
  state.currentGuide = guide;
  $('#guideContent').innerHTML = `
    <div class="article-topline">
      <span class="tag">${escapeHtml(guide.category)}</span>
      <span>${escapeHtml(guide.level)}</span>
      <span>·</span>
      <span>${guide.minutes} 分钟</span>
    </div>
    <h1 id="guideTitle">${escapeHtml(guide.title)}</h1>
    <p class="guide-subtitle">${escapeHtml(guide.subtitle)}</p>
    <p class="guide-intro">${escapeHtml(guide.summary)}</p>
    <div class="guide-steps">
      ${guide.steps
        .map(
          (step, index) => `
            <div class="guide-step">
              <span class="guide-step-number">${pad(index + 1)}</span>
              <div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.body)}</p></div>
            </div>`,
        )
        .join('')}
    </div>
    <div class="guide-links">
      ${(guide.links || [])
        .map(
          (link) =>
            `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)} <svg class="icon"><use href="#i-external"></use></svg></a>`,
        )
        .join('')}
    </div>`;
  $('#guideContent').scrollTop = 0;
  openLayer($('#guideModal'));
  $('#guideClose').focus({ preventScroll: true });
}

function closeGuide() {
  if (state.layer !== $('#guideModal')) return;
  closeLayers();
}

async function translateText(text) {
  if (!text || hasChinese(text)) return text;
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text.slice(0, 500));
  url.searchParams.set('langpair', 'en|zh-CN');
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error(`翻译服务 ${response.status}`);
  const payload = await response.json();
  const value = payload.responseData?.translatedText || '';
  if (!value || /MYMEMORY WARNING/i.test(value)) throw new Error('没有返回有效译文');
  return value;
}

async function ensureTranslation(article) {
  if (!article || isTranslated(article)) return;
  const status = $('#translationStatus');
  if (status) status.textContent = '正在生成中文，请稍候…';
  try {
    const title = await translateText(article.titleOriginal);
    const summary = article.summaryOriginal ? await translateText(article.summaryOriginal) : '';
    article.titleZh = title;
    article.summaryZh = summary;
    article.translated = true;
    state.translations[article.id] = { title, summary };
    saveTranslations();
    if (state.currentArticle?.id === article.id) {
      $('#articleContent').innerHTML = articleModalMarkup(article);
      $('#articleContent').scrollTop = 0;
    }
    renderFeed();
    if (state.hero?.id === article.id) setHero(article);
    toast('已生成中文翻译');
  } catch (error) {
    if (status) {
      status.textContent = '机器翻译暂不可用，请阅读英文原文。';
      status.classList.add('is-error');
    }
    console.warn(error);
  }
}

function applyTranslations() {
  for (const article of state.articles) {
    const cached = state.translations[article.id];
    if (!cached) continue;
    if (cached.title) article.titleZh = cached.title;
    if (cached.summary) article.summaryZh = cached.summary;
    if (cached.title) article.translated = true;
  }
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2300);
}

function resetFilters() {
  state.filters = { q: '', category: 'all', source: 'all', time: 'all' };
  state.savedOnly = false;
  state.visible = PAGE_SIZE;
  $('#searchInput').value = '';
  $('#sourceFilter').value = 'all';
  $('#timeFilter').value = 'all';
  renderFeed();
}

function bindEvents() {
  $('#searchForm').addEventListener('submit', (event) => event.preventDefault());
  $('#searchInput').addEventListener('input', (event) => {
    const value = event.target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.filters.q = value.trim();
      state.visible = PAGE_SIZE;
      renderFeed();
    }, 180);
  });

  $('#categoryFilter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.filters.category = button.dataset.category;
    state.savedOnly = false;
    state.visible = PAGE_SIZE;
    renderFeed();
  });

  $('#sourceFilter').addEventListener('change', (event) => {
    state.filters.source = event.target.value;
    state.visible = PAGE_SIZE;
    renderFeed();
  });

  $('#timeFilter').addEventListener('change', (event) => {
    state.filters.time = event.target.value;
    state.visible = PAGE_SIZE;
    renderFeed();
  });

  $('#clearFilters').addEventListener('click', resetFilters);
  $('#emptyReset').addEventListener('click', resetFilters);
  $('#loadMore').addEventListener('click', () => {
    state.visible += PAGE_SIZE;
    renderFeed();
  });

  $('#savedButton').addEventListener('click', () => {
    state.savedOnly = !state.savedOnly;
    state.filters.category = 'all';
    state.visible = PAGE_SIZE;
    renderFeed();
    $('#latest').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#heroOpen').addEventListener('click', () => {
    if (state.hero) openArticle(state.hero.id);
  });
  $('#heroSave').addEventListener('click', () => {
    if (state.hero) toggleSave(state.hero.id);
  });

  $('#articleClose').addEventListener('click', closeArticle);
  $('#guideClose').addEventListener('click', closeGuide);
  $('#modalBackdrop').addEventListener('click', closeLayers);

  document.addEventListener('click', (event) => {
    const save = event.target.closest('[data-save]');
    if (save) {
      event.preventDefault();
      event.stopPropagation();
      toggleSave(save.dataset.save);
      return;
    }
    const guide = event.target.closest('[data-guide]');
    if (guide) {
      event.preventDefault();
      openGuide(guide.dataset.guide);
      return;
    }
    const open = event.target.closest('[data-open]');
    if (open) {
      event.preventDefault();
      openArticle(open.dataset.open);
      return;
    }
    const translate = event.target.closest('[data-translate]');
    if (translate) {
      const article = articleById(translate.dataset.translate);
      if (article) ensureTranslation(article);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.layer) closeLayers();
    if (event.key === '/' && !state.layer) {
      const target = event.target;
      const typing = target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (!typing) {
        event.preventDefault();
        $('#searchInput').focus();
      }
    }
    if (event.key === 'Tab' && state.layer) {
      const focusable = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])', state.layer).filter(
        (node) => node.getClientRects().length > 0,
      );
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
  });
}

function showSkeletons() {
  $('#storyList').innerHTML = Array.from({ length: 7 }, () => '<div class="skeleton"></div>').join('');
}

async function boot() {
  showSkeletons();
  bindEvents();
  try {
    const [articlesResponse, guidesResponse] = await Promise.all([
      fetch('/data/articles.json'),
      fetch('/data/guides.json'),
    ]);
    if (!articlesResponse.ok) throw new Error(`资讯数据 ${articlesResponse.status}`);
    if (!guidesResponse.ok) throw new Error(`指南数据 ${guidesResponse.status}`);
    const articlesData = await articlesResponse.json();
    const guidesData = await guidesResponse.json();
    state.articles = articlesData.articles || [];
    state.sources = articlesData.sources || [];
    state.stats = articlesData.stats || {};
    state.generatedAt = articlesData.generatedAt;
    state.guides = guidesData.guides || [];
    applyTranslations();
    setupMeta();
    setHero(state.articles.find((article) => article.category !== 'guide') || state.articles[0]);
    setupHero();
    setupTicker();
    renderSourceFilter();
    renderSidebar();
    renderGuides();
    renderTools();
    renderFeed();
    updateSavedCount();
  } catch (error) {
    console.error(error);
    $('#heroTitle').textContent = '信号暂时中断';
    $('#heroSummary').textContent = '数据没有成功载入，请稍后刷新页面，或检查 public/data/articles.json。';
    $('#storyList').innerHTML = '';
    $('#emptyState').hidden = false;
    $('#resultSummary').textContent = '数据读取失败';
    toast('资讯数据读取失败');
  }
}

boot();
