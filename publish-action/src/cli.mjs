#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { buildIndex, reportMarkdown } from './build.mjs';
import { maxBytesFrom } from './validate.mjs';

/**
 * The same checks, zips and index as the GitHub Action, as a plain command:
 * for another CI, or a closed store served as a static folder. `--dir` holds
 * one folder per quiz (an unzipped QuizDock export).
 *
 *   quiz-store-publish --dir quizzes --out public --base-url https://quizzes.acme.local/alice \
 *     --host forge.acme.local --vendor alice [--max-mb 20]
 */
const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: 'quizzes' },
    out: { type: 'string' },
    'base-url': { type: 'string' },
    host: { type: 'string' },
    vendor: { type: 'string' },
    repository: { type: 'string' },
    homepage: { type: 'string' },
    issues: { type: 'string' },
    'max-mb': { type: 'string', default: '20' },
  },
});
for (const required of ['out', 'base-url', 'host', 'vendor']) {
  if (!values[required]) {
    console.error(`Missing --${required}.`);
    process.exit(2);
  }
}

const result = buildIndex({
  dir: values.dir,
  outDir: values.out,
  baseUrl: values['base-url'],
  maxBytes: maxBytesFrom(values['max-mb']),
  host: values.host,
  vendor: values.vendor,
  repository: values.repository,
  homepage: values.homepage,
  issues: values.issues,
});
process.stdout.write(reportMarkdown(result));
if (result.report.some((r) => r.errors.length)) process.exitCode = 1;
