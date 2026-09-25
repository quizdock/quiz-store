import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { buildIndex, reportMarkdown } from '../src/build.mjs';
import { validateZip } from '../src/validate.mjs';
import { bundle, files, manifest, writeFolder } from './helpers.mjs';

const MB = 1024 * 1024;

function run(setup, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qs-'));
  const dir = join(root, 'quizzes');
  const outDir = join(root, 'out');
  if (setup) {
    mkdirSync(dir);
    setup(dir);
  }
  const result = buildIndex({
    dir,
    outDir,
    baseUrl: 'https://github.com/alice/quizdock-quizzes/releases/download/quizzes/',
    maxBytes: 20 * MB,
    host: 'github.com',
    vendor: 'alice',
    repository: 'quizdock-quizzes',
    now: new Date('2026-09-25T12:00:00Z'),
    ...options,
  });
  return { ...result, outDir };
}

test('builds one zip per quiz folder, named after its slug, with an index', () => {
  const { index, outDir } = run((dir) => {
    writeFolder(dir, 'world-capitals.quizdock (1)');
    writeFolder(dir, 'music', files(manifest({ slug: '80s-music', title: '80s music', tags: ['music'] })));
  });
  assert.deepEqual(readdirSync(outDir).sort(), ['80s-music.quizdock.zip', 'index.json', 'world-capitals.quizdock.zip']);
  const entry = index.quizzes.find((q) => q.slug === 'world-capitals');
  assert.equal(entry.id, 'github.com/alice/world-capitals');
  assert.equal(entry.url, 'https://github.com/alice/quizdock-quizzes/releases/download/quizzes/world-capitals.quizdock.zip');
  assert.equal(entry.questionCount, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')), index);
  // The zip it builds is a bundle QuizDock (and the store) reads.
  const zip = new Uint8Array(readFileSync(join(outDir, 'world-capitals.quizdock.zip')));
  assert.equal(validateZip(zip, { maxBytes: 20 * MB }).ok, true);
});

test('the same files always give the same zip', () => {
  const a = run((dir) => writeFolder(dir, 'q'));
  const b = run((dir) => writeFolder(dir, 'other-name'));
  assert.equal(a.index.quizzes[0].sha256, b.index.quizzes[0].sha256);
});

test('only the media the quiz uses go into the zip', () => {
  const { outDir, report } = run((dir) =>
    writeFolder(dir, 'q', files(manifest(), {
      'media/paris.webp': new Uint8Array(10),
      'media/old.webp': new Uint8Array(10),
    })),
  );
  const entries = Object.keys(unzipSync(new Uint8Array(readFileSync(join(outDir, 'world-capitals.quizdock.zip')))));
  assert.deepEqual(entries.sort(), ['media/paris.webp', 'quiz.json']);
  assert.match(report[0].warnings[0], /not used by the quiz/);
});

test('a zip or loose files in quizzes/ are refused with what to do instead', () => {
  const { report, index } = run((dir) => {
    writeFileSync(join(dir, 'world-capitals.quizdock.zip'), bundle());
    writeFileSync(join(dir, 'quiz.json'), '{}');
    writeFolder(dir, 'good');
  });
  assert.equal(index.quizzes.length, 1);
  assert.match(report.find((r) => r.file.endsWith('.zip')).errors[0], /Unzip it on your computer/);
  assert.match(report.find((r) => r.file === 'quiz.json').errors[0], /uploaded one by one/);
});

test('one invalid quiz does not stop the others', () => {
  const { index, report } = run((dir) => {
    writeFolder(dir, 'good');
    writeFolder(dir, 'bad', files(manifest({ slug: 'bad', license: 'MIT' })));
  });
  assert.deepEqual(index.quizzes.map((q) => q.slug), ['world-capitals']);
  assert.match(report.find((r) => r.file === 'bad').errors[0], /Licence/);
  assert.equal(report.find((r) => r.file === 'bad').path, 'bad/quiz.json');
});

test('two folders with one slug: neither is published, the author decides', () => {
  const { index, report } = run((dir) => {
    writeFolder(dir, 'world-capitals.quizdock');
    writeFolder(dir, 'world-capitals.quizdock (1)', files(manifest({ title: 'World capitals, again' })));
  });
  assert.equal(index.quizzes.length, 0);
  for (const r of report) assert.match(r.errors[0], /Several folders carry the short name "world-capitals"/);
});

test('a folder over the limit is refused without reading it all', () => {
  const { report } = run(
    (dir) => writeFolder(dir, 'q', files(manifest(), { 'media/paris.webp': new Uint8Array(2 * MB) })),
    { maxBytes: MB },
  );
  assert.match(report[0].errors[0], /weighs more than 1\.0 MB/);
});

test('the first run, with no quiz yet, publishes an empty index', () => {
  const { index, report } = run(null);
  assert.deepEqual(index.quizzes, []);
  assert.match(reportMarkdown({ index, report, notices: [] }), /No quiz yet/);
});

test('another repository name only brings a notice', () => {
  const { index, notices } = run((dir) => writeFolder(dir, 'q'), { repository: 'my-quizzes' });
  assert.equal(index.quizzes.length, 1);
  assert.match(notices[0], /"my-quizzes" rather than "quizdock-quizzes"/);
});
