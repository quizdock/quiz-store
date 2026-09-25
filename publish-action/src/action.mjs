import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, reportMarkdown } from './build.mjs';
import { syncRelease } from './github.mjs';
import { maxBytesFrom } from './validate.mjs';

/**
 * The GitHub Action: validates the repository's quizzes, publishes the valid
 * ones with their index to a rolling release, and fails (a red cross linking
 * to the report) when a quiz could not be published.
 */
const input = (name, fallback) => process.env[`INPUT_${name.toUpperCase()}`] || fallback;
const env = process.env;

async function main() {
  const repository = env.GITHUB_REPOSITORY;
  const [vendor, name] = repository.split('/');
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const host = new URL(server).host;
  const tag = input('tag', 'quizzes');
  const outDir = mkdtempSync(join(tmpdir(), 'quizzes-'));
  const workspace = env.GITHUB_WORKSPACE ?? process.cwd();

  const result = buildIndex({
    dir: join(workspace, input('directory', 'quizzes')),
    outDir,
    baseUrl: `${server}/${repository}/releases/download/${tag}`,
    maxBytes: maxBytesFrom(input('max-mb', '20')),
    host,
    vendor,
    repository: name,
    homepage: `${server}/${repository}`,
    issues: `${server}/${repository}/issues`,
  });

  // The report first: the author sees what to fix even if the release cannot be updated.
  const markdown = reportMarkdown(result);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
  process.stdout.write(markdown);
  const dirName = input('directory', 'quizzes');
  for (const notice of result.notices) console.log(`::notice::${notice}`);
  let failed = false;
  for (const r of result.report) {
    for (const w of r.warnings) console.log(`::warning file=${dirName}/${r.path}::${w}`);
    for (const e of r.errors) {
      console.log(`::error file=${dirName}/${r.path}::${e}`);
      failed = true;
    }
  }

  try {
    const sync = await syncRelease({
      token: input('token'),
      repository,
      tag,
      dir: outDir,
      api: env.GITHUB_API_URL,
      uploads: env.GITHUB_API_URL?.replace('//api.', '//uploads.'),
    });
    console.log(
      `Release "${tag}": ${sync.uploaded.length} uploaded, ${sync.kept.length} unchanged, ${sync.deleted.length} removed.`,
    );
  } catch (err) {
    console.log(
      `::error::The quizzes could not be published to the "${tag}" release (${err.message}). If it is a permission refusal, the workflow needs "permissions: contents: write".`,
    );
    failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  process.exitCode = 1;
});
