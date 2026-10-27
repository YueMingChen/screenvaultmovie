import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { getJson, postJson } from './http.mjs';

const CJK = /[\u3400-\u9fff]/g;

export function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

export function hasChinese(value) {
  const text = String(value || '');
  if (!text) return false;
  const count = (text.match(CJK) || []).length;
  return count / Math.max(text.length, 1) > 0.15;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTranslation(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^["“”']|["“”']$/g, '')
    .trim();
}

export class Translator {
  constructor({ cacheFile, provider, maxChars }) {
    this.cacheFile = cacheFile;
    this.provider = (provider || 'none').toLowerCase();
    this.apiKey = process.env.TRANSLATION_API_KEY || '';
    this.baseUrl = (process.env.TRANSLATION_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    this.model = process.env.TRANSLATION_MODEL || 'deepseek-chat';
    this.maxChars = Number(maxChars) || 4800;
    this.usedChars = 0;
    this.cache = {};
    this.changed = false;
  }

  async load() {
    try {
      this.cache = JSON.parse(await readFile(this.cacheFile, 'utf8'));
    } catch {
      this.cache = {};
    }
  }

  async save() {
    if (!this.changed) return;
    await writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2) + '\n', 'utf8');
    this.changed = false;
  }

  async translate(text) {
    const original = String(text || '').trim();
    if (!original || hasChinese(original)) return original;
    if (this.provider === 'none') return '';

    const key = shortHash(original);
    if (this.cache[key]) return this.cache[key];
    if (this.usedChars >= this.maxChars) return '';

    let translated = '';
    try {
      if (this.provider === 'openai' && this.apiKey) {
        translated = await this.translateWithOpenAI(original);
      } else if (this.provider === 'mymemory') {
        translated = await this.translateWithMyMemory(original);
      }
    } catch (error) {
      console.warn(`  ! 翻译失败：${error.message}`);
      return '';
    }

    translated = cleanTranslation(translated);
    if (!translated || hasChinese(translated) === false) return '';

    this.usedChars += original.length;
    this.cache[key] = translated;
    this.changed = true;
    return translated;
  }

  async translateWithMyMemory(text) {
    const query = text.slice(0, 500);
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', query);
    url.searchParams.set('langpair', 'en|zh-CN');
    const payload = await getJson(url.toString(), {
      timeout: 20000,
      headers: { 'User-Agent': 'SIGNAL-AI/1.0 (+https://github.com)' },
    });
    if (payload.quotaFinished) throw new Error('MyMemory 今日额度已用完');
    if (payload.responseStatus && Number(payload.responseStatus) !== 200) {
      throw new Error(payload.responseDetails || `MyMemory ${payload.responseStatus}`);
    }
    const value = payload.responseData?.translatedText || '';
    if (!value || /MYMEMORY WARNING/i.test(value)) throw new Error('MyMemory 没有返回有效译文');
    await sleep(1050);
    return value;
  }

  async translateWithOpenAI(text) {
    const payload = await postJson(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              '你是科技媒体译者。把用户提供的英文 AI 新闻标题或摘要翻译成简洁、准确的简体中文。保留产品名、公司名和模型名的英文。只输出译文，不要解释。',
          },
          { role: 'user', content: text.slice(0, 1200) },
        ],
      },
      {
        timeout: 30000,
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    const value = payload.choices?.[0]?.message?.content || '';
    if (!value) throw new Error('翻译接口没有返回内容');
    return value;
  }
}
