import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Makes one rolling release (`tag`) hold exactly the files of `dir`: uploads
 * the new and changed ones, deletes the ones gone. Unchanged files are never
 * uploaded again. `index.json` goes last, so an index never lists a file that
 * is not there yet.
 *
 * @param {{ token: string, repository: string, tag: string, dir: string,
 *           api?: string, uploads?: string, fetch?: typeof fetch }} options
 * @returns {Promise<{ uploaded: string[], deleted: string[], kept: string[] }>}
 */
export async function syncRelease(options) {
  const { token, repository, tag, dir } = options;
  const api = options.api ?? 'https://api.github.com';
  const uploads = options.uploads ?? 'https://uploads.github.com';
  const http = options.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const call = async (method, url, body, extra = {}) => {
    const res = await http(url, { method, headers: { ...headers, ...extra.headers }, body });
    if (!res.ok && !(extra.allow ?? []).includes(res.status)) {
      throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
    }
    return res;
  };

  let res = await call('GET', `${api}/repos/${repository}/releases/tags/${tag}`, undefined, {
    allow: [404],
  });
  let release;
  if (res.status === 404) {
    res = await call(
      'POST',
      `${api}/repos/${repository}/releases`,
      JSON.stringify({
        tag_name: tag,
        name: 'Published quizzes',
        body: 'The quizzes of this repository, as the QuizDock community store reads them. Updated automatically on every change.',
        make_latest: 'true',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }
  release = await res.json();

  const assets = await listAssets(call, `${api}/repos/${repository}/releases/${release.id}/assets`);
  const wanted = readdirSync(dir).sort((a, b) =>
    a === 'index.json' ? 1 : b === 'index.json' ? -1 : a.localeCompare(b),
  );
  const uploaded = [];
  const deleted = [];
  const kept = [];

  for (const name of wanted) {
    const bytes = readFileSync(join(dir, name));
    const current = assets.find((a) => a.name === name);
    if (current && name !== 'index.json' && sameContent(current, bytes)) {
      kept.push(name);
      continue;
    }
    if (current) await call('DELETE', `${api}/repos/${repository}/releases/assets/${current.id}`);
    await call(
      'POST',
      `${uploads}/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
      bytes,
      { headers: { 'Content-Type': name.endsWith('.json') ? 'application/json' : 'application/zip' } },
    );
    uploaded.push(name);
  }
  for (const asset of assets) {
    if (wanted.includes(asset.name)) continue;
    await call('DELETE', `${api}/repos/${repository}/releases/assets/${asset.id}`);
    deleted.push(asset.name);
  }
  return { uploaded, deleted, kept };
}

async function listAssets(call, url) {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await call('GET', `${url}?per_page=100&page=${page}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

/** GitHub records a sha256 digest for each asset; without one, the file is uploaded again to be safe. */
function sameContent(asset, bytes) {
  if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
    return asset.digest === `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  return false;
}
