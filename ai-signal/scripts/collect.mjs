import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getText } from '../lib/http.mjs';
import path from 'node:path';

import { parseFeed } from '../lib/rss.mjs';
import { Translator, hasChinese } from '../lib/translate.mjs';
import { SOURCES } from './sources.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ARTICLES_FILE = path.join(ROOT, 'public', 'data', 'articles.json');
const TRANSLATIONS_FILE = path.join(ROOT, 'data', 'translations.json');
const MAX_PER_SOURCE = Number(process.env.MAX_ITEMS_PER_SOURCE) || 30;
const MAX_ARTICLES = 500;
const MAX_AGE_DAYS = 120;

const AI_PATTERN =
  /(^|[^a-z])(ai|a\.i\.|llm|gpt|chatgpt|claude|gemini|deepseek|openai|anthropic|agent|agents|machine learning|deep learning|neural|transformer|diffusion|multimodal|rag|mcp|prompt|nvidia|artificial intelligence)([^a-z]|$)|人工智能|大模型|生成式|智能体|机器学习|深度学习|神经网络|算力|英伟达|提示词|多模态|开源模型|对齐|推理模型/i;

const GUIDE_PATTERN =
  /\b(how to|guide|tutorial|prompt engineering|cookbook|workflow|walkthrough|getting started|hands-on|cheat sheet|tips)\b|教程|指南|怎么|如何|上手|入门|技巧|提示词|工作流|实操|用法/i;
const LAUNCH_PATTERN =
  /\b(launch|launches|introduc|announc|release|releases|unveil|available|open-sourc|ships?)\b|发布|推出|上线|开放|问世|更新/i;
const RESEARCH_PATTERN =
  /\b(research|paper|benchmark|study|dataset|evaluation|arxiv|training)\b|论文|研究|基准|数据集|训练|评测/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 18);
}

function cleanSummary(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/^(点击查看原文|阅读原文|查看全文|查看更多|read more|continue reading)[>»\s.。:：-]*$/i.test(text)) {
    return '';
  }
  return text;
}

function categoryFor(item, source) {
  const text = `${item.title} ${item.summary}`;
  if (GUIDE_PATTERN.test(text)) return 'guide';
  if (RESEARCH_PATTERN.test(text) || source.category === 'research') return 'research';
  if (LAUNCH_PATTERN.test(text) || source.category === 'official') return 'launch';
  if (source.category === 'analysis') return 'analysis';
  return 'news';
}

function tagsFor(item, source, category) {
  const tags = new Set([category]);
  for (const tag of item.categories || []) {
    if (tag && tag.length < 28) tags.add(tag);
  }
  const text = `${item.title} ${item.summary}`;
  for (const [pattern, label] of [
    [/\b(agent|agents|智能体)\b/i, 'Agent'],
    [/\b(prompt|提示词)\b/i, 'Prompt'],
    [/\b(open[- ]?source|开源)\b/i, 'Open Source'],
    [/\b(multimodal|多模态)\b/i, 'Multimodal'],
    [/\b(video|视频生成)\b/i, 'Video'],
    [/\b(image|图像生成)\b/i, 'Image'],
    [/\b(code|coding|编程|代码)\b/i, 'Coding'],
  ]) {
    if (pattern.test(text)) tags.add(label);
  }
  return [...tags].slice(0, 5);
}

function readingMinutes(text, lang) {
  const value = String(text || '');
  const minutes =
    lang === 'zh'
      ? Math.ceil(value.length / 420)
      : Math.ceil(value.split(/\s+/).filter(Boolean).length / 220);
  return Math.max(2, Math.min(30, minutes));
}

async function fetchFeed(source) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await getText(source.feed, {
        timeout: 25000,
        headers: {
          'User-Agent': 'SIGNAL-AI/1.0 (+https://github.com; RSS aggregator)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(900);
    }
  }
  throw lastError;
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(ARTICLES_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, articles: [], sources: [], stats: {} };
  }
}

function sourcePayload(source, articles) {
  return {
    id: source.id,
    name: source.name,
    site: source.site,
    lang: source.lang,
    color: source.color,
    count: articles.filter((article) => article.sourceId === source.id).length,
  };
}

async function main() {
  const existing = await readExisting();
  const existingById = new Map((existing.articles || []).map((article) => [article.id, article]));
  const translator = new Translator({
    cacheFile: TRANSLATIONS_FILE,
    provider: process.env.TRANSLATION_PROVIDER || 'mymemory',
    maxChars: process.env.TRANSLATION_MAX_CHARS || 4800,
  });
  await translator.load();

  const fresh = [];
  const errors = [];
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const onlySources = new Set(
    String(process.env.ONLY_SOURCES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const selectedSources = onlySources.size
    ? SOURCES.filter((source) => onlySources.has(source.id))
    : SOURCES;

  for (const source of selectedSources) {
    console.log(`\n▸ ${source.name}`);
    try {
      const xml = await fetchFeed(source);
      const parsed = parseFeed(xml, source)
        .filter((item) => {
          const time = new Date(item.publishedAt).getTime();
          return Number.isFinite(time) && time >= cutoff;
        })
        .filter((item) => !source.filterAI || AI_PATTERN.test(`${item.title} ${item.summary}`))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, MAX_PER_SOURCE);

      console.log(`  ✓ ${parsed.length} 条`);
      fresh.push(...parsed);
    } catch (error) {
      errors.push({ source: source.id, message: error.message });
      console.log(`  ! 跳过：${error.message}`);
    }
  }

  if (!fresh.length && !existing.articles?.length) {
    throw new Error('所有来源都抓取失败，且没有旧数据可用');
  }

  const sourceById = new Map(SOURCES.map((source) => [source.id, source]));
  const merged = new Map(existingById);
  let newCount = 0;
  let translatedCount = 0;
  let changed = false;
  const maxTranslate = Number(process.env.TRANSLATION_MAX_ITEMS) || 24;

  const candidates = [...fresh].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
  );

  for (const item of candidates) {
    const source = sourceById.get(item.sourceId);
    if (!source) continue;
    const id = hash(item.url);
    const old = existingById.get(id);
    const summaryOriginal = cleanSummary(item.summary);
    const base = old || {
      id,
      titleOriginal: item.title,
      summaryOriginal,
      titleZh: '',
      summaryZh: '',
      translated: false,
      url: item.url,
      sourceId: source.id,
      sourceName: source.name,
      sourceSite: source.site,
      sourceColor: source.color,
      lang: source.lang,
      publishedAt: item.publishedAt,
      author: item.author || '',
      tags: [],
      category: 'news',
      readingMinutes: 2,
    };

    const category = categoryFor(item, source);
    const isChinese = source.lang === 'zh' || hasChinese(item.title);
    let titleZh = base.titleZh;
    let summaryZh = base.summaryZh;
    let translated = base.translated;
    const hasTranslatedTitle = Boolean(titleZh && hasChinese(titleZh));

    if (isChinese) {
      titleZh = item.title;
      summaryZh = summaryOriginal;
      translated = true;
    } else if ((!old || !hasTranslatedTitle) && translatedCount < maxTranslate) {
      const titleTranslation = await translator.translate(item.title);
      if (titleTranslation) {
        titleZh = titleTranslation;
        translated = true;
        const summaryTranslation = await translator.translate(item.summary);
        summaryZh = summaryTranslation || '';
        translatedCount += 1;
        await translator.save();
      }
    }

    const next = {
      ...base,
      titleOriginal: item.title,
      summaryOriginal,
      titleZh: titleZh || item.title,
      summaryZh: summaryZh || '',
      translated,
      url: item.url,
      author: item.author || base.author || '',
      publishedAt: item.publishedAt,
      category,
      tags: tagsFor(item, source, category),
      readingMinutes: readingMinutes(`${item.title} ${item.summary}`, source.lang),
    };

    if (!old || JSON.stringify(old) !== JSON.stringify(next)) changed = true;
    if (!old) newCount += 1;
    merged.set(id, next);
  }

  const articles = [...merged.values()]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ARTICLES);

  const sources = SOURCES.map((source) => sourcePayload(source, articles));
  const stats = {
    total: articles.length,
    guides: articles.filter((article) => article.category === 'guide').length,
    translated: articles.filter((article) => article.translated && article.lang !== 'zh').length,
    sources: sources.filter((source) => source.count > 0).length,
  };

  const previousComparable = JSON.stringify({
    articles: existing.articles || [],
    sources: existing.sources || [],
    stats: existing.stats || {},
  });
  const nextComparable = JSON.stringify({ articles, sources, stats });
  const payload = {
    generatedAt: previousComparable === nextComparable ? existing.generatedAt : new Date().toISOString(),
    articles,
    sources,
    stats,
  };

  await mkdir(path.dirname(ARTICLES_FILE), { recursive: true });
  await writeFile(ARTICLES_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await translator.save();

  console.log('');
  console.log(`  ✓ 写入 ${articles.length} 条，新增 ${newCount} 条，翻译 ${translatedCount} 条`);
  console.log(`  · 指南 ${stats.guides} 条，来源 ${stats.sources} 个`);
  console.log(`  · 输出 ${ARTICLES_FILE}`);
  if (errors.length) console.log(`  · ${errors.length} 个来源暂时不可用`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n采集失败：', error.message);
    process.exit(1);
  });
