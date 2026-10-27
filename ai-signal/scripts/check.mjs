import { readFile } from 'node:fs/promises';

const payload = JSON.parse(await readFile(new URL('../public/data/articles.json', import.meta.url)));
const guides = JSON.parse(await readFile(new URL('../public/data/guides.json', import.meta.url)));
if (!Array.isArray(payload.articles) || payload.articles.length === 0) {
  throw new Error('articles.json 为空');
}
if (!Array.isArray(guides.guides) || guides.guides.length === 0) {
  throw new Error('guides.json 为空');
}
const ids = new Set(payload.articles.map((article) => article.id));
if (ids.size !== payload.articles.length) throw new Error('articles.json 存在重复 id');
console.log(`SIGNAL check: ${payload.articles.length} articles, ${guides.guides.length} guides`);
