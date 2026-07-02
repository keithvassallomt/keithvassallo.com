# Project Deep-Links — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)

## Goal

Give every project a real, shareable URL — `keithvassallo.com/projects/<id>` — that loads
the Projects gallery with that project's card already expanded (the "right panel" view).
Expanding/collapsing cards on `/projects` keeps the address bar in sync so any card view is
shareable and Back/Forward navigate between cards.

## Decisions (locked)

1. **Namespaced URLs:** `/projects/<id>` (not bare `/id`). No collision risk with top-level routes.
2. **Two-way history sync (Approach A):** keep the current instant CSS expand animation; drive the
   URL with `history.pushState`. Direct hits / no-JS / social scrapers get a server-pre-expanded
   static page.
3. **Per-project SEO (B2):** each page sets its own `<title>`, `description`, and a per-project
   Open Graph image. `BaseLayout` already accepts `title` / `description` / `image` props and wires
   OG + Twitter + canonical — no layout changes needed.

## Deployment compatibility

No pipeline/infra changes. Astro static build already emits extensionless clean URLs that CloudFront
serves today (e.g. `/cv` → `dist/cv/index.html`). The new dynamic route builds
`dist/projects/<id>/index.html`, resolved by the exact same mechanism. Unknown ids 404 through the
existing S3 error page (only ids present in `getStaticPaths()` are generated).

## Architecture

### 1. Extract `src/components/ProjectsGallery.astro`

Move the entire projects UI out of `src/pages/projects/index.astro` into a reusable component so
both the index page and the deep-link page share one implementation (no duplication of the ~400-line
gallery + script + styles).

- **Props:** `{ expandId?: string }`.
- **Owns:** YAML load, `app-layout` (`NavRail` + `main` header + `floating-container` with
  `ProjectTile`s + `BottomNav`), the client `<script>`, and the `<style>` block — everything
  currently in `projects/index.astro` lines 16–417.
- **Pre-expand:** when `expandId` matches a project, that `ProjectTile` renders with the `expanded`
  class, the backdrop renders with `visible`, and the container renders with `has-expanded` — so the
  panel is visible server-side with **no flash** of the collapsed grid.

### 2. `ProjectTile.astro` — add `expanded` prop

Add an optional `expanded?: boolean` prop; when true, include `expanded` in the `<article>`'s class
list. Everything else unchanged.

### 3. Pages become thin wrappers

- `src/pages/projects/index.astro`:
  ```astro
  <BaseLayout title="Projects" description="Things I've designed & built">
    <ProjectsGallery />
  </BaseLayout>
  ```
- `src/pages/projects/[id].astro` (new):
  ```astro
  export async function getStaticPaths() { /* one entry per project id from projects.yaml */ }
  // props: the project object
  <BaseLayout
    title={project.title}
    description={project.shortDescription}
    image={`/assets/og/${project.id}.jpg`}>
    <ProjectsGallery expandId={project.id} />
  </BaseLayout>
  ```

### 4. Shared data loader

Both `index.astro`/`[id].astro` and `ProjectsGallery.astro` need the project list. Extract a tiny
build-time loader (`src/lib/projects.ts`) exposing `loadProjects()` so the YAML read + shape live in
one place. (`cv.astro` keeps its own inline loading; out of scope.)

## Client-side history (Approach A)

Additions to the gallery's existing script:

- **On user expand** (`expandCard` triggered by click): `history.pushState({ projectId: id }, '', \
  '/projects/' + id)`.
- **On user collapse** (close button / backdrop / Escape): `history.pushState({}, '', '/projects')`.
- **`popstate` handler:** read `location.pathname`; if it matches `/projects/<id>` for a known card,
  expand that card *without* pushing state; otherwise collapse all *without* pushing state. Expand/
  collapse helpers take a `pushHistory = true` flag so popstate-driven changes don't re-push.

### Integration risk — ClientRouter coexistence (must verify during build)

The site uses Astro's `ClientRouter` (view transitions), which has its own `popstate` handling.
Because each `/projects/<id>` page is independently rendered in the correct state, **the end state is
correct even if ClientRouter swaps pages on Back/Forward** — worst case is an extra fetch/swap or a
hard reload, not a broken view.

- **Verification step (in the implementation plan):** a spike that manually tests Back/Forward
  between `/projects` and `/projects/<id>` with ClientRouter active, checking for (a) hard reloads,
  (b) double-handling flicker, (c) correct card state.
- **Fallback if it conflicts:** either register our `popstate` handler to run first and
  `stopImmediatePropagation()`, or accept ClientRouter-driven swaps (the pre-rendered pages already
  produce the right state). We will *not* fall back to Approach B (router-navigation-per-expand)
  without checking back with Keith, since it changes the expand feel.

## Per-project OG images

**Constraint:** on-page images are AVIF (many link scrapers don't render AVIF), and source PNGs are
deleted by `optimize-images.sh`, which also *scans and deletes* any `*.png/jpg` under
`public/assets/projects/`. So OG images must live **outside** that directory to avoid being clobbered.

**Design:**
- New script `scripts/generate-og-images.sh`: for each project in `projects.yaml`, read its
  `bgImage` (fallback `logo`) AVIF with ImageMagick and write `public/assets/og/<id>.jpg`, sized
  1200×630 (resize-to-cover + center-crop), quality ~82. Keyed by **project id** (decoupled from the
  mismatched asset dir names). Projects with neither `bgImage` nor `logo` fall back to the site
  default `image` (omit the per-project `image` prop → BaseLayout default `og-image.png`).
- Output is committed to the repo like the AVIF assets are; **no buildspec change** — real visitors
  never fetch OG images, so **zero page-load impact**.
- `optimize-images.sh` is untouched (it only scans `public/assets/projects/`, not `public/assets/og/`).
- Run the script once as part of this change to generate the initial set.

## Also in scope (tidy)

- `package.json`: rename `temp-astro` → `keithvassallo.com`, version → `1.0.0`, add `"private": true`.
  *(already applied)*

## Out of scope (YAGNI)

- Bare top-level `/<id>` URLs.
- Regenerating OG images in CI.
- Refactoring `cv.astro` data loading.
- Shared-element view-transition morph between card and panel.

## Testing / verification

- **Build:** `npm run build` produces `dist/projects/<id>/index.html` for all 13 ids.
- **Direct hit:** loading `/projects/touchshell` shows the expanded panel with no collapsed-grid flash.
- **Two-way sync:** expanding a card on `/projects` updates the URL to `/projects/<id>`; closing
  returns to `/projects`; Back/Forward move between states (per the verification spike).
- **No-JS:** with JS disabled, `/projects/<id>` still shows the expanded project (server-rendered).
- **Meta:** each page's `<title>`/`description`/`og:image`/canonical reflect the project; OG image is
  a real JPG that renders in a scraper (spot-check with a preview tool).
- **Regression:** `/projects` behaves exactly as before; `optimize-images.sh --dry-run` reports no OG
  files as candidates.
</content>
