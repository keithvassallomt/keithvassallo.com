# keithvassallo.com

My personal website built with [Astro](https://astro.build).

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Blog

Each post is a folder: `src/content/blog/<slug>/index.md`, with its images alongside it. The folder
name becomes the permanent URL, `/blog/<slug>`. Adding a post updates the blog index, category and
tag pages, the RSS feed (`/blog/rss.xml`), the sitemap, structured data and social previews on the
next build. No template changes needed.

```markdown
---
title: Putting Nextcloud inside Android's photo picker
description: One or two sentences. Used for listings, the feed, search results and social previews.
pubDate: 2026-10-23
category: android            # an id from src/data/blog/categories.yaml
tags: [Kotlin, Nextcloud]
cover: ./cover.jpg           # optional, needs coverAlt
coverAlt: Describe the image
draft: true                  # remove to publish
---
```

Optional fields, each falling back to the fields above:

| Field | Purpose |
| --- | --- |
| `updatedDate` | Set after a substantive edit. Drives `article:modified_time`, `dateModified` and the sitemap. |
| `metaTitle`, `metaDescription` | Override the title and description used in `<head>` and social previews. |
| `socialImage`, `socialImageAlt` | Use your own image for social previews instead of the generated card. Cropped to 1200x630 JPEG. |
| `canonicalURL` | Point the canonical URL elsewhere, for posts first published on another site. |
| `redirectFrom` | Old paths (such as `/blog/old-slug`) that should redirect here after renaming the folder. Served as 301s by CloudFront. |
| `share` | Suggested post text per network: `linkedin`, `x`, `bluesky`, `mastodon`, `facebook`. X, Bluesky and Mastodon open prefilled; LinkedIn and Facebook get it copied to the clipboard. The build fails if one is too long for its network. |

**Writing.** Start sections at `##` (the title is the page's only `#`). Beyond standard Markdown and
GitHub tables:

- Code blocks get a header and copy button. Name the file with ` ```kotlin title="Main.kt" `.
- Callouts: a blockquote starting with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`.
- Captions: an image on its own line with a title, `![alt text](./shot.png "Caption")`.

**Drafts** (`draft: true`) appear in `npm run dev` and in preview builds made with
`BLOG_DRAFTS=true npm run build`, always marked `noindex`. A normal build leaves them out entirely,
along with the feed and sitemap.

**Social previews.** Every post gets a branded 1200x630 PNG card under `/og/`, generated at build time
by `src/lib/og-card.ts`. File names include a hash of their content, so a changed title or image gets
a new URL and social networks fetch it fresh. After changing the card design, bump
`CARD_TEMPLATE_VERSION` in `src/lib/social.ts`.

**Categories** live in `src/data/blog/categories.yaml`. Categories without published posts are hidden.

## Deployment

Deployed via AWS CodePipeline to S3/CloudFront. Pushes to `main` trigger automatic builds.