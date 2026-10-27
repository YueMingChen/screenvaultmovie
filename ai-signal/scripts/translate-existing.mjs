import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Translator, hasChinese } from '../lib/translate.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ARTICLES_FILE = path.join(ROOT, 'public', 'data', 'articles.json');
const TRANSLATIONS_FILE = path.join(ROOT, 'data', 'translations.json');
const maxItems = Number(process.env.TRANSLATION_MAX_ITEMS) || 24;

const payload = JSON.parse(await readFile(ARTICLES_FILE, 'utf8'));
const translator = new Translator({
  cacheFile: TRANSLATIONS_FILE,
  provider: process.env.TRANSLATION_PROVIDER || 'mymemory',
  maxChars: process.env.TRANSLATION_MAX_CHARS || 4800,
});
await translator.load();

let count = 0;
for (const article of payload.articles) {
  if (count >= maxItems) break;
  if (article.lang === 'zh' || hasChinese(article.titleZh || '')) continue;

  const title = await translator.translate(article.titleOriginal);
  if (!title) {
    console.log(`  - 跳过：${article.titleOriginal.slice(0, 60)}`);
    continue;
  }

  const summary = article.summaryOriginal ? await translator.translate(article.summaryOriginal) : '';
  article.titleZh = title;
  article.summaryZh = summary || '';
  article.translated = true;
  count += 1;
  console.log(`  ✓ ${count}/${maxItems} ${title}`);
  await translator.save();
  await writeFile(ARTICLES_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

payload.generatedAt = new Date().toISOString();
payload.stats.translated = payload.articles.filter(
  (article) => article.translated && article.lang !== 'zh',
).length;
await writeFile(ARTICLES_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
await translator.save();
console.log(`\n完成：新增 ${count} 条翻译，共 ${payload.stats.translated} 条英文文章有中文标题。`);

process.exit(0);
