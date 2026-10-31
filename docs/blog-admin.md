# The blog admin

`keithvassallo.com/admin` is where blog posts are written, generated, revised, published,
scheduled, pinned and deleted, from a laptop or a phone. [blog-admin-plan.md](blog-admin-plan.md)
is the plan it was built from, stage by stage; this page is how it fits together now.

## Where things live

| Part | What it is |
| --- | --- |
| `src/admin/` | The admin itself: a Vue app, loaded only by `src/pages/admin/index.astro` |
| `src/pages/admin/posts.json.ts` | The posts on `main`, the categories, project ids and the pin, rebuilt with every deploy |
| `infrastructure/blog-admin/` | The AWS side, one CDK stack: sign-in (Cognito), the API (one Lambda), the table and bucket, the scheduler, the notifier, and the two roles the workflows use ([README](../infrastructure/blog-admin/README.md)) |
| `.github/workflows/blog-admin-site.yml` | Site jobs: publish, update, unpublish, delete and pin. Runs `scripts/blog-admin/site-job.mjs` |
| `blog-ai.yml` in blog-private | AI jobs: generate, revise and new covers, the weekly draft included. Runs `scripts/blog-admin/ai-job.mjs` with the private material |
| `public/admin-sw.js` | The service worker: notifications on the devices allowed in Settings, and the app's own files kept for opening offline |
| `public/admin.webmanifest`, `public/admin-icons/` | The installed app: its icons (drawn by `scripts/admin-icons.mjs`), long-press shortcuts and the share target |
| `scripts/blog-draft/` | The AI's building blocks: the prompts, the OpenAI client, the write and check loop, the cover, and the research tools |
| `src/lib/post-checks.mjs` | The writing guide's rules, shared by the editor and the AI jobs |
| `src/lib/post-file.mjs` | Reading and writing a post's `index.md` |
| `src/lib/private-notes.mjs` | The format of the ideas and style lessons files in blog-private, and saving them on GitHub |

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
- **The weekly run** is an EventBridge Scheduler timer, Saturdays at 09:00 UK time, that calls
  the API's Lambda (`timer()` in `lambda/api/weekly.mjs`). It reads the Weekly settings first: if
  the run is off, the week is skipped or the month's AI spending has reached the cap, it records
  why as a skipped run. Otherwise it creates a post, with any topic set on the Weekly page as its
  notes, and starts a generate job like any other, so it needs the GitHub token in Settings. With
  no topic set, the generate job takes the idea at the top of the queue (below). Run it now on the Weekly
  page does the same, without the checks. It used to be `blog-ai.yml`'s own GitHub schedule, until
  that never fired on its first Saturday (31 October 2026).

## Ideas and style lessons

The Ideas page is `notes/ideas.md` in blog-private and the Style lessons page is
`instructions/keith-feedback.md`, read and saved through GitHub's Contents API with the token in
Settings, so each change is a commit there. Each save reads the file and writes it back against
its sha, and does it again if something else saved in between, so an edit on the phone and a job
finishing at the same moment both land.

- Each idea is a `## ` heading with a comment holding its id and the day it was added. The file
  is a queue, oldest first: a new idea goes at the end, unless Write this one next puts it at the
  top, and Make next moves one there.
- Generating an empty post, which is what the weekly run does, takes the idea at the top: the API
  removes it from the file and puts its words in the post's notes for the AI. Draft now does the
  same for any idea. The idea comes out before the post is made, so two runs can't take the same
  one, and git keeps it if anything fails after.
- Lessons are bullets under dated headings. Revisions add a section named after the post; lessons
  added by hand go under "added by Keith". An edit changes only that lesson's lines.

The AI job saves its lessons the same way, with the workflow's own token, as it goes; the
workflow commits only the brief at the end.

## Your ideas, your angle and your words

A post made from one of Keith's ideas is about that idea: the research builds the brief around
it alone, without the usual shortlist across categories, and never skips it.

- **Needs you.** If the idea doesn't say what Keith thinks, the research stops instead of
  guessing. The post gets an `ask` (the angles the evidence supports and up to three questions),
  shows as Needs you, and the notifier sends a "Needs your angle" email and notification. His
  answers go to `POST /posts/{id}/generate` as `answers`: the API adds them to the notes in his
  words, and the new run (`resumeFrom`) reuses the first run's evidence with a smaller search
  budget. Let the AI choose (`answers.choose`) writes with the AI's pick and asks on the draft.
  Put it back in Ideas returns the idea to the top of the queue and bins the post.
- **Gaps.** Where a draft needs Keith's own experience or verdict, the AI leaves a
  `> [!KEITH] label` blockquote with the question on the next line (three at most), instead of
  inventing it. The preview shows each as a dashed yellow box; the editor's For you panel and
  Checks list them; and both the Publish dialog and the API refuse to publish while one is left.
  What he types in For you replaces the gap word for word.
- **Questions.** The draft's `questions` are a field of the post (`{ id, text, answer, left }`), so
  answers save with the post as he types. A revision sends answered ones as his own statements
  and left-out ones as settled, and returns the questions still open.
- **Notes for the AI.** Generate reads all of them. A revision sends only the lines added or
  edited since a run last read them: Generate and Revise record the notes they read as
  `notesSeen` on the post. Deleted lines don't go, since a note he's done with may simply have
  been handled. A post drafted before `notesSeen` existed compares against the snapshot of the
  job that generated it.

## Notifications

The notifier Lambda reads the table's change stream, filtered to jobs. When a job ends, it sends
an email to `keith@vassallo.cloud` through SES, and a Web Push notification to each device
allowed in Settings, for the events chosen there. A draft's message says how many gaps and
questions are waiting. Cancelled jobs, dry runs and pin changes stay
quiet. Push needs a VAPID key pair: the public key is in `cdk.json`, the private key in the SSM
parameter `/blog-admin/vapid-private-key`. An open admin tab shows the notification as a toast as
well. On an iPhone, notifications only work once the admin is added to the home screen.

## The installed app

The admin installs to a phone's home screen as its own app, with its own icons (redrawn by
`node scripts/admin-icons.mjs`), and a long press on the icon offers New idea, Posts and Weekly.
The service worker keeps the page and the build's files, so it opens without a connection;
anything that needs the API still needs one.

On Android, the installed admin is in the share sheet. Sharing a page opens it at
`/admin?share-title=…&share-text=…&share-url=…`, which `src/admin/share-target.js` turns into the
Ideas screen's own address before the router starts, so it survives a sign-in. iPhones don't
support share targets for web apps.

A daily rule (08:00 UTC) also runs the notifier to check the GitHub token: it warns 14 days and 3
days before the token expires, and once it has. Every screen shows a banner from 14 days out.

The API starts workflows with the GitHub token saved in Settings: a fine-grained token with
Actions and Contents read and write on this repository and blog-private.

## Running it locally

```bash
npm run dev
```

Then open `http://localhost:4321/admin`. Sign-in, the API and the jobs are the real ones, since
`localhost:4321` is an allowed sign-in address; only the page is local.
