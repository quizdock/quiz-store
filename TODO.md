# Remaining actions

For `quizdock/quiz-store` and the author template `quizdock/quizdock-quizzes`, until the store opens. The template gets no TODO file of its own: everything in it is copied into every author repository.

## Waiting on QuizDock

- [ ] A QuizDock release carrying the licence and tags settings and *Export for publication*: until then an author cannot produce a quiz the store accepts.
- [ ] Once that release publishes `schema/quiz-bundle.v3.json`, pin the schema at its tag instead of the copy in `publish-action/schema/`, with a check that the two stay identical. Tag `v1.0.x` and move `v1` if the action changes.
- [ ] The store page in QuizDock, which reads `registry.json`. Without it, a published quiz appears nowhere.

## Checks with a brand-new GitHub account

- [ ] Dragging a folder with its `media/` sub-folder onto *Upload files* keeps its structure, in the common browsers.
- [ ] Two-factor authentication: required at once, or after a grace period?
- [ ] After sign-up, GitHub brings the user back to the page they came from.
- [ ] *Use this template*: is the name field empty or prefilled?

Each answer updates `CONTRIBUTING.md`, the template's `README.md` and the checklist at the end of `SPECIFICATION.md`.

## Opening

- [ ] quiz-store: remove "Submissions are not open yet" from `README.md` and `CONTRIBUTING.md`.
- [ ] Both repositories: drop "(in preparation)" from their GitHub description.
- [ ] Seed `registry.json` with the sample quizzes, published from a repository of the project, so the catalogue is not empty on day one.

## After opening

- [ ] Robustness at scale: a repository with many quizzes, quizzes near 20 MB, GitHub API limits on release assets.
- [ ] Practise the review procedure on the first registrations and adjust the form if needed.
