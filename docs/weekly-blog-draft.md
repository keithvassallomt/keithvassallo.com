# Weekly blog draft

Every Saturday at 09:00 UK time, a workflow drafts one post with the OpenAI API and opens a pull
request here from a `blog-draft/<slug>` branch. The post follows
[writing-a-blog-post.md](writing-a-blog-post.md) and always has `draft: true`. It is written in
two passes, a facts-first draft and then an edit that turns it into a story, and comes with a
generated cover illustration. The pull request starts with a link to a preview of the post on
the [preview site](../infrastructure/blog-preview/README.md) and shows the cover. Review it,
then comment `/revise` or `/publish` on it (below). Both work from a phone.

The workflows run in a separate private repository, which holds the editorial instructions,
voice guide and writing samples. They never come into this repository, and neither do the run
logs. Only the scripts live here, in `scripts/blog-draft/`:

| File | Does |
| --- | --- |
| `draft.mjs` | The weekly draft: researches a topic, writes the post and the reports |
| `revise.mjs` | Revises a draft from Keith's comments on its pull request |
| `prompts.mjs` | The prompts and output schemas |
| `writer.mjs` | The write, check, build and repair loop both share |
| `cover.mjs` | The cover illustration, in one house style |
| `preview.sh` | Builds `main` plus every open draft and uploads it to the preview site |
| `checks.mjs` | Checks against the writing guide, the private-material check and the build |
| `context.mjs` | Loads the private material and the site's data |
| `github.mjs` | Read-only research tools over Keith's public repositories, and PR feedback |
| `openai.mjs` | A small, stateless Responses API client |

## Commands

`.github/workflows/blog-draft-commands.yml` acts on these comments on a draft pull request, from
Keith's account only.

**`/revise`** asks for changes. Comment on the lines you want changed first, then add a comment
that starts with `/revise`, followed by any overall request:

```text
/revise Tighten the opening and drop the comparison table.
```

It reacts with 👀 and starts the revision in the private repository. A few minutes later the
revision is pushed to the same branch, the preview updates, and a reply lists what changed. Each
revision reads only the comments made since the previous one, and keeps any edits made by hand on
the branch. General lessons about voice, such as a phrase to avoid, are saved privately and used
in later drafts.

**`/publish`** puts the post live. It reacts with 🚀, dates the post today, removes
`draft: true`, checks that the production build includes the post, squash-merges the pull
request and deletes the branch. The merge to `main` starts the usual deploy, and once the post
answers at its live URL, the workflow replies with the link. If anything fails before the merge,
nothing changes and the reply says so.

## Running locally

Against a checkout of the private repository:

```bash
OPENAI_API_KEY=... GITHUB_TOKEN=$(gh auth token) \
  node scripts/blog-draft/draft.mjs --private ../blog-private --out /tmp/blog-draft
```

It writes the post into `src/content/blog/` like the workflow does, so delete the folder
afterwards if you don't want it. The private repository's README covers setup, costs and how
each stage works.
