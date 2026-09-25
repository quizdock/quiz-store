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

export const bundle = (json = manifest(), media = { 'media/paris.webp': new Uint8Array(100) }) =>
  zipSync({ 'quiz.json': strToU8(JSON.stringify(json)), ...media });
