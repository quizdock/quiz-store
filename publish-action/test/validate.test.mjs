import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { validateBundle } from '../src/validate.mjs';
import { bundle, manifest, question } from './helpers.mjs';

const MB = 1024 * 1024;
const check = (bytes, maxBytes = 20 * MB) => validateBundle(bytes, { maxBytes });
const errorOf = (result) => (result.ok ? null : result.errors.join(' | '));

test('a bundle as QuizDock exports it for publication is accepted', () => {
  const result = check(bundle());
  assert.equal(result.ok, true, errorOf(result));
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
    const result = check(bundle(json));
    assert.equal(result.ok, false);
    assert.match(errorOf(result), message);
    assert.match(errorOf(result), /Export for publication/);
  }
});

test('a missing media, a foreign file, a damaged zip', () => {
  assert.match(errorOf(check(bundle(manifest(), {}))), /lacks media.*media\/paris\.webp/);
  assert.match(errorOf(check(strToU8('hello'))), /not a QuizDock bundle/);
  assert.match(errorOf(check(bundle().slice(0, 60))), /damaged|holds no quiz/);
  assert.match(errorOf(check(zipSync({ 'readme.txt': strToU8('x') }))), /quiz\.json is missing/);
});

test('a manifest outside the format, and one from a newer QuizDock', () => {
  const badSlug = check(bundle(manifest({ slug: 'Not A Slug' })));
  assert.match(errorOf(badSlug), /does not match QuizDock's format/);
  const newer = check(bundle(manifest({}, { version: 4 })));
  assert.match(errorOf(newer), /newer QuizDock.*nothing to fix/);
});

test('size: the file itself, then what it unpacks to', () => {
  const heavy = bundle(manifest(), { 'media/paris.webp': crypto.getRandomValues(new Uint8Array(60_000)) });
  assert.match(errorOf(check(heavy, 50_000)), /over the .* limit/);
  // Zeros deflate to almost nothing: small file, large once unpacked.
  const bomb = bundle(manifest(), { 'media/paris.webp': new Uint8Array(3 * MB) });
  assert.ok(bomb.length < MB);
  assert.match(errorOf(check(bomb, MB)), /too large once unpacked/);
});

test('media without a credit: a warning, never a refusal', () => {
  const json = manifest({}, { media: {} });
  const result = check(bundle(json));
  assert.equal(result.ok, true, errorOf(result));
  assert.match(result.warnings[0], /1 media without a credit/);
});

test('images inside Markdown count as used media', () => {
  const json = manifest(
    {},
    { items: [{ ...question, media: undefined, prompt: 'Where is it? ![map](media/map.webp)' }] },
  );
  assert.match(errorOf(check(bundle(json, {}))), /media\/map\.webp/);
});
