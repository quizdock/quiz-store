# Running a closed store

Any organisation can run its own copy of this store, closed to the outside: on another forge, or with no forge at all. Nothing in the store refers to the `quizdock` organisation or to GitHub URL patterns.

- **On another forge (GitHub Enterprise, Forgejo, GitLab):**
  1. Clone both repositories.
  2. In the single configuration file, set the forge host, the registry URL, the template URL and the guide links.
  3. In your copy of the template, point the one `uses:` line to your copy of the action. That line cannot be parameterized.
  4. On GitLab, call the CLI from `.gitlab-ci.yml` instead.
- **With no forge:** run the CLI over each folder of quiz folders (see [`publish-action/README.md`](publish-action/README.md)). It writes the zips and their `index.json` as static files that any internal web server can serve. `registry.json` is a short file you keep by hand, listing the URL of each `index.json`.
- **In QuizDock:** replace the whitelist with the internal registry, and list the hosts serving the zips.

The QuizDock side is described in [configuration](https://github.com/quizdock/quiz-dock/blob/main/docs/self-hosting/configuration.md) once the store page ships.
