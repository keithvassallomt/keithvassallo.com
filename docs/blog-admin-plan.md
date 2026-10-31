# Blog admin plan

The admin area at `keithvassallo.com/admin` replaces the pull request flow for blog posts.
Every post is managed there, on a laptop or a phone: written by hand, generated on request or
drafted by the weekly run. From one list you edit, revise, publish, schedule, pin and delete.

The [design canvas](https://claude.ai/artifact/BVZoKWsvaHFUELgJJsZsfg) has a prototype of every
screen.

## Decisions

| Area | Decision |
| --- | --- |
| Where posts live | `main` holds only what's live. A private AWS store holds drafts, their images and versions, and the AI's notes |
| Writing in the IDE | Optional, as the last stage. A post committed with `draft: true` shows in the admin and can be finished there. If you edit a live post in VS Code, the admin picks up the change |
| Editor | Markdown with a live preview drawn by the site's own markdown pipeline. On a phone, Write and Preview are tabs |
| AI input | A "Notes for the AI" box sits beside the body (see the table below the decisions) |
| AI button | Generate while the post has no article, Revise once it has one. Start over asks first |
| Revising | Highlight passages in the preview, attach a note to each, add an overall request, then Revise. The result opens as a diff to keep or undo |
| Models | Listed from models.dev (below). The default everywhere is `gpt-6.1-sol` |
| Notifications | Email, plus a notification on each of your devices that allows it |
| Sign-in | Cognito, with your account only and no sign-up |
| Pinning | One pinned post at a time, shown first on the blog listing with a Pinned label. The page's script checks the optional end date, so an expiry needs no rebuild |
| Scheduled publishing | A one-off timer runs the normal publish at the chosen minute (below) |
| PR flow and preview site | Removed in stage 1 |

What the AI does with the notes box and the body:

| Notes | Body | What the AI does |
| --- | --- | --- |
| Empty | Empty | Picks a topic itself, as the weekly run does |
| Filled | Empty | Writes about what the notes say |
| Empty | Filled | Treats the body as your rough draft, keeps your words and builds on them |
| Filled | Filled | Follows the notes and builds on the body |

## Two things that differ from what you said

**Scheduled publishing can't be handled with JavaScript the way pin expiry is.** A pin only
changes where an already public post's card sits. A scheduled post, by contrast, would have to be
built and committed before its date. From that day on it would be in the public repo, answer at
its URL, and appear in the RSS feed and sitemap, so feed readers would pick it up early. Instead,
scheduling a post sets a one-off timer (EventBridge Scheduler) that runs the normal publish once,
at that minute. Nothing rebuilds on a timetable: publishing needs one build, and that's the only
one.

**models.dev has no 6.1 Luna, Terra or Astra.** So far GPT-6.1 comes only as Sol. Luna and Astra
are still at GPT-6, and there's no GPT-6 Terra.

To make the list, the admin starts from OpenAI's models on models.dev and keeps those that:

- reason, call tools and return structured output
- aren't deprecated
- aren't pro, mini, nano, codex or preview variants

From what's left it shows the newest model of each tier (Luna, Terra, Sol, Astra) in each
generation you allow in Settings. Allowing `gpt-6` and `gpt-5.6` gives this list today:

| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| `gpt-6.1-sol` (default) | $2.00 | $0.10 | $10.00 |
| `gpt-6-astra` | $10.00 | $1.00 | $50.00 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.50 |
| `gpt-5.6-sol` | $4.00 | $0.40 | $20.00 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $12.00 |
| `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 |

Prices are per million tokens.

- **`gpt-5.6` appears once.** models.dev gives it the same family, price and release date as
  `gpt-5.6-sol`, so the list shows it as 5.6 Sol.
- **New generations.** When a newer generation appears on models.dev, Settings flags it and you
  add it to the allowed list.
- **Image models.** models.dev lists `gpt-image-2` for OpenAI but not 2.5 Flare, so the image
  model comes from a short fixed list in Settings, with `gpt-image-2.5-flare` as the default.

At PR #2's token counts, a run costs about $1 on 6.1 Sol, against about $5 on Astra. Neither
figure includes web searches or the cover.

## How it fits together

| Part | What it is | Where |
| --- | --- | --- |
| Admin | A Vue app loaded only on `/admin`, so public pages ship none of it | Site repo: `src/admin/`, `src/pages/admin/` |
| Sign-in | Cognito user pool. Managed login on `auth.keithvassallo.com`, with a passkey and a password | AWS, eu-west-1 |
| API | An HTTP API that checks your Cognito token, in front of one Lambda | AWS |
| Store | One DynamoDB table (posts, versions, jobs, settings) and one versioned S3 bucket (post files, images, AI notes) | AWS |
| AI runner | `blog-ai.yml`: generate, revise and cover jobs, plus the weekly schedule | GitHub Actions in blog-private |
| Site runner | `blog-site.yml`: publish, update, unpublish, delete and pin jobs | GitHub Actions in the site repo |
| Notifier | A Lambda on the table's change stream that sends emails through SES and Web Push notifications | AWS |
| Timers | EventBridge Scheduler one-off schedules for scheduled posts | AWS |
| Deploy | CodePipeline on `main`, unchanged | AWS |

The infrastructure is one CDK app, written in JavaScript, at `infrastructure/blog-admin/`. That's
the same tooling icecore uses.

AI runs stay on GitHub Actions because a run takes minutes and builds the whole site to check the
post, which is more than Lambda suits. The private material, the OpenAI key and the logs also stay
in blog-private, so AWS never holds the OpenAI key.

### What happens when you...

- **Tap Generate or Revise.**
  1. The API records a job and starts `blog-ai.yml` with the job's id.
  2. The run signs in to AWS through GitHub's OIDC and reads the job and the post.
  3. It does the work with the existing scripts, reporting each stage to the job as it goes.
  4. It saves the result as a new version of the post.

  The editor shows the stages live, and Cancel cancels the run.
- **Tap Publish.** The API starts `blog-site.yml`, which:
  1. copies the post from the store into `src/content/blog/<slug>/` and sets the date
  2. checks the production build
  3. commits to `main`
  4. waits for the post to answer at its URL

  CodePipeline deploys it as it does today.
- **Schedule a post.** The API creates a one-off timer, which starts the same publish at that
  minute.
- **A job finishes.** The notifier emails you and sends a notification to each device you've
  allowed.

## Data

- **Posts** (DynamoDB, one item each, text included). Each post holds:
  - id, slug and title, and the body
  - status: draft, scheduled, live, live with unpublished changes, or in the bin
  - category, tags, description and share blurbs
  - cover and alt text
  - notes for the AI
  - source: weekly, on request, by hand, or from the repo
  - dates: created, updated, published and scheduled
  - the commit it was last published in, its current version, and any running job

  A save says which version it started from, so one device can't overwrite another's work.
- **History** (DynamoDB). Snapshots of a post, by name. Saving takes one every ten minutes, kept
  for 30 days. Restores, AI runs and publishing take ones that are kept for good.
- **Files** (S3, versioned):
  - the post's images and cover, under `posts/<id>/`
  - `ai/<id>/<job>.json`, the AI's notes from each run, kept apart so the site runner can't read them
- **Jobs** (DynamoDB). Each job records:
  - kind, post, model, reasoning effort and image model
  - status and current stage
  - the Actions run id
  - token usage and cost
  - any error, and timestamps
- **Settings** (DynamoDB):
  - default model and reasoning effort, image model, and allowed generations
  - the monthly spend cap
  - weekly options and notification devices
- **The pin** lives in the site repo as `src/data/blog/pin.json` (`slug`, plus an optional
  `until`), because the static listing needs it at build time.

## Stages

Each stage ends with something that works end to end. I run the builds, the checks and a real
smoke test of each flow. You check how it looks and feels on your phone and laptop.

### Stage 0: done

- `OPENAI_MODEL` in blog-private is now `gpt-6.1-sol`, so every run uses it.
- The weekly schedule stays off until stage 6.

### Stage 1: clear the ground

- Delete `.github/workflows/blog-draft-commands.yml` and `scripts/blog-draft/preview.sh` here, and
  `revise-blog-draft.yml` in blog-private.
- Delete the preview site:
  - CloudFront distribution `E2M0FH8HMTSME4`, with its origin access control and response headers
    policy
  - the `keithvassallo.com-preview` bucket
  - the `keithvassallo-com-preview-deploy` role
  - `infrastructure/blog-preview/` and the `PREVIEW_*` variables

  I'll list each one and confirm with you before deleting.
- Delete the `BLOG_PRIVATE_ACTIONS_TOKEN` secret, and you revoke the token on GitHub.
- Set the scripts' default model to `gpt-6.1-sol` and update the docs.
- Leave the weekly workflow disabled, since stage 6 replaces it.

**Done when:**

- the site builds
- no workflow mentions previews or the PR commands
- AWS no longer lists the preview resources

### Stage 2: sign-in and an empty admin

- The CDK app, with:
  - a Cognito user pool: sign-up off, your user, passkey and password
  - managed login on `auth.keithvassallo.com`, with its certificate and Route 53 record
  - the HTTP API and its Lambda
  - the DynamoDB table and the S3 bucket
- The `/admin` page, built with `@astrojs/vue`:
  - sign-in and sign-out, and Add a passkey in Settings
  - navigation: Posts, Weekly, Ideas, Style lessons, Spend, Settings
  - kept out of search engines: `noindex`, left out of the sitemap, disallowed in `robots.txt`
- Screens have hash addresses (`/admin#/weekly`), so every screen is the one static page. A link
  in an email still opens the right post, and the live CloudFront function stays untouched.
- The posts list shows the posts on `main` from `/admin/posts.json`, which each site build
  writes, with search and filters for status and category.

**Done when:**

- you can sign in with a passkey on your phone and laptop
- the list shows the live posts
- the API refuses any call made without your token

### Stage 3: writing by hand

- **New post and the editor.**
  - A title field and a CodeMirror 6 markdown editor. Its toolbar has bold, italic, heading,
    link, code, list, callout, image, `kbd` and `mark`.
  - On a laptop the editor sits beside the preview. On a phone, Write and Preview are tabs.
- **Preview.** The API renders it with Sätteri's native build and the site's own plugins and
  Shiki theme, the same pipeline as the real build, a moment after you stop typing. Sätteri's
  browser build is threaded WebAssembly, which would need cross-origin isolation headers on
  `/admin`. The admin shows the result with the blog CSS in a sandboxed frame, so nothing in a post
  can run code with your session. That matters because AI text comes partly from web pages.
- **Details panel.** Slug, description, category, tags, cover and alt text, and the share blurbs,
  each with a counter for its network's limit.
- **Checks.** `checks.mjs` is split so the same rules run in the browser as you type, with
  failures marked in the editor's gutter. Publishing warns you when any check fails.
- **Images.**
  - Paste an image, or pick one from your photos.
  - Before upload, the browser resizes it to 2,400 px at most and re-encodes it as WebP, which
    also strips location data from phone photos.
  - Covers can be uploaded and removed.
- **Autosave.**
  - It saves two seconds after you stop typing, to the browser first, so a dropped connection
    loses nothing.
  - If another device saved in between, you get a conflict warning instead of an overwrite.
- **History and the bin.** History lists the saved versions, and any of them can be restored;
  the one it replaces is kept too. Deleted drafts stay in the bin for 30 days.

**Done when:**

- a draft started on the phone with a photo opens on the laptop exactly as you left it
- an em dash shows up as a failing check
- an earlier version restores

### Stage 4: publishing

- **The GitHub token.** A fine-grained token you paste into Settings, which checks it can see
  both repos and stores it as an SSM SecureString. It needs:
  - Actions read and write on both repos, to start and cancel runs
  - Contents read and write, for ideas and style lessons in stage 7
- **The site runner.** `blog-admin-site.yml` in the site repo, started by the API. It signs in to AWS
  through OIDC, to a role that can only read posts and update jobs.
- **Publishing actions.**
  - **Publish now.**
  - **Update live post.** This sets `updatedDate`. A slug change moves the folder and adds
    `redirectFrom`, so shared links keep working.
  - **Unpublish.** The post leaves `main` and goes back to drafts.
  - **Delete live post.** You type the title to confirm, and it goes to the bin.
- **Pinning.**
  - Pin and unpin one post at a time, with an optional end date.
  - The blog listing shows the pinned post first. When it is also the newest post, its card gets
    a Pinned label; otherwise it gets its own Pinned card above the grid, and its card in the
    grid is hidden. After the end date, a few lines of script undo either.
  - Pinning and unpinning deploy the site. Expiry doesn't.
- **Scheduling.** Schedule, reschedule and cancel, using one-off timers.
- **Editing a live post.**
  - Edits go to a copy, so saving doesn't deploy.
  - If `main` has changed since, for example after an edit in VS Code, the admin loads the newer
    file first.
- **Progress.** The admin shows checking, committing, deploying and live as they happen. Site jobs
  run one at a time. "Live" means the CodePipeline run for that commit finished and the page
  answers.
- **Check the build.** The publish dialog can run everything except the commit, to see whether a
  post would build before anything goes live.

**Done when:**

- a test post published from the phone goes live, then unpublishes
- a post scheduled ten minutes ahead goes live on time
- a pin ending five minutes ahead drops off without a deploy
- a renamed post's old URL redirects

Then the test post is deleted.

### Stage 5: AI in the admin

- **The AI runner.** `blog-ai.yml` in blog-private, started by the API with a job id. It signs in
  to AWS through OIDC.
- **One script, `scripts/blog-admin/ai-job.mjs`,** takes its input from the job. The pull request
  scripts (`draft.mjs`, `revise.mjs`) and the old weekly workflow are gone:
  - **Generate.** It handles the four combinations of notes and body. Facts in the notes count as
    yours, as the `topic` input does now.
  - **Revise.** It works from the highlighted passages and their notes, plus an overall request.
    Style lessons still go to `keith-feedback.md`.
  - **Cover.** It regenerates the cover, with an optional instruction.
- **While a run works on a post,** the editor is read-only and the API refuses saves. It shows
  each stage (researching, drafting, story edit, cover, checks) with a Cancel button.
- **Notes on passages** come from selecting text in the preview. They're marked there, and kept on
  the device until the revision succeeds.
- **A revision opens as a diff,** in CodeMirror's merge view, with Keep and Undo.
- **The AI notes panel** is collapsed by default and holds:
  - why this topic, and the shortlist
  - the evidence and sources
  - open questions
  - the checks that failed and how they were fixed
  - a summary of each stage, from OpenAI's reasoning summaries
  - tokens and cost
- **The model picker** follows the rule above. It shows an estimated cost per run based on your
  past runs. Reasoning effort and the image model sit under Advanced.
- **Cost.**
  - Each run's cost comes from models.dev prices, including Sol's higher rate above 272k tokens of
    context.
  - Web searches and images are added at rates kept in Settings.
  - A monthly cap: once spending passes it, the API refuses new runs.

**Done when:**

- generating from an empty post, from notes only and from a rough draft each gives a draft that
  passes the checks
- a revision with two highlights lands as a diff
- Cancel stops a run
- a run's cost is within 10% of what OpenAI's usage page shows

### Stage 6: the weekly run and notifications

- **The weekly run.**
  - An EventBridge Scheduler timer, Saturday 09:00 Europe/London, calls the API's Lambda. (It was
    `blog-ai.yml`'s GitHub schedule at first, which never fired on 31 October 2026.)
  - It reads the Weekly settings. If the run is off or skipped, it stops and records why. A queued
    topic is used as your notes.
  - The draft arrives in the list marked Weekly.
- **The Weekly page.** On or off, the next run, skip the next run, queue a topic, the model, and
  past runs with their outcomes.
- **Notifications.**
  - The notifier emails `keith@vassallo.cloud` from the SES identity the contact form already
    uses.
  - It also sends Web Push notifications to each device you've allowed.
  - The admin can be installed to your home screen. On Android, Chrome shows notifications even
    with the tab closed.
  - An open tab also shows a toast.
- **Clean-up.** Delete the `SITE_REPO_TOKEN` secret (the old weekly workflow went in stage 5), and
  update `docs/blog-admin.md`.
- **Turn the schedule on.**
- **As built:** a week with no draft is recorded as a skipped run, so the Weekly page and the
  email say why. The month's spending cap also skips the week. Email goes through SES in
  `us-east-1`, where the contact form's identity is.

**Done when:**

- a weekly-mode run started by hand produces a draft, an email and a notification on your phone
- turning the weekly run off, or skipping a week, stops the next run

### Stage 7: ideas, style lessons and spend

- **Ideas.**
  - Add an idea from your phone (one line, plus optional detail), and edit or delete it.
  - Ideas are saved to `notes/ideas.md` in blog-private, which the research stage already reads.
  - When a run uses an idea, the idea is marked with a link to the draft.
- **Style lessons,** in their own area. They're the lessons in `instructions/keith-feedback.md`,
  which you can edit or delete. Changes are saved as commits, so git keeps the history.
- **Spend.** This month's total against the cap, each run's model, tokens and cost, and the average
  cost per model.
- **Token expiry.** Settings warns you 14 days before the GitHub token expires, and you get an
  email too.

**Done when:**

- an idea added on the phone is picked up by a weekly-mode run
- a deleted lesson is missing from the next run's instructions
- the month's total matches the runs

**As built:** Draft this on an idea opens a new post with the idea as its notes, rather than
generating straight away, so you choose the model as usual. The research names the idea it drew
on, and the job marks it. The job now saves lessons and idea marks through GitHub's API as it
goes, so they can't clash with an edit made in the admin at the same time. The token warning
emails at 14 days, at 3 days and on expiry, and every screen shows a banner from 14 days out.

### Stage 8 (optional): posts from the IDE

- Posts on `main` with `draft: true` appear in the list marked From the repo.
- Opening one copies it into the admin, and publishing writes it back.

**Done when:** a draft committed from VS Code can be finished and published from the phone.

**As built:** done along with stage 4. The list shows posts on `main`, drafts included, from
`/admin/posts.json`; opening one copies it and its files into the admin, and publishing writes
it back to the same folder. Not yet tried with a draft committed from VS Code.

### Stage 9: your ideas first, and questions for you

Prototyped in the canvas's "Your ideas first, and questions for you" section.

- **Ideas are a queue.**
  - The list is oldest first. A new idea goes to the end, unless you tick Write this one next.
  - Make next moves an idea to the top.
  - The weekly run, and Generate on an empty post, take the idea at the top. A topic set on the
    Weekly page still goes first.
  - The code takes the idea, not the model. It goes in as the post's notes for the AI, so the
    research can't pass over it. The shortlist is just that idea, without the category mix.
  - An idea leaves the list as soon as a post is made from it. Its words go with the post.
    Otherwise a post waiting on you would leave the idea at the top, and the queue would stick.
- **The AI asks before it writes.**
  - If your idea doesn't say what you think, the research stops and asks rather than guessing.
    A run never skips one of your ideas.
  - It offers two to four angles the evidence supports, plus your own, and up to three
    questions only you can answer.
  - You get a notification and an email. The post shows as Needs you.
  - Write it starts the writing, reusing the research. Let the AI choose writes now with its
    pick, and asks on the draft whether it got your view right.
  - Unanswered, the post just sits. Next Saturday takes the next idea.
  - Put it back in Ideas returns the idea to the top of the queue and bins the post.
- **Drafts leave gaps for you.**
  - The AI never invents your experience or your verdict. Where the post needs them, it leaves a
    gap: a `> [!KEITH] label` blockquote, with the question on the next line.
  - The For you panel lists the gaps. What you type goes in word for word.
  - Publishing waits until every gap is filled, in the admin and in the API.
- **Questions for you.** The draft's questions sit in For you with an answer box, or Leave it
  out. Answers save as you type. Revise with my answers sends them to the AI as your own words,
  and the revision returns whatever is still open.
- **Share to the admin.** On Android, with the admin installed, it appears in the share sheet.
  Sharing a page opens New idea with its title and link filled in, through the sign-in if your
  session has ended.
- **A proper app.**
  - Its own icons, including maskable ones for Android's shapes and a monochrome badge for
    notifications.
  - Shortcuts to New idea, Posts and Weekly from a long press on the icon.
  - A service worker that keeps the app's files, so it opens without a connection. Anything that
    needs the API still needs one.

**Done when:**

- a weekly run takes the oldest idea, and the idea leaves the list
- an idea without an angle produces a Needs you post, a notification and an email
- answering it produces a draft with any gaps and questions in For you
- a post with a gap can't be published
- a page shared from Chrome on the phone lands in New idea

## Running costs

- **AWS:** under a dollar a month at your usage.
  - Cognito is free for one user.
  - Lambda, DynamoDB, S3, Scheduler and SSM parameters cost pennies.
  - SES charges $0.10 per thousand emails.
  - The preview site's distribution and bucket are removed.
- **AI:** about $1 a run on 6.1 Sol, plus web searches and the cover. Revisions cost less.

## Security

- **One user.** There's a single Cognito user, and the API checks on every request that the token
  is yours.
- **Private drafts.** Drafts and AI notes stay private in the S3 bucket, where today they're public
  pull requests.
- **No long-lived AWS keys.** Each workflow signs in to AWS through OIDC, to a role limited to what
  it does.
- **Private material stays private.** The OpenAI key stays a blog-private secret. The voice guide
  and samples stay in blog-private and never reach AWS or the admin.
- **Sandboxed preview.** The preview runs in a sandboxed frame.
- **Public logs, safe contents.** The site runner's logs are public, so it only ever reads the
  post it's publishing.

## Checked early

- **Cognito passkeys.** Do they need the custom domain, and how does managed login look on a phone?
  Checked in stage 2.
- **Sätteri's browser build.** Checked: it's threaded WebAssembly, so the preview renders in the
  Lambda instead (stage 3).
- **6.1 Sol against Astra.** The first draft generated in stage 5 shows how 6.1 Sol's writing
  compares. Astra stays available as a per-run choice.
