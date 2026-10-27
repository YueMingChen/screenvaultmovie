import { handleApiRequest, toWebResponse } from '../lib/vercel-api.mjs';

export async function GET(request) {
  try {
    const result = await handleApiRequest(request);
    return toWebResponse(result, 'GET');
  } catch (error) {
    console.error('Vercel API request failed:', error);
    return new Response(JSON.stringify({ error: '服务器出错了，请稍后再试', status: 500 }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

export async function HEAD(request) {
  try {
    const result = await handleApiRequest(request);
    return toWebResponse(result, 'HEAD');
  } catch (error) {
    console.error('Vercel API request failed:', error);
    return new Response(null, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
