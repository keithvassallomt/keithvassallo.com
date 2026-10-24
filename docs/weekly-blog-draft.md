# Weekly blog draft

Every Saturday at 09:00 UK time, a workflow drafts one post with the OpenAI API and opens a pull
request here from a `blog-draft/<slug>` branch. The post follows
[writing-a-blog-post.md](writing-a-blog-post.md) and always has `draft: true`. Review it, add
images, remove `draft: true` and merge to publish.

The workflows run in a separate private repository, which holds the editorial instructions,
voice guide and writing samples. They never come into this repository, and neither do the run
logs. Only the scripts live here, in `scripts/blog-draft/`:

| File | Does |
| --- | --- |
| `draft.mjs` | The weekly draft: researches a topic, writes the post and the reports |
| `revise.mjs` | Revises a draft from Keith's comments on its pull request |
| `prompts.mjs` | The prompts and output schemas |
| `writer.mjs` | The write, check, build and repair loop both share |
| `checks.mjs` | Checks against the writing guide, the private-material check and the build |
| `context.mjs` | Loads the private material and the site's data |
| `github.mjs` | Read-only research tools over Keith's public repositories, and PR feedback |
| `openai.mjs` | A small, stateless Responses API client |

## Asking for changes

Review the pull request as usual: comment on the lines you want changed. Then add a comment that
starts with `/revise`, followed by any overall request:

```text
/revise Tighten the opening and drop the comparison table.
```

`.github/workflows/blog-draft-revise.yml` reacts with 👀 and starts the revision in the private
repository. It only acts on Keith's own comments. A few minutes later the revision is pushed to
the same branch, with a reply listing what changed. Each revision reads only the comments made
since the previous one, and keeps any edits made by hand on the branch. General lessons about
voice, such as a phrase to avoid, are saved privately and used in later drafts.

## Running locally

Against a checkout of the private repository:

```bash
OPENAI_API_KEY=... GITHUB_TOKEN=$(gh auth token) \
  node scripts/blog-draft/draft.mjs --private ../blog-private --out /tmp/blog-draft
```

It writes the post into `src/content/blog/` like the workflow does, so delete the folder
afterwards if you don't want it. The private repository's README covers setup, costs and how
each stage works.
