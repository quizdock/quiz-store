import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildIndex, reportMarkdown } from '../src/build.mjs';
import { bundle, manifest } from './helpers.mjs';

function run(files, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qs-'));
  const dir = join(root, 'quizzes');
  const outDir = join(root, 'out');
  mkdirSync(dir);
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
  const result = buildIndex({
    dir,
    outDir,
    baseUrl: 'https://github.com/alice/quizdock-quizzes/releases/download/quizzes/',
    maxBytes: 20 * 1024 * 1024,
    host: 'github.com',
    vendor: 'alice',
    repository: 'quizdock-quizzes',
    now: new Date('2026-09-25T12:00:00Z'),
    ...options,
    ...(options.dir === null ? { dir: join(root, 'absent') } : {}),
  });
  return { ...result, outDir };
}

test('publishes each valid quiz under its slug, with an index', () => {
  const { index, outDir } = run({
    'world-capitals.quizdock (1).zip': bundle(),
    'music.quizdock.zip': bundle(manifest({ slug: '80s-music', title: '80s music', tags: ['music'] })),
  });
  assert.deepEqual(readdirSync(outDir).sort(), ['80s-music.quizdock.zip', 'index.json', 'world-capitals.quizdock.zip']);
  assert.equal(index.quizzes.length, 2);
  const entry = index.quizzes.find((q) => q.slug === 'world-capitals');
  assert.equal(entry.id, 'github.com/alice/world-capitals');
  assert.equal(entry.url, 'https://github.com/alice/quizdock-quizzes/releases/download/quizzes/world-capitals.quizdock.zip');
  assert.equal(entry.questionCount, 1);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')), index);
});

test('one invalid quiz does not stop the others', () => {
  const { index, report } = run({
    'good.quizdock.zip': bundle(),
    'bad.quizdock.zip': bundle(manifest({ slug: 'bad', license: 'MIT' })),
  });
  assert.deepEqual(index.quizzes.map((q) => q.slug), ['world-capitals']);
  assert.match(report.find((r) => r.file === 'bad.quizdock.zip').errors[0], /Licence/);
});

test('two files with one slug: neither is published, the author decides', () => {
  const { index, report } = run({
    'world-capitals.quizdock.zip': bundle(),
    'world-capitals.quizdock (1).zip': bundle(manifest({ title: 'World capitals, again' })),
  });
  assert.equal(index.quizzes.length, 0);
  for (const r of report) assert.match(r.errors[0], /Several files carry the short name "world-capitals"/);
});

test('the first run, with no quiz yet, publishes an empty index', () => {
  const { index, report } = run({}, { dir: null });
  assert.deepEqual(index.quizzes, []);
  assert.match(reportMarkdown({ index, report, notices: [] }), /No quiz yet/);
});

test('another repository name only brings a notice', () => {
  const { index, notices } = run({ 'q.quizdock.zip': bundle() }, { repository: 'my-quizzes' });
  assert.equal(index.quizzes.length, 1);
  assert.match(notices[0], /"my-quizzes" rather than "quizdock-quizzes"/);
});
