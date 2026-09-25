import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8 } from 'fflate';
import { validateFiles, validateZip } from '../src/validate.mjs';
import { bundle, files, manifest, question } from './helpers.mjs';

const MB = 1024 * 1024;
const errorOf = (result) => (result.ok ? null : result.errors.join(' | '));

test('an unzipped export for publication is accepted', () => {
  const result = validateFiles(files());
  assert.equal(result.ok, true, errorOf(result));
  assert.deepEqual(Object.keys(result.media), ['media/paris.webp']);
  assert.deepEqual(result.warnings, []);
});

test('what QuizDock blocks, the store refuses too, saying where to fix it', () => {
  const cases = [
    [manifest({ license: 'MIT' }), /Sharing → Licence/],
    [manifest({ license: undefined }), /Sharing → Licence/],
    [manifest({ tags: [] }), /Sharing → Tags/],
    [manifest({ language: undefined }), /Sharing → Language/],
    [manifest({ slug: undefined }), /short name/],
  ];
  for (const [json, message] of cases) {
    const result = validateFiles(files(json));
    assert.equal(result.ok, false);
    assert.match(errorOf(result), message);
    assert.match(errorOf(result), /Export for publication again, unzip it/);
  }
});

test('no quiz.json, a missing media, a manifest outside the format, a newer QuizDock', () => {
  assert.match(errorOf(validateFiles({ 'media/a.webp': new Uint8Array(1) })), /no quiz\.json/);
  assert.match(errorOf(validateFiles(files(manifest(), {}))), /lacks media.*media\/paris\.webp/);
  assert.match(errorOf(validateFiles(files(manifest({ slug: 'Not A Slug' })))), /QuizDock's format/);
  assert.match(errorOf(validateFiles(files(manifest({}, { version: 4 })))), /newer QuizDock.*nothing to fix/);
});

test('media left over from an earlier version are left out, with a note', () => {
  const result = validateFiles(files(manifest(), {
    'media/paris.webp': new Uint8Array(10),
    'media/old.webp': new Uint8Array(10),
  }));
  assert.equal(result.ok, true, errorOf(result));
  assert.deepEqual(Object.keys(result.media), ['media/paris.webp']);
  assert.match(result.warnings[0], /1 file\(s\) in media\/ are not used/);
});

test('media without a credit: a warning, never a refusal', () => {
  const result = validateFiles(files(manifest({}, { media: {} })));
  assert.equal(result.ok, true, errorOf(result));
  assert.match(result.warnings[0], /1 media without a credit/);
});

test('images inside Markdown count as used media', () => {
  const json = manifest({}, { items: [{ ...question, media: undefined, prompt: 'Where? ![map](media/map.webp)' }] });
  assert.match(errorOf(validateFiles(files(json, {}))), /media\/map\.webp/);
});

test('a zip is checked the same way, within the archive limits', () => {
  assert.equal(validateZip(bundle(), { maxBytes: 20 * MB }).ok, true);
  assert.match(errorOf(validateZip(strToU8('hello'), { maxBytes: MB })), /not a QuizDock bundle/);
  // Zeros deflate to almost nothing: small file, large once unpacked.
  const bomb = bundle(manifest(), { 'media/paris.webp': new Uint8Array(3 * MB) });
  assert.match(errorOf(validateZip(bomb, { maxBytes: MB })), /too large once unpacked/);
});
