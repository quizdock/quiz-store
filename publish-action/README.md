# Publish action and CLI

Validates the QuizDock bundles (`.quizdock.zip`) of a folder and publishes the valid ones with an `index.json`, as described in the [specification](../SPECIFICATION.md).

## GitHub Action

Used by the author template ([quizdock/quizdock-quizzes](https://github.com/quizdock/quizdock-quizzes)):

```yaml
permissions:
  contents: write
steps:
  - uses: actions/checkout@v4
  - uses: quizdock/quiz-store/publish-action@main
```

Inputs: `directory` (default `quizzes`), `max-mb` (default `20`), `tag` (default `quizzes`), `token` (default the workflow token). Invalid quizzes are left out and reported, and the job fails; the valid ones are published anyway.

## CLI

The same checks and the same index, for another CI or a static folder:

```sh
node publish-action/src/cli.mjs --dir quizzes --out public \
  --base-url https://quizzes.example.org/alice --host forge.example.org --vendor alice
```

It writes `<slug>.quizdock.zip` files and `index.json` to `--out`, prints a report, and exits with 1 when a quiz could not be published.

## Development

```sh
npm ci
npm test
npm run build   # regenerates dist/action.mjs, which is committed
```

The bundle schema in `schema/` is a copy of QuizDock's (see `schema/SOURCE.md`).
