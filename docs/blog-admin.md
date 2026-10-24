# The blog admin

`keithvassallo.com/admin` is where blog posts are written, generated, revised, published,
scheduled, pinned and deleted, from a laptop or a phone. [blog-admin-plan.md](blog-admin-plan.md)
is the plan it was built from, stage by stage; this page is how it fits together now.

## Where things live

| Part | What it is |
| --- | --- |
| `src/admin/` | The admin itself: a Vue app, loaded only by `src/pages/admin/index.astro` |
| `src/pages/admin/posts.json.ts` | The posts on `main`, the categories, project ids and the pin, rebuilt with every deploy |
| `infrastructure/blog-admin/` | The AWS side, one CDK stack: sign-in (Cognito), the API (one Lambda), the table and bucket, the scheduler, and the two roles the workflows use ([README](../infrastructure/blog-admin/README.md)) |
| `.github/workflows/blog-admin-site.yml` | Site jobs: publish, update, unpublish, delete and pin. Runs `scripts/blog-admin/site-job.mjs` |
| `blog-ai.yml` in blog-private | AI jobs: generate, revise and new covers. Runs `scripts/blog-admin/ai-job.mjs` with the private material |
| `scripts/blog-draft/` | The AI's building blocks: the prompts, the OpenAI client, the write and check loop, the cover, and the research tools |
| `src/lib/post-checks.mjs` | The writing guide's rules, shared by the editor and the AI jobs |
| `src/lib/post-file.mjs` | Reading and writing a post's `index.md` |

Drafts live in the admin's table and bucket, not in the repo; `main` holds only what's live, plus
any post committed by hand with `draft: true`. Posts on `main` open in the admin by copying them in.

## How a job runs

Publishing and the AI both need more than a Lambda can give: a full site build, and for the AI,
several minutes and the private material. So the API records a job, starts a GitHub Actions
workflow with the job's id, and the workflow reports each stage back on the job, which the
editor follows. The workflows sign in to AWS through GitHub's OIDC, each to a role that only
its repository's `main` branch can take.

- **Site jobs** write the post from the admin's copy into `src/content/blog/<slug>/`, check the
  production build, commit to `main`, and wait for the CodePipeline run that deploys that commit.
  A dry run ("Check the build") stops before the commit.
- **AI jobs** save their result as a new version of the post, with History snapshots either side,
  and keep their notes (the brief, sources, questions, checks, reasoning summaries and cost) under
  `ai/` in the bucket. The post is locked while one runs.
- **Scheduled posts** get a one-off EventBridge Scheduler timer that starts the same publish.

The API starts workflows with the GitHub token saved in Settings: a fine-grained token with
Actions and Contents read and write on this repository and blog-private.

## Running it locally

```bash
npm run dev
```

Then open `http://localhost:4321/admin`. Sign-in, the API and the jobs are the real ones, since
`localhost:4321` is an allowed sign-in address; only the page is local.
