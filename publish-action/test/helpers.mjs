import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';

export const question = {
  kind: 'question',
  type: 'single_choice',
  prompt: 'Capital of France?',
  media: 'media/paris.webp',
  options: [
    { text: 'Paris', color: 'red', shape: 'triangle', isCorrect: true },
    { text: 'Lyon', color: 'blue', shape: 'diamond' },
  ],
};

/** A manifest as QuizDock's Export for publication writes it. */
export const manifest = (quiz = {}, over = {}) => ({
  format: 'quizdock/quiz',
  version: 3,
  quiz: {
    title: 'World capitals',
    language: 'en',
    slug: 'world-capitals',
    tags: ['geography'],
    license: 'CC-BY-4.0',
    ...quiz,
  },
  items: [{ kind: 'slide', blocks: [] }, question],
  media: { 'media/paris.webp': { alt: 'Paris', credit: 'Own work' } },
  ...over,
});

/** The files of an unzipped export. */
export const files = (json = manifest(), media = { 'media/paris.webp': new Uint8Array(100) }) => ({
  'quiz.json': strToU8(JSON.stringify(json)),
  ...media,
});

/** The same, zipped as QuizDock downloads it. */
export const bundle = (json, media) => zipSync(files(json, media));

/** Writes an unzipped export as a folder, as an author uploads it. */
export function writeFolder(parent, name, content = files()) {
  for (const [path, bytes] of Object.entries(content)) {
    const full = join(parent, name, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, bytes);
  }
}
