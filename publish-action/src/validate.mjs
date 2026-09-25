import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { looksLikeZip, readArchive } from './archive.mjs';

// The store follows QuizDock's format and never defines it (see schema/SOURCE.md).
const schema = JSON.parse(
  readFileSync(new URL('../schema/quiz-bundle.v3.json', import.meta.url), 'utf8'),
);
const SUPPORTED_VERSION = 3;

export const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'];
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const MEDIA_PATH_RE = /^media\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MARKDOWN_MEDIA_RE = /\]\((media\/[A-Za-z0-9][A-Za-z0-9._-]{0,120})\)/g;
const MB = 1024 * 1024;

let validateManifest;
function manifestValidator() {
  if (!validateManifest) {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    validateManifest = ajv.compile(schema);
  }
  return validateManifest;
}

/** How much a store bundle may weigh: the same default as QuizDock's `PUBLICATION_MAX_MB`. */
export function maxBytesFrom(mb) {
  const n = Number(mb);
  return (Number.isFinite(n) && n > 0 ? n : 20) * MB;
}

const megabytes = (bytes) => `${(bytes / MB).toFixed(1)} MB`;
const EXPORT_AGAIN = 'then choose Export for publication again and upload the new file';

/**
 * Checks one bundle the way the store needs it, and says what to fix in
 * QuizDock when it cannot be published.
 *
 * @param {Uint8Array} bytes the `.quizdock.zip` file
 * @param {{ maxBytes: number }} options
 * @returns {{ ok: true, manifest: object, files: Record<string, Uint8Array>, warnings: string[] }
 *         | { ok: false, errors: string[], warnings: string[] }}
 */
export function validateBundle(bytes, { maxBytes }) {
  const warnings = [];
  const fail = (...errors) => ({ ok: false, errors, warnings });

  if (!looksLikeZip(bytes)) {
    return fail(
      `This is not a QuizDock bundle. In QuizDock, open the quiz, ${EXPORT_AGAIN}, without unzipping it.`,
    );
  }
  if (bytes.length > maxBytes) {
    return fail(
      `The quiz weighs ${megabytes(bytes.length)}, over the ${megabytes(maxBytes)} limit. In QuizDock, lighten or remove its heaviest media, ${EXPORT_AGAIN}.`,
    );
  }

  let files;
  try {
    files = readArchive(
      bytes,
      (name) => name === 'quiz.json' || /^media\/[^/]+$/.test(name),
      { maxEntries: 2000, maxEntryBytes: maxBytes, maxTotalBytes: 2 * maxBytes },
    );
  } catch (err) {
    return fail(
      err.code === 'too_large'
        ? `The quiz is too large once unpacked. In QuizDock, lighten its media, ${EXPORT_AGAIN}.`
        : `The file is damaged and cannot be read. In QuizDock, ${EXPORT_AGAIN}.`,
    );
  }
  if (!files['quiz.json']) {
    return fail(`The file holds no quiz (quiz.json is missing). In QuizDock, ${EXPORT_AGAIN}.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(files['quiz.json']));
  } catch {
    return fail(`The quiz cannot be read (quiz.json is not valid JSON). In QuizDock, ${EXPORT_AGAIN}.`);
  }
  if (typeof manifest?.version === 'number' && manifest.version > SUPPORTED_VERSION) {
    return fail(
      `This quiz was exported by a newer QuizDock (format version ${manifest.version}) than the store reads yet (up to ${SUPPORTED_VERSION}). It will be published once the store supports it; nothing to fix on your side.`,
    );
  }
  const validate = manifestValidator();
  if (!validate(manifest)) {
    const first = validate.errors?.[0];
    const where = first?.instancePath || '/';
    return fail(
      `The quiz does not match QuizDock's format (${where}: ${first?.message ?? 'invalid'}). In QuizDock, ${EXPORT_AGAIN}.`,
    );
  }

  const quiz = manifest.quiz;
  const errors = [];
  if (!quiz.slug) {
    errors.push(`The quiz has no short name. In QuizDock, ${EXPORT_AGAIN}: the short name is set there.`);
  }
  if (!LICENSES.includes(quiz.license)) {
    errors.push(
      `The quiz needs a licence the store accepts (CC0, CC BY or CC BY-SA). In QuizDock: quiz settings → Sharing → Licence, ${EXPORT_AGAIN}.`,
    );
  }
  if (!quiz.language || !LANGUAGE_RE.test(quiz.language)) {
    errors.push(`The quiz needs a language. In QuizDock: quiz settings → Sharing → Language, ${EXPORT_AGAIN}.`);
  }
  if (!Array.isArray(quiz.tags) || quiz.tags.length === 0) {
    errors.push(`The quiz needs at least one tag. In QuizDock: quiz settings → Sharing → Tags, ${EXPORT_AGAIN}.`);
  }
  const missing = [...referencedMedia(manifest)].filter((path) => !files[path]);
  if (missing.length) {
    errors.push(
      `The file lacks media the quiz uses (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}). In QuizDock, ${EXPORT_AGAIN}.`,
    );
  }
  if (errors.length) return fail(...errors);

  const uncredited = Object.keys(files)
    .filter((path) => path.startsWith('media/'))
    .filter((path) => !manifest.media?.[path]?.credit?.trim());
  if (uncredited.length) {
    warnings.push(
      `${uncredited.length} media without a credit. You answer for the rights to every image, sound and video you publish: credit them in your QuizDock media library.`,
    );
  }
  return { ok: true, manifest, files, warnings };
}

/** Every media path the manifest points at: fields holding a path, and images inside Markdown. */
function referencedMedia(manifest) {
  const paths = new Set();
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (MEDIA_PATH_RE.test(value) && key !== 'name') paths.add(value);
      for (const m of value.matchAll(MARKDOWN_MEDIA_RE)) paths.add(m[1]);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        // `media` at the top level is keyed by path: its keys describe files, they are not uses.
        if (value === manifest && k === 'media') continue;
        walk(v, k);
      }
    }
  };
  walk(manifest);
  return paths;
}

/** Questions in a manifest (slides do not count). */
export function questionCount(manifest) {
  return (manifest.items ?? []).filter((item) => item.kind === 'question').length;
}
