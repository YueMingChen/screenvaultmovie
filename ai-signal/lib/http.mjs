import http from 'node:http';
import https from 'node:https';

function request(url, { method = 'GET', headers = {}, body, timeout = 25000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'http:' ? http : https;
    const payload = body ? Buffer.from(body) : null;
    const req = transport.request(
      target,
      {
        method,
        family: 4,
        agent: false,
        headers: {
          'Accept-Encoding': 'identity',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, target).toString();
          request(next, { method, headers, body, timeout, redirects: redirects - 1 }).then(
            resolve,
            reject,
          );
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`HTTP ${res.statusCode}`);
            error.status = res.statusCode;
            error.body = text.slice(0, 300);
            reject(error);
            return;
          }
          resolve({ status: res.statusCode, headers: res.headers, text });
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
    if (payload) req.write(payload);
    req.end();
  });
}

export function getText(url, options = {}) {
  return request(url, options).then((response) => response.text);
}

export function getJson(url, options = {}) {
  return request(url, options).then((response) => JSON.parse(response.text));
}

export function postJson(url, payload, options = {}) {
  return request(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).then((response) => JSON.parse(response.text));
}
