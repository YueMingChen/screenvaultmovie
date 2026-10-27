import { handleApiRequest } from '../lib/vercel-api.mjs';

export default async function handler(req, res) {
  try {
    const result = await handleApiRequest(req);
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(result.headers || {})) {
      res.setHeader(key, value);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', result.cache);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const body = JSON.stringify(result.body);
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  } catch (error) {
    console.error('Vercel API request failed:', error);
    if (!res.headersSent) {
      const body = JSON.stringify({ error: '服务器出错了，请稍后再试', status: 500 });
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end(body);
    } else {
      res.end();
    }
  }
}
