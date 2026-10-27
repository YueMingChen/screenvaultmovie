import { readFile } from 'node:fs/promises';

/**
 * 读取一个极简的 .env 文件。已存在的环境变量不会被覆盖。
 * 这样项目无需安装 dotenv 也能开箱即用。
 */
export async function loadEnv(fileUrl) {
  let text;
  try {
    text = await readFile(fileUrl, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
