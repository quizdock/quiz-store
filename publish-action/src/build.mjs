import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { questionCount, validateBundle } from './validate.mjs';

export const TEMPLATE_NAME = 'quizdock-quizzes';

/**
 * Reads every zip of `dir`, validates each one on its own, and writes to
 * `outDir` the publishable ones (named `<slug>.quizdock.zip`) with their
 * `index.json`. An invalid quiz is left out and reported; the others are
 * still published.
 *
 * @param {{
 *   dir: string, outDir: string, baseUrl: string, maxBytes: number,
 *   host: string, vendor: string, repository?: string,
 *   homepage?: string, issues?: string, now?: Date,
 * }} options
 * @returns {{ index: object, report: { file: string, slug?: string, errors: string[], warnings: string[] }[], notices: string[] }}
 */
export function buildIndex(options) {
  const { dir, outDir, baseUrl, maxBytes, host, vendor } = options;
  const notices = [];
  if (options.repository && options.repository !== TEMPLATE_NAME) {
    notices.push(
      `This repository is named "${options.repository}" rather than "${TEMPLATE_NAME}". Publishing works all the same; only the naming convention of the store is lost.`,
    );
  }

  const zips = listZips(dir);
  const report = [];
  const valid = [];
  for (const file of zips) {
    const bytes = new Uint8Array(readFileSync(join(dir, file)));
    const result = validateBundle(bytes, { maxBytes });
    if (!result.ok) {
      report.push({ file, errors: result.errors, warnings: result.warnings });
      continue;
    }
    const entry = { file, slug: result.manifest.quiz.slug, errors: [], warnings: result.warnings };
    report.push(entry);
    valid.push({ entry, bytes, manifest: result.manifest });
  }

  // Two files, one slug: two versions of a quiz, or two quizzes with the same
  // title. Only the author can tell, so neither is published.
  const bySlug = Map.groupBy(valid, (v) => v.manifest.quiz.slug);
  const published = [];
  for (const [slug, group] of bySlug) {
    if (group.length > 1) {
      const names = group.map((v) => v.entry.file).join(', ');
      for (const v of group) {
        v.entry.errors.push(
          `Several files carry the short name "${slug}" (${names}). If they are versions of the same quiz, delete the older file. If they are different quizzes, give one of them another short name in QuizDock's Export for publication.`,
        );
      }
      continue;
    }
    published.push(group[0]);
  }

  mkdirSync(outDir, { recursive: true });
  const quizzes = published
    .sort((a, b) => a.manifest.quiz.slug.localeCompare(b.manifest.quiz.slug))
    .map(({ bytes, manifest }) => {
      const { quiz } = manifest;
      const asset = `${quiz.slug}.quizdock.zip`;
      writeFileSync(join(outDir, asset), bytes);
      return {
        id: `${host}/${vendor}/${quiz.slug}`,
        slug: quiz.slug,
        url: `${baseUrl.replace(/\/$/, '')}/${asset}`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
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

/** The zips of a folder, by name; a missing folder is an empty one (the first run). */
function listZips(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.zip'))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
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
  if (report.length === 0) lines.push('No quiz yet: upload a `.quizdock.zip` file into the `quizzes` folder.');
  return `${lines.join('\n')}\n`;
}
