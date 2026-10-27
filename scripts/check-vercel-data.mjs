import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.join(process.cwd(), 'data', 'movies.json');
const payload = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(payload.movies) || payload.movies.length === 0) {
  throw new Error('data/movies.json 中没有电影数据');
}
console.log(`Vercel build check: ${payload.movies.length} movies ready`);
