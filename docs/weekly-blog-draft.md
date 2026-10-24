# Weekly blog draft

> The blog admin at `/admin` is replacing this pull request flow; see
> [blog-admin-plan.md](blog-admin-plan.md). The `/revise` and `/publish` commands and the
> preview site have been removed, and the weekly workflow stays disabled until the admin's
> weekly run takes over.

The weekly workflow drafts one post with the OpenAI API and opens a pull request here from a
`blog-draft/<slug>` branch. The post follows [writing-a-blog-post.md](writing-a-blog-post.md) and
always has `draft: true`. It is written in two passes, a facts-first draft and then an edit that
turns it into a story, and comes with a generated cover illustration. Until the admin can publish,
a draft is published by hand: remove `draft: true`, set `pubDate`, and merge.

The workflow runs in a separate private repository, which holds the editorial instructions, voice
guide and writing samples. They never come into this repository, and neither do the run logs. Only
the scripts live here, in `scripts/blog-draft/`:

| File | Does |
| --- | --- |
| `draft.mjs` | The weekly draft: researches a topic, writes the post and the reports |
| `revise.mjs` | Revises a draft from Keith's comments on its pull request. Unused until the admin's revisions replace it |
| `prompts.mjs` | The prompts and output schemas |
| `writer.mjs` | The write, check, build and repair loop both share |
| `cover.mjs` | The cover illustration, in one house style |
| `checks.mjs` | Checks against the writing guide, the private-material check and the build |
| `context.mjs` | Loads the private material and the site's data |
| `github.mjs` | Read-only research tools over Keith's public repositories, and PR feedback |
| `openai.mjs` | A small, stateless Responses API client |

## Running locally

Against a checkout of the private repository:

```bash
OPENAI_API_KEY=... GITHUB_TOKEN=$(gh auth token) \
  node scripts/blog-draft/draft.mjs --private ../blog-private --out /tmp/blog-draft
```

It writes the post into `src/content/blog/` like the workflow does, so delete the folder
afterwards if you don't want it. The private repository's README covers setup, costs and how
each stage works.
