import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { megabytes, questionCount, validateFiles } from './validate.mjs';

export const TEMPLATE_NAME = 'quizdock-quizzes';

/**
 * A fixed date for every entry, built from local fields: fflate writes the
 * zip's DOS time from local time, so the same files give the same bytes on
 * any machine, in any time zone.
 */
const ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

/**
 * Reads every quiz folder of `dir` (`<folder>/quiz.json` and `<folder>/media/`),
 * validates each one on its own, and writes to `outDir` a reproducible
 * `<slug>.quizdock.zip` per publishable quiz, with their `index.json`. The
 * zips are built here: the repository holds the quizzes as files, readable
 * and diffable, never as archives. An invalid quiz is left out and reported;
 * the others are still published.
 *
 * @param {{
 *   dir: string, outDir: string, baseUrl: string, maxBytes: number,
 *   host: string, vendor: string, repository?: string,
 *   homepage?: string, issues?: string, now?: Date,
 * }} options
 */
export function buildIndex(options) {
  const { dir, outDir, baseUrl, maxBytes, host, vendor } = options;
  const notices = [];
  if (options.repository && options.repository !== TEMPLATE_NAME) {
    notices.push(
      `This repository is named "${options.repository}" rather than "${TEMPLATE_NAME}". Publishing works all the same; only the naming convention of the store is lost.`,
    );
  }

  const report = [];
  const valid = [];
  for (const { name, kind } of listEntries(dir)) {
    if (kind === 'file') {
      report.push({ file: name, path: name, errors: [strayFileMessage(name)], warnings: [] });
      continue;
    }
    // Annotations point at a file: the folder's manifest.
    const path = `${name}/quiz.json`;
    const files = readQuizFolder(join(dir, name), maxBytes);
    if (!files) {
      report.push({
        file: name,
        path,
        errors: [
          `The folder weighs more than ${megabytes(maxBytes)}. In QuizDock, lighten or remove the quiz's heaviest media, then choose Export for publication again, unzip it and upload the new folder in place of this one.`,
        ],
        warnings: [],
      });
      continue;
    }
    const result = validateFiles(files);
    if (!result.ok) {
      report.push({ file: name, path, errors: result.errors, warnings: result.warnings });
      continue;
    }
    const zip = buildZip(files['quiz.json'], result.media);
    if (zip.length > maxBytes) {
      report.push({
        file: name,
        path,
        errors: [
          `The quiz weighs ${megabytes(zip.length)}, over the ${megabytes(maxBytes)} limit. In QuizDock, lighten or remove its heaviest media, then choose Export for publication again, unzip it and upload the new folder.`,
        ],
        warnings: result.warnings,
      });
      continue;
    }
    const entry = { file: name, path, slug: result.manifest.quiz.slug, errors: [], warnings: result.warnings };
    report.push(entry);
    valid.push({ entry, zip, manifest: result.manifest });
  }

  // Two folders, one slug: two versions of a quiz, or two quizzes with the
  // same title. Only the author can tell, so neither is published.
  const bySlug = Map.groupBy(valid, (v) => v.manifest.quiz.slug);
  const published = [];
  for (const [slug, group] of bySlug) {
    if (group.length > 1) {
      const names = group.map((v) => v.entry.file).join(', ');
      for (const v of group) {
        v.entry.errors.push(
          `Several folders carry the short name "${slug}" (${names}). If they are versions of the same quiz, delete the older folder. If they are different quizzes, give one of them another short name in QuizDock's Export for publication.`,
        );
      }
      continue;
    }
    published.push(group[0]);
  }

  mkdirSync(outDir, { recursive: true });
  const quizzes = published
    .sort((a, b) => a.manifest.quiz.slug.localeCompare(b.manifest.quiz.slug))
    .map(({ zip, manifest }) => {
      const { quiz } = manifest;
      const asset = `${quiz.slug}.quizdock.zip`;
      writeFileSync(join(outDir, asset), zip);
      return {
        id: `${host}/${vendor}/${quiz.slug}`,
        slug: quiz.slug,
        url: `${baseUrl.replace(/\/$/, '')}/${asset}`,
        sha256: createHash('sha256').update(zip).digest('hex'),
        size: zip.length,
        bundleVersion: manifest.version ?? 0,
        title: quiz.title.trim(),
        description: quiz.description ?? null,
        language: quiz.language,
        tags: quiz.tags,
        license: quiz.license,
        questionCount: questionCount(manifest),
        updatedAt: quiz.updatedAt ?? null,
      };
    });

  const index = {
    format: 'quizdock/index',
    version: 1,
    source: {
      host,
      vendor,
      homepage: options.homepage ?? null,
      issues: options.issues ?? null,
    },
    generatedAt: (options.now ?? new Date()).toISOString(),
    quizzes,
  };
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { index, report, notices };
}

/**
 * The bundle as QuizDock reads it, always the same bytes for the same files:
 * entries sorted, a fixed date, the manifest deflated and the media stored
 * (they are compressed formats already).
 */
export function buildZip(manifest, media) {
  const entries = { 'quiz.json': [manifest, { level: 9, mtime: ZIP_DATE }] };
  for (const path of Object.keys(media).sort()) {
    entries[path] = [media[path], { level: 0, mtime: ZIP_DATE }];
  }
  return zipSync(entries);
}

/** What sits in the quizzes folder: quiz folders, and anything else to report. */
function listEntries(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // the first run
    throw err;
  }
  return names
    .filter((name) => !name.startsWith('.'))
    .sort()
    .map((name) => ({ name, kind: statSync(join(dir, name)).isDirectory() ? 'folder' : 'file' }));
}

function strayFileMessage(name) {
  if (name.toLowerCase().endsWith('.zip')) {
    return 'This is a zip. Unzip it on your computer, upload the folder you get into quizzes/, then delete this file.';
  }
  if (name === 'quiz.json') {
    return 'The quiz files were uploaded one by one. Upload the whole folder instead (the one you get by unzipping the export), then delete these files.';
  }
  return 'Only quiz folders belong in quizzes/. Delete this file.';
}

/**
 * `quiz.json` and the flat `media/` of a quiz folder; `null` when the folder
 * holds more than `maxBytes` (nothing more is read).
 */
function readQuizFolder(folder, maxBytes) {
  const files = {};
  let total = 0;
  const add = (path, full) => {
    total += statSync(full).size;
    if (total > maxBytes) return false;
    files[path] = new Uint8Array(readFileSync(full));
    return true;
  };
  const manifest = join(folder, 'quiz.json');
  try {
    if (statSync(manifest).isFile() && !add('quiz.json', manifest)) return null;
  } catch {
    // no quiz.json: validateFiles says so
  }
  let media = [];
  try {
    media = readdirSync(join(folder, 'media'));
  } catch {
    // no media: fine for a quiz without images
  }
  for (const name of media.sort()) {
    const full = join(folder, 'media', name);
    if (!statSync(full).isFile()) continue;
    if (!add(`media/${name}`, full)) return null;
  }
  return files;
}

/** The report as Markdown: what was published, what was not and why. */
export function reportMarkdown({ index, report, notices }) {
  const lines = ['# Quiz publication', ''];
  for (const notice of notices) lines.push(`> ${notice}`, '');
  const failed = report.filter((r) => r.errors.length);
  lines.push(`**${index.quizzes.length}** quiz(zes) published, **${failed.length}** not published.`, '');
  for (const r of report) {
    const status = r.errors.length ? '❌' : '✅';
    lines.push(`## ${status} ${r.file}`);
    for (const e of r.errors) lines.push(`- ${e}`);
    for (const w of r.warnings) lines.push(`- ⚠️ ${w}`);
    lines.push('');
  }
  if (report.length === 0) {
    lines.push('No quiz yet: unzip a QuizDock export and upload its folder into `quizzes`.');
  }
  return `${lines.join('\n')}\n`;
}

