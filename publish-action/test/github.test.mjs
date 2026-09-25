import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { syncRelease } from '../src/github.mjs';

const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** A fake GitHub API: one release, its assets, and the calls made to it. */
function fakeGitHub({ release = true, assets = [] } = {}) {
  const calls = [];
  const fetch = async (url, { method, body }) => {
    calls.push(`${method} ${url.replace(/^https:\/\/[^/]+/, '')}`);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === 'GET' && url.includes('/releases/tags/')) {
      return release ? json({ id: 7 }) : json({ message: 'Not Found' }, 404);
    }
    if (method === 'POST' && url.endsWith('/releases')) return json({ id: 7, ...JSON.parse(body) }, 201);
    if (method === 'GET' && url.includes('/releases/7/assets')) return json(assets);
    return method === 'DELETE' ? new Response(null, { status: 204 }) : json({}, 201);
  };
  return { fetch, calls };
}

function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rel-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test('uploads what changed, keeps what did not, deletes what is gone, index last', async () => {
  const gh = fakeGitHub({
    assets: [
      { id: 1, name: 'same.quizdock.zip', digest: sha('same') },
      { id: 2, name: 'changed.quizdock.zip', digest: sha('old') },
      { id: 3, name: 'gone.quizdock.zip', digest: sha('gone') },
      { id: 4, name: 'index.json', digest: sha('{}') },
    ],
  });
  const dir = folder({
    'same.quizdock.zip': 'same',
    'changed.quizdock.zip': 'new',
    'added.quizdock.zip': 'added',
    'index.json': '{}',
  });
  const result = await syncRelease({ token: 't', repository: 'alice/quizdock-quizzes', tag: 'quizzes', dir, fetch: gh.fetch });
  assert.deepEqual(result.kept, ['same.quizdock.zip']);
  assert.deepEqual(result.uploaded, ['added.quizdock.zip', 'changed.quizdock.zip', 'index.json']);
  assert.deepEqual(result.deleted, ['gone.quizdock.zip']);
  const uploads = gh.calls.filter((c) => c.includes('assets?name='));
  assert.match(uploads.at(-1), /name=index\.json$/);
});

test('creates the release on the first run', async () => {
  const gh = fakeGitHub({ release: false });
  await syncRelease({ token: 't', repository: 'alice/quizdock-quizzes', tag: 'quizzes', dir: folder({ 'index.json': '{}' }), fetch: gh.fetch });
  assert.ok(gh.calls.includes('POST /repos/alice/quizdock-quizzes/releases'));
});
