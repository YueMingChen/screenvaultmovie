import { cp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, 'dist');
const dataFile = path.join(root, 'data', 'movies.json');

const payload = JSON.parse(await readFile(dataFile, 'utf8'));
if (!Array.isArray(payload.movies) || payload.movies.length === 0) {
  throw new Error('data/movies.json 中没有电影数据');
}

await rm(outputDir, { recursive: true, force: true });
await cp(publicDir, outputDir, { recursive: true });

console.log(`Vercel build: ${payload.movies.length} movies, static files copied to dist/`);
