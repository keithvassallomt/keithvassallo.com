# Writing a blog post for keithvassallo.com

You are drafting a post for Keith Vassallo's blog. A post is one Markdown file plus its images.
Everything else is generated from that file at build time: the blog index, category and tag pages,
the RSS feed, the sitemap, social preview cards, Open Graph and structured metadata, the table of
contents, reading time and related posts.

**Never edit templates, components, layouts or anything under `src/pages`, `src/components`,
`src/layouts` or `src/lib` to publish a post.** If something seems to need a template change, stop
and tell Keith instead.

## Checklist

1. Choose a slug and create `src/content/blog/<slug>/`.
2. Write `src/content/blog/<slug>/index.md`: frontmatter first, then the body.
3. Put every image the post uses in the same folder.
4. Write a share blurb for each network.
5. Keep `draft: true`. Keith reviews and publishes.
6. Check your work (see [Check your work](#check-your-work)).

## Where things go

```text
src/content/blog/
└── nextcloud-in-the-android-photo-picker/    <- folder name = URL slug
    ├── index.md                               <- the post
    ├── cover.avif                             <- cover image (optional)
    ├── picker.avif                            <- images used in the body
    └── keyboard.avif
```

The post above is published at `/blog/nextcloud-in-the-android-photo-picker`. It is a working
sample that uses every feature in this guide, so read it before writing your first post.

**Slug rules.** Lowercase ASCII words joined by hyphens, three to six words, describing the topic.
No dates, and never just a number (`/blog/2` is a page of the index). The slug is permanent once
published, so choose carefully.

**Images** go in the post's folder and are referenced with a relative path (`./picker.avif`). Never
put post images in `public/`: those are not optimised.

**Categories** are defined in `src/data/blog/categories.yaml`. Every post has exactly one. Current
ids:

| id | Use for |
| --- | --- |
| `android` | Apps, APIs and tinkering on Android |
| `linux` | The Linux desktop, GNOME, Plasma and their tools |
| `self-hosting` | Running your own services, Nextcloud and friends |
| `open-source` | Open-source projects, communities and the people in them |
| `teaching` | Teaching technology, notes from the classroom |
| `dev` | One of Keith's own projects as the main subject: a first proper look at an app, or the highlights of a new release from its changelog |
| `cloud` | AWS and other cloud platforms: infrastructure, deployment, architecture, cost and reliability |
| `ai` | AI models, agents, automation and coding assistants |
| `programming` | Python and software engineering practice |
| `policy` | Technology news and policy in the UK, Malta and the EU |

When the main subject is one of Keith's projects, use `dev`, even for an Android or Linux app. The
platform categories are for posts about the platform itself.

Only add a new category when none of these fit, and mention it to Keith when you hand over. A new
entry needs an `id`, `name`, `description` and a `color` from: `green`, `orange`, `cyan`, `purple`,
`blue`, `red`, `indigo`, `yellow`, `pink`, `lime`.

## Frontmatter

```yaml
---
title: Putting Nextcloud inside Android's photo picker
description: Android's system photo picker can show photos from a cloud provider. I wanted that provider to be my own Nextcloud server, so I built one.
pubDate: 2026-10-23
category: dev
tags: [Kotlin, Nextcloud, Android]
cover: ./cover.avif
coverAlt: "NC Media Provider: your Nextcloud photos, in Android's photo picker"
share:
  linkedin: |
    First line is the hook.

    A short second paragraph with the substance.

    #Android #Nextcloud
  x: "One or two punchy sentences."
  bluesky: "One or two punchy sentences."
  threads: "A sentence or two, with at most one #Topic."
  mastodon: |
    A sentence or two.

    #Android #Nextcloud #SelfHosting
  facebook: "A conversational sentence or two."
draft: true
---
```

| Field | Required | Rules |
| --- | --- | --- |
| `title` | Yes | Sentence case, ideally under 70 characters so it fits search results and the social card. |
| `description` | Yes | One or two sentences, 120 to 160 characters. Shown on index cards, in search results, the feed and social previews, so it must make sense on its own. Never "In this post, I...". |
| `pubDate` | Yes | `YYYY-MM-DD`. Today's date unless Keith gives another. |
| `category` | Yes | One id from the table above. |
| `tags` | Recommended | Two to five, written as the names are normally written (`Kotlin`, `GNOME`, `Nextcloud`). Reuse tags from existing posts where they fit, so tag pages group properly. |
| `cover` | Optional | Landscape image in the post folder, at least 1200px wide, roughly 2:1. Shown at the top of the post and, cropped, on index cards. |
| `coverAlt` | With `cover` | Describes the cover image. The build fails without it. |
| `share` | Recommended | Per-network blurbs. See [Share blurbs](#share-blurbs). |
| `draft` | Yes, `true` | Always `true` for posts you write. Keith removes it to publish. |
| `updatedDate` | Only on edits | Set when a published post changes in substance, not for typo fixes. |
| `socialImage`, `socialImageAlt` | Rarely | A hand-made social preview image. Omit it: a branded card with the title is generated automatically. |
| `metaTitle`, `metaDescription` | Rarely | Override the title or description used in search results and previews only. |
| `canonicalURL` | Rarely | Only when the post was first published on another site. |
| `redirectFrom` | Only on renames | After renaming a published post's folder, list the old path (`/blog/old-slug`). It becomes a 301 redirect. |

YAML tips: wrap single-line values in double quotes when they contain `:`, `#` or start with a
quote. Use `|` for multi-line values. Apostrophes are fine inside double quotes.

## Share blurbs

Each post has share buttons for LinkedIn, Bluesky, Threads, X, Facebook and Mastodon. The `share`
blurbs are the suggested post text for each one. X, Bluesky, Threads and Mastodon open with the text
prefilled.
LinkedIn and Facebook can't prefill text, so the button copies it to the clipboard for pasting.

**Anyone who reads the post can click these buttons**, so write blurbs that read naturally from any
sharer: describe what the post offers. Avoid "I wrote", "my new post" or "check out my blog".

**Never include the link.** It is added automatically. Counts below already allow for it, and the
build fails with an exact character count if a blurb is too long.

| Key | Limit for the blurb | Style |
| --- | --- | --- |
| `linkedin` | About 2,800 characters | Professional. The first line is the hook, since LinkedIn hides the rest behind "see more" after roughly 200 characters. Two to four short paragraphs, then three to five hashtags on the last line. |
| `x` | 250 characters | One or two punchy sentences. Zero to two hashtags. |
| `bluesky` | About 200 characters (300 including the full link) | Like the X blurb. Hashtags optional. |
| `threads` | About 400 characters (500 including the full link) | Conversational, one to three sentences. Threads allows one topic tag per post, so use at most one hashtag. |
| `mastodon` | About 450 characters | Plain and informative. End with three to five hashtags, which matter for discovery on Mastodon. Write them in CamelCase (`#SelfHosting`) so screen readers pronounce them properly. |
| `facebook` | Keep it under 300 characters | One or two conversational sentences. |

Any network without a blurb falls back to the `description`.

## Writing the body

### Voice and hard rules

- Write as Keith: first person, conversational but technically precise, British English spelling
  (colour, organise, licence as a noun). The site's language is `en-GB`.
- Talk to the reader. Use "you" naturally, anticipate their questions and bring them along.
- Every post needs some humour, serious ones included: dry asides, self-deprecation, the absurdity
  of the situation. It must never rest on invented events, but a clearly hypothetical example can
  be played for laughs.
- **Never use an em dash** (the long dash, Unicode U+2014). Use a comma, a colon, parentheses or a
  new sentence instead. Don't use an en dash (U+2013) as a substitute either.
- **Never begin a sentence with "And".** Restructure the sentence.
- Don't invent facts: no made-up numbers, benchmarks, quotes, dates, version numbers or
  features. When writing about one of Keith's projects, read its entry in
  `src/data/projects/projects.yaml` and the project's own repository. If something is unknown, list
  it in your handover message to Keith rather than guessing.
- Don't leave notes for Keith inside the post, including HTML comments: comments are invisible on the
  page but published in its source.
- Skip filler: no "In today's fast-paced world", "Let's dive in", "In conclusion" or "Happy coding!".
- Typical length is 800 to 1,800 words. Reading time is calculated automatically.

### Structure

- Open with an introduction of two or three short paragraphs, with no heading before them. A hook
  or an example can come first, but by the end of the introduction the reader must know what the
  post is about, the question it answers and why it matters to them. Never assume they already
  know.
- Use `##` for sections and `###` for subsections. **Never use `#`** in the body: the title is
  already the page's only top-level heading. Don't skip levels (no `####` straight under `##`).
- Headings are sentence case and short (under about 50 characters). Two or more `##` headings
  produce a table of contents automatically, so headings double as navigation.
- Close with a real conclusion. Answer the question the introduction raised, pull the threads
  together and make it practical: how it works in practice, how to measure or check it, what to
  try next, or where to find the project or code. No moral or engagement question, but no abrupt
  stop either.

### Avoiding walls of text

The page is designed for a mix of elements. A post that is only paragraphs reads badly.

- Keep paragraphs to four sentences or fewer. One-sentence paragraphs are fine for emphasis.
- Every few paragraphs, ask whether something would explain it better than prose: a code block for
  anything the reader might type or copy, a list for steps or options, a table for comparisons, an
  image or screenshot for anything visual, a callout for a warning or tip.
- Use these where they genuinely help. Never add one purely as decoration.
- In a tutorial or reference post, aim for at least one non-paragraph element per `##` section. A
  story-led post needs fewer: one good code excerpt or screenshot can carry it, and short
  paragraphs keep it readable.

## Formatting reference

Everything below is supported and styled. Standard Markdown plus GitHub extensions.

### Text

```markdown
**Bold** for the few words that matter most. *Italic* for titles and gentle emphasis.
~~Strikethrough~~ for something superseded.
```

Use bold sparingly: a paragraph with three bold phrases has none.

### Links

```markdown
The code is on [GitHub](https://github.com/keithvassallomt/nc-media-provider).
See also [my other projects](/projects) and [DigiMem](/projects/digimem).
```

Link text must describe the destination. Never "click here" or a bare URL. Link to other pages on
the site with root-relative paths (`/projects`, `/blog/<slug>`), and only to pages that exist:
check `src/content/blog/` for post slugs and `src/data/projects/projects.yaml` for project ids.

### Inline code

```markdown
Subclass `CloudMediaProvider` and set `android:exported` to `true`.
```

Use for identifiers, file names, commands, flags, settings and values. Not for emphasis.

### Code blocks

````markdown
```kotlin title="NextcloudMediaProvider.kt"
override fun onQueryMedia(extras: Bundle): Cursor {
    return library.queryMedia(extras)
}
```

```bash
npm install
npm run build
```
````

- **Always name the language** (`kotlin`, `python`, `bash`, `ts`, `js`, `json`, `yaml`, `toml`,
  `xml`, `html`, `css`, `sql`, `diff`, and so on). It drives highlighting and the label in the
  block's header. Use `text` for output or anything that isn't code.
- Add `title="FileName.ext"` when the code belongs to a specific file. The header shows it.
- Shell commands go in `bash` blocks without a `$` prompt, so the copy button gives a runnable
  command.
- Keep blocks under about 30 lines. Trim to the part that matters and say what you left out.
- Every block gets a copy button automatically, and long lines scroll sideways.

### Lists

```markdown
- Unordered items for options or features
- Keep items parallel in grammar

1. Numbered items for steps in order
2. One action per step

- [x] Task lists for checklists
- [ ] Rendered as read-only checkboxes
```

Lists can nest by indenting two spaces.

### Quotations

```markdown
> If the picker ever feels slower than it does for local photos, nobody will use it.
```

Blockquotes render as an italic quotation with a green rule. Use them for quoting someone (name the
source in the text around it) or for one pull quote that sums up a section. At most one or two per
post.

### Callouts

```markdown
> [!NOTE]
> NC Media Provider is open source.

> [!TIP]
> Set a storage limit for the cache if your phone is short on space.
```

| Type | Use for |
| --- | --- |
| `[!NOTE]` | Useful context the reader might otherwise miss |
| `[!TIP]` | An optional shortcut or better way |
| `[!IMPORTANT]` | Something the reader must know to succeed |
| `[!WARNING]` | A likely mistake, or something that may break |
| `[!CAUTION]` | Data loss, security risk or something irreversible |

Write the marker exactly as shown, alone on the first line. Use one or two callouts per post at
most, or they stop standing out.

### Images

```markdown
![The Android photo picker showing photos from a Nextcloud library](./picker.avif "The system photo picker, showing a Nextcloud library")

![A terminal showing a successful build](./build-output.png)
```

- The text in `[...]` is the **alt text**, and it is required. Describe what the image shows for
  someone who can't see it. Don't start with "Image of".
- The quoted text after the path is an optional **caption**, shown under the image. An image on its
  own line with a caption becomes a captioned figure. The caption adds context. It does not repeat
  the alt text.
- Formats: AVIF, WebP, PNG or JPEG. PNG or AVIF for screenshots, JPEG or AVIF for photos. Keep each
  original under about 2 MB. Images are converted to responsive WebP automatically.
- Tall images such as phone screenshots are limited in height automatically, so you don't need to
  resize them.
- Only use images that exist in the post folder. Don't link images from other websites: they are not
  optimised and can disappear.

### Tables

```markdown
| Situation | What handles it |
| --- | --- |
| An app opens the system photo picker | The cloud media provider |
| An app ships its own gallery | The media keyboard |
```

Use tables for comparisons and reference data, not for layout. Keep them to about four columns.
Wide tables scroll sideways on phones.

### Footnotes

```markdown
A sentence that needs a source or an aside.[^source]

[^source]: The source or the side detail goes here.
```

Footnotes are collected at the end of the post with links back. Use them for sources and asides
that would interrupt the flow.

### Keyboard keys and highlights

```markdown
Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>. The <mark>highlighted</mark> setting is the one to change.
```

`<kbd>` and `<mark>` are the only HTML tags to use. Write everything else in Markdown.

### Horizontal rules

`---` on its own line draws a divider. Use it rarely, for a real change of topic within a section.

### Not supported

- `#` headings in the body.
- MDX or components, `<iframe>` embeds, YouTube or video embeds. Link to the video instead.
- Raw HTML beyond `<kbd>` and `<mark>`.
- Images from external URLs.
- Emoji in headings.

## What happens automatically

Don't do any of these by hand:

- Listing the post on `/blog`, its category page and its tag pages, with pagination.
- Reading time, table of contents, heading anchors and "Keep reading" suggestions.
- Code highlighting, code-block headers and copy buttons.
- Image conversion, responsive sizes and lazy loading.
- The social preview card (`/og/...png`), Open Graph and X metadata, and `BlogPosting` structured
  data.
- The RSS feed (`/blog/rss.xml`) and the sitemap.

## Check your work

Run these from the repository root:

```bash
npm run check
BLOG_DRAFTS=true npm run build
```

Both must finish without errors. The build stops with a clear message if `coverAlt` is missing,
the category doesn't exist, a date is invalid or a share blurb is too long. To see the post,
run `npm run dev` and open `http://localhost:4321/blog/<slug>`. Drafts are visible in dev, marked as
drafts.

Then review the file:

```bash
grep -nP '\x{2014}|\x{2013}' src/content/blog/<slug>/index.md   # em or en dashes: must print nothing
grep -nE '(^|[.!?] )And ' src/content/blog/<slug>/index.md      # must print nothing
```

- [ ] `draft: true` is still set.
- [ ] Every image has alt text, and every image file is in the post folder.
- [ ] Every code block names its language.
- [ ] The description is 160 characters or fewer and stands on its own.
- [ ] Headings start at `##` and are sentence case.
- [ ] No section is only paragraphs where a list, code block, table or image would explain better.
- [ ] Nothing is invented, and anything uncertain is listed for Keith.

## Publishing and editing (for Keith)

- **Publish:** delete `draft: true`, check `pubDate`, commit and push to `main`. CodeBuild deploys
  the site, and the index, feed, sitemap and social card update on their own.
- **Edit a published post:** change the file and set `updatedDate` if the change is substantive.
  The social card gets a new URL automatically when the title changes.
- **Rename a published post:** rename the folder and add the old path to `redirectFrom`.
