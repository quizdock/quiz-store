# quiz-store — specification

A community catalogue of quiz templates for [QuizDock](https://github.com/quizdock/quiz-dock).

**Status: in preparation.** The registry is empty and submissions are not open yet. The publication tool (CLI and action) and the author template's workflow come next; the end-to-end test with a new GitHub account (see the end of this document) comes before opening.

## Principles

1. **Optional satellite.** QuizDock works without this store. This store follows QuizDock's bundle format and never defines or extends it.
2. **Imitate, don't invent.**
   - A registry of author-hosted sources, as in Obsidian community plugins or Artifact Hub.
   - One source holds several packages, as in Helm chart repositories.
   - A fixed repository name, as in Homebrew taps (`<user>/homebrew-<name>`).
   - Contributors come in through a web form and create their repository from a GitHub template.
3. **Trust what the platform guarantees, nothing else.**
   - Ownership comes from write access to the source repository. The vendor in a quiz's identity is the account that owns that repository.
   - Whatever the bundle says (author, licence, credits) is the contributor's claim and the contributor's responsibility.
   - Acceptability comes from a human review of the source, and from reports afterwards.
4. **Shortest path for non-developers.** A contributor needs a GitHub account and a browser. No git, no command line, no file to write by hand. If a step needs explaining, the step is wrong.
5. **Clonable.** Any organization can run a closed copy on another forge, or with no forge at all. No hard-coded organization, host or URL pattern.

## Repositories

| Repository | Role |
| --- | --- |
| `quiz-store` | Registry, registration form, contributor guide, CLI and the action that wraps it |
| `quizdock-quizzes` | GitHub template repository, and the name every author repository should keep (a different name only triggers a warning) |

The format lives in `quiz-dock` ([quizdock/quiz-dock#21](https://github.com/quizdock/quiz-dock/issues/21) for the discussion). `quiz-store` validates against the bundle JSON Schema QuizDock publishes, one file per manifest version (`schema/quiz-bundle.v3.json`, from [quizdock/quiz-dock#84](https://github.com/quizdock/quiz-dock/pull/84)).

**Pinning.** The schema reaches QuizDock's `main` branch with its next release. Until then the CLI carries a copy, with the QuizDock commit it comes from; from that release on, it pins the file at the release tag.

## Identity

Proposal: **`<forge host>/<vendor>/<slug>`**, for example `github.com/alice/world-capitals`. It follows the form Go modules and the Terraform registry use.

| Part | Source | Written by |
| --- | --- | --- |
| forge host | The forge's host name (`github.com`, or `forge.acme.local` in a closed store) | the CLI, from its configuration |
| vendor | The account that owns the repository | the CLI, from the CI context |
| slug | The bundle `slug`, confirmed by the author in QuizDock's publication export | QuizDock |

- **Every author repository has the same name**, the name of the template (`<vendor>/quizdock-quizzes`), as in Homebrew taps. One vendor has one source, so host and vendor are enough to locate it.
- **Globally unique with no central counter and no list of providers.** Host names are unique, the forge guarantees unique vendors, and the file system guarantees unique slugs within a repository.
- **The identity only appears in `index.json`.** It is never used as a file name. The contributor never types it. The imported copy in QuizDock carries nothing of it ([quizdock/quiz-dock#39](https://github.com/quizdock/quiz-dock/issues/39)).
- **Known limits:**
  - Renaming an account changes the identity of all its quizzes. That is acceptable, since no imported copy refers to it.
  - The fixed name means one source per account. An organization account can host a second collection.

- **Wrong repository name:** the CLI publishes anyway and shows a warning in the publication report. The registry entry holds the full index URL, so nothing breaks; only the convention is lost.

## Author repository (created from `quizdock-quizzes`)

    alice/quizdock-quizzes
      quizzes/
        world-capitals.quizdock/
          quiz.json
          media/…
        80s-music.quizdock/
          quiz.json
          media/…
      README.md
      .github/workflows/publish.yml

- **One folder = one quiz**: a QuizDock export for publication, unzipped. The repository holds the quizzes as files, never as archives: `quiz.json` reads and diffs as text, and git stores an unchanged media file once, however many times the quiz is updated. **The zips are built by the release**, never committed.
- **Identity comes from the bundle `slug`, not the folder name.** A folder name can drift: a browser saves a second download as `world-capitals.quizdock (1).zip`, which unzips to `world-capitals.quizdock (1)/`. If two folders carry the same slug, the CLI publishes neither and reports the conflict: two versions of one quiz (delete the older folder) or two different quizzes with the same title (change the slug of one in QuizDock's publication export). It never guesses.
- **To add** a quiz, unzip the export and upload its folder into `quizzes/`. **To update** it, upload the new folder over the old one (delete the old one if its name differs). **To remove** it, delete the folder.
- A zip, or loose files, dropped into `quizzes/` are refused with a message saying what to upload instead.
- Media files the quiz no longer uses (left over from an earlier version) stay in the folder but are left out of the zip, with a note.
- The first run, with an empty `quizzes/` folder, publishes an empty index and does not fail.
- `publish.yml` only calls the shared action (`uses: quizdock/quiz-store/publish-action@v1`). A fix to validation or to the index reaches every author with no change on their side.

## Media

- **The expected path is QuizDock's publication export** (see below), unzipped. QuizDock's media library converts in the browser to light, widely read formats: WebP, MP4 H.264, M4A AAC. It also enforces its own size limits. What it exports is what the store expects.
- **If the contributor's browser cannot convert**, it is up to the contributor to prepare the media with the tools of their choice before adding them to QuizDock. The store gives no support for that.
- **The CLI checks nothing about media quality, only sizes:**
  - the quiz ≤ 20 MB (configurable, and the same default as QuizDock's `PUBLICATION_MAX_MB`), checked on the folder before reading it and on the built zip;
  - each media file within GitHub's 25 MB web-upload limit, which the 20 MB total already guarantees.

## QuizDock's publication export

[quizdock/quiz-dock#87](https://github.com/quizdock/quiz-dock/pull/87). A dedicated action, separate from the ordinary export, which stays a neutral backup. It prepares exactly what the store expects:

- **Slug:** prefilled with the quiz's own (or derived from the title), confirmed at every publication export, never frozen. Changing it warns that the store will see a new quiz.
- **Licence:** blocks unless it is one of the three allowed.
- **Language and tags:** required.
- **Credits:** warns for each media file without one, as a reminder that the contributor is responsible. It never blocks.
- **Size:** blocks above 20 MB and lists the heaviest media.
- **File name:** `<slug>.quizdock.zip`.

The CLI repeats the checks a bundle can prove, since a zip can come from anywhere: licence, language, at least one tag, size. Whether the quiz was *ready* only exists in QuizDock and is not checked again. Contributors who use this export should never see a red cross.

## Credits and rights

- **The contributor is responsible.** The CLI does not check credits. A media file without a credit shows up as a warning in the publication report, never as a failure.
- The guide warns about this clearly and points to reliable sources of open, free media.
- The only licence the CLI checks is the quiz licence, against the allow-list `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`.

## Publication (CLI, wrapped by the action)

On every push to the default branch:

1. **Validate each quiz folder on its own:**
   - bundle JSON Schema, at the pinned version;
   - every media the quiz uses is present;
   - total size;
   - quiz licence;
   - a valid language and at least one tag.
2. **Isolate failures.** An invalid quiz is left out of the index and reported with a message that says what to fix *in QuizDock*. The others are still published: one broken quiz must not block a repository of ten.
3. **Build one reproducible zip per quiz**: entries sorted, a fixed date, the manifest deflated and the media stored. The same files always give the same bytes, so the same sha256.
4. **Update a single rolling release** (tag `quizzes`). It uploads new or changed zips and deletes removed ones. Unchanged quizzes are never re-uploaded.
5. **Regenerate `index.json`** and attach it to the same release.

The CLI is a standalone Node script. It runs just as well in GitLab CI, Forgejo Actions or by hand, and it can write a plain static folder instead of a release.

### `index.json`

```json
{
  "format": "quizdock/index",
  "version": 1,
  "source": { "host": "github.com", "vendor": "alice", "homepage": "https://…", "issues": "https://…" },
  "generatedAt": "2026-09-25T12:00:00Z",
  "quizzes": [
    {
      "id": "github.com/alice/world-capitals",
      "slug": "world-capitals",
      "url": "https://…/world-capitals.quizdock.zip",
      "sha256": "…",
      "size": 1843200,
      "bundleVersion": 3,
      "title": "World capitals",
      "description": "…",
      "language": "en",
      "tags": ["geography"],
      "license": "CC-BY-4.0",
      "questionCount": 20,
      "updatedAt": "2026-09-20T08:00:00Z"
    }
  ]
}
```

URLs are absolute: QuizDock never builds a URL from a platform's naming scheme.

## Registry (`quiz-store`)

`registry.json`, edited only by maintainers:

```json
{
  "format": "quizdock/registry",
  "version": 1,
  "sources": [
    {
      "host": "github.com",
      "vendor": "alice",
      "index": "https://github.com/alice/quizdock-quizzes/releases/download/quizzes/index.json",
      "addedAt": "2026-10-01"
    }
  ]
}
```

- **Registration, after the first successful publication.** The author fills an issue form with their account name and ticks the attestations: rights on the content and its media, credits given, licence among the three allowed. The maintainer then reviews real quizzes, not an empty repository, and adds the entry.
- **Removal:** the maintainer deletes the entry. Future downloads stop; copies already imported by instances are unaffected.
- **Reports:** QuizDock's "Report" link opens the source's issue tracker, as given in `index.json`. For a takedown or a problematic source, reporters use the `quiz-store` issue tracker.
- **Known trade-off:** once a source is admitted, new quizzes in it are not reviewed. Reports and removal are the safeguard, as in Obsidian's model.

## On the QuizDock side: an inbound flow under a whitelist

- **`QUIZ_STORE_URL` is a whitelist of registries.** It holds the official registry by default. **Emptying it closes the flow**: no store page, no outgoing request.
- **Downloads may only reach the hosts on a second list**: the registry hosts plus the hosts named by the administrator, for example GitHub's release asset host. Every redirect is checked against this same list, and private or loopback addresses are refused.
- Everything read from a registry, an index or a zip is untrusted input: sha256 checked against the index, then the importer and its archive limits.

## Contributor guide

The step-by-step guide lives in [`CONTRIBUTING.md`](CONTRIBUTING.md). It stays on one screen: validation details, formats and CI internals belong in this specification, not in the guide.

## Running a closed store

See [`SELF-HOSTING.md`](SELF-HOSTING.md).

## To verify before writing the final guide

Run these tests with a brand-new GitHub account:

- [x] Workflows run in a repository created from the template, with no manual activation. *(2026-09-25: the initial commit of the new repository triggers the first run.)*
- [x] `permissions: contents: write` in the workflow is enough to create and update the release. *(2026-09-25, with a real QuizDock export: release created, unchanged zips kept by digest, errors annotated on the files.)*
- [ ] Whether two-factor authentication is required at once or after a grace period, for an account that pushes.
- [ ] After sign-up, GitHub brings the user back to the page they came from.
- [ ] Dragging a folder (with its `media/` sub-folder) onto GitHub's *Upload files* keeps its structure, in the common browsers.
- [ ] Whether "Use this template" proposes the template's name or leaves the field empty (the guide assumes the author types `quizdock-quizzes`).

Also note: the history keeps every version of `quiz.json` and each distinct media file once. Updating a quiz whose media did not change adds almost nothing.

## Out of scope for now

- Authenticated registries or sources.
- Signed indexes.
- Editorial curation, ratings.
- Pushing to an author repository from QuizDock.
