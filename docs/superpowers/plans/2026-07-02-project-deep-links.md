# Project Deep-Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project a shareable `/projects/<id>` URL that loads the gallery with that project's card pre-expanded, with two-way URL sync when expanding/closing cards on `/projects`.

**Architecture:** Extract the projects gallery into a reusable `ProjectsGallery.astro` component driven by an optional `expandId` prop. A dynamic `[id].astro` route pre-renders one static page per project with the target card server-expanded (no-flash, no-JS-safe) and per-project SEO/OG meta. Client JS keeps the URL in sync via `history.pushState`/`popstate`. Per-project OG images are pre-generated JPGs stored outside the AVIF pipeline.

**Tech Stack:** Astro 6 (static output, `ClientRouter` view transitions), TypeScript, js-yaml, ffmpeg (OG image generation), bash.

## Global Constraints

- Astro static output only (`output: 'static'`); no SSR. Every project page is generated at build via `getStaticPaths()`.
- URL scheme is namespaced: `/projects/<id>` (never bare `/<id>`).
- `trailingSlash: 'never'` — do not emit or link trailing-slash URLs.
- Keep the existing instant CSS expand animation (Approach A); do NOT convert expand into a router navigation.
- OG images MUST live under `public/assets/og/` (outside `public/assets/projects/`) so `scripts/optimize-images.sh` never scans/deletes them.
- No test runner exists in this repo; verification is via `npm run build`, `npm run preview`/`dev`, and browser inspection. Do not add a test framework.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Work happens on branch `feature/project-deep-links` (already checked out).

---

## File Structure

- Create: `src/lib/projects.ts` — single build-time loader + types for project data.
- Create: `src/components/ProjectsGallery.astro` — the entire projects UI (nav, header, floating cards, client script, styles), parametrized by `expandId?`.
- Modify: `src/pages/projects/index.astro` — becomes a thin `BaseLayout` + `ProjectsGallery` wrapper.
- Create: `src/pages/projects/[id].astro` — dynamic route: `getStaticPaths()` + per-project meta + `<ProjectsGallery expandId={id} />`.
- Modify: `src/components/ProjectTile.astro` — add `expanded?: boolean` prop.
- Create: `scripts/generate-og-images.sh` — generate `public/assets/og/<id>.jpg` from each project's bgImage/logo AVIF via ffmpeg.
- Create: `public/assets/og/*.jpg` — 13 generated OG images (committed).

---

## Task 1: Extract ProjectsGallery component + shared data loader

Pure refactor. `/projects` must look and behave exactly as before. This isolates the ~360-line gallery so the deep-link route can reuse it.

**Files:**
- Create: `src/lib/projects.ts`
- Create: `src/components/ProjectsGallery.astro`
- Modify: `src/pages/projects/index.astro`

**Interfaces:**
- Produces: `loadProjects(): Project[]` and the `Project` / `ProjectMedia` types from `src/lib/projects.ts`.
- Produces: `ProjectsGallery` component accepting `{ expandId?: string }` (the `expandId` handling is added in Task 3; in this task it is declared but unused).

- [ ] **Step 1: Create the data loader `src/lib/projects.ts`**

```ts
import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

export interface ProjectMedia {
  type: 'video' | 'image';
  src: string;
  label?: string;
}

export interface Project {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  logo: string | null;
  bgImage?: string | null;
  media: ProjectMedia[];
  technologies: string[];
  link?: string | null;
  repo?: string | null;
  featured?: boolean;
}

export function loadProjects(): Project[] {
  const projectsPath = path.join(process.cwd(), 'src/data/projects/projects.yaml');
  const data = yaml.load(fs.readFileSync(projectsPath, 'utf8')) as { projects: Project[] };
  return data.projects;
}
```

- [ ] **Step 2: Create `src/components/ProjectsGallery.astro`**

Move the gallery UI out of `src/pages/projects/index.astro` verbatim. Concretely:

1. Frontmatter (replace the file-read logic with the shared loader):

```astro
---
import NavRail from './NavRail.astro';
import BottomNav from './BottomNav.astro';
import ProjectTile from './ProjectTile.astro';
import { loadProjects } from '../lib/projects';

interface Props {
  expandId?: string;
}

const { expandId } = Astro.props;
const projects = loadProjects();
---
```

2. Body: **cut** the markup from `src/pages/projects/index.astro` lines 17–51 (the `<div class="app-layout"> … </div>` block, i.e. `NavRail`, `main`, floating container with the `projects.map(...)` `ProjectTile` loop, and `BottomNav`) and paste it here verbatim. Leave the `ProjectTile` props exactly as they are (Task 3 adds the `expanded` prop).

3. **Cut** the entire `<script> … </script>` block (index.astro lines 54–327) and paste it verbatim after the markup.

4. **Cut** the entire `<style> … </style>` block (index.astro lines 329–417) and paste it verbatim after the script.

- [ ] **Step 3: Replace `src/pages/projects/index.astro` with a thin wrapper**

Full new file contents:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ProjectsGallery from '../../components/ProjectsGallery.astro';
---

<BaseLayout title="Projects" description="Things I've designed & built — projects by Keith Vassallo">
  <ProjectsGallery />
</BaseLayout>
```

- [ ] **Step 4: Build and verify no regression**

Run: `npm run build`
Expected: build succeeds; `dist/projects/index.html` exists and contains all 13 project titles (e.g. `grep -c 'card-title' dist/projects/index.html` → 13).

- [ ] **Step 5: Visual smoke test**

Run: `npm run preview` and open `http://localhost:4321/projects`.
Expected: gallery renders identically to before — cards tilt on hover, click expands a card with backdrop, carousel + videos work, Escape/backdrop/close collapse it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects.ts src/components/ProjectsGallery.astro src/pages/projects/index.astro
git commit -m "Refactor projects gallery into reusable ProjectsGallery component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Generate per-project OG images

Standalone script + committed assets. Independent of the Astro changes.

**Files:**
- Create: `scripts/generate-og-images.sh`
- Create: `public/assets/og/*.jpg` (13 files)

**Interfaces:**
- Produces: `public/assets/og/<project-id>.jpg` for every project id — consumed by Task 3's `image` prop.

- [ ] **Step 1: Create `scripts/generate-og-images.sh`**

```bash
#!/usr/bin/env bash
#
# Generates 1200x630 JPEG Open Graph images for each project, one per project id,
# from the project's bgImage (fallback: logo) AVIF.
#
# Output: public/assets/og/<project-id>.jpg  — deliberately OUTSIDE
# public/assets/projects/ so scripts/optimize-images.sh never scans or deletes
# these JPEGs. Keyed by project id (decoupled from the mismatched asset dir names,
# e.g. id "webfruitos" lives under .../wfos/).
#
# OG images are only fetched by social/link scrapers, never by page visitors, so
# they add zero page-load weight. Output is committed like the AVIF assets.
#
# Usage:
#   scripts/generate-og-images.sh
#   scripts/generate-og-images.sh --dry-run
#
# Requires: ffmpeg (decodes AVIF, scales, center-crops, and encodes JPEG in one pass)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YAML="$ROOT_DIR/src/data/projects/projects.yaml"
OUT_DIR="$ROOT_DIR/public/assets/og"
PUBLIC_DIR="$ROOT_DIR/public"

OG_W=1200
OG_H=630
JPEG_Q=3   # ffmpeg -q:v scale 2-5 is high quality

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

command -v ffmpeg >/dev/null || { echo "ffmpeg not found in PATH" >&2; exit 1; }

mkdir -p "$OUT_DIR"

# Emit "<id>\t<web-path>" per project, preferring bgImage, falling back to logo.
records="$(awk '
  /^  - id:/      { if (id != "") print id "\t" (bg != "" ? bg : lg); id=$3; bg=""; lg="" }
  /^    bgImage:/ { bg=$2 }
  /^    logo:/    { lg=$2 }
  END             { if (id != "") print id "\t" (bg != "" ? bg : lg) }
' "$YAML")"

count=0
while IFS=$'\t' read -r id webpath; do
  [[ -z "$id" ]] && continue
  if [[ -z "$webpath" ]]; then
    echo "skip (no bgImage/logo): $id"
    continue
  fi
  src="$PUBLIC_DIR${webpath}"
  out="$OUT_DIR/${id}.jpg"
  if [[ ! -f "$src" ]]; then
    echo "WARN: source missing for $id: $src" >&2
    continue
  fi
  echo "==> $id  ($webpath -> assets/og/${id}.jpg)"
  if (( DRY_RUN )); then
    continue
  fi
  ffmpeg -y -loglevel error -i "$src" \
    -vf "scale=${OG_W}:${OG_H}:force_original_aspect_ratio=increase,crop=${OG_W}:${OG_H}" \
    -q:v "$JPEG_Q" "$out"
  count=$((count + 1))
done <<< "$records"

echo
echo "done. generated $count OG image(s) in $OUT_DIR"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/generate-og-images.sh`

- [ ] **Step 3: Dry-run to confirm every project maps to a source**

Run: `scripts/generate-og-images.sh --dry-run`
Expected: 13 `==>` lines (touchshell, openclaw-nextcloud, odrive-linux, loft, friendlyhub, friendlymanifesto, icloudbridge, clustercut, spelling_mt, statustray, webfruitos, wordleech, mtdict); no `skip`/`WARN` lines.

- [ ] **Step 4: Generate the images**

Run: `scripts/generate-og-images.sh`
Expected: `done. generated 13 OG image(s)`. Verify: `ls public/assets/og/ | wc -l` → 13, and `identify public/assets/og/touchshell.jpg` (or `magick identify`) → `JPEG 1200x630`.

- [ ] **Step 5: Confirm optimize-images.sh ignores them**

Run: `scripts/optimize-images.sh --dry-run`
Expected: `no source images (.png / .jpg / .jpeg) found under .../public/assets/projects — nothing to do` (the new JPEGs are under `public/assets/og/`, out of scope). If `optimize-images.sh` errors on a missing `avifenc`, that is expected on this machine and unrelated; the point is it lists zero `public/assets/og` files.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-og-images.sh public/assets/og
git commit -m "Add per-project OG image generator and generated images

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Deep-link route with server-side pre-expand + per-project meta

Adds the `/projects/<id>` pages. Visiting one shows the expanded panel with no flash, works without JS, and carries per-project SEO/OG.

**Files:**
- Modify: `src/components/ProjectTile.astro`
- Modify: `src/components/ProjectsGallery.astro`
- Create: `src/pages/projects/[id].astro`

**Interfaces:**
- Consumes: `loadProjects()` / `Project` from `src/lib/projects.ts` (Task 1); `public/assets/og/<id>.jpg` (Task 2).
- Consumes: `ProjectsGallery` `{ expandId?: string }` (Task 1).
- Produces: static pages at `/projects/<id>` for all 13 ids.

- [ ] **Step 1: Add `expanded` prop to `ProjectTile.astro`**

In the `interface Props` (ProjectTile.astro lines 10–22), add:

```ts
  expanded?: boolean;
```

In the destructure (line 24), add `expanded = false`:

```ts
const { id, title, shortDescription, description, logo, bgImage, media, technologies, link, repo, index, expanded = false } = Astro.props;
```

Change the opening `<article>` (lines 35–39) to include the class conditionally:

```astro
<article
  class:list={["floating-card", { expanded }]}
  data-project-id={id}
  style={`--accent: ${accentColor};`}
>
```

- [ ] **Step 2: Wire `expandId` through `ProjectsGallery.astro`**

In the `ProjectTile` loop (moved into ProjectsGallery in Task 1), add the `expanded` prop:

```astro
<ProjectTile
  id={project.id}
  title={project.title}
  shortDescription={project.shortDescription}
  description={project.description}
  logo={project.logo}
  bgImage={project.bgImage}
  media={project.media}
  technologies={project.technologies}
  link={project.link}
  repo={project.repo}
  index={index}
  expanded={project.id === expandId}
/>
```

On the backdrop div, make it start visible when a card is pre-expanded. Change `<div class="card-backdrop" id="card-backdrop"></div>` to:

```astro
<div class:list={["card-backdrop", { visible: !!expandId }]} id="card-backdrop"></div>
```

On the floating container div, add `has-expanded` when pre-expanding. Change `<div class="floating-container" id="floating-container">` to:

```astro
<div class:list={["floating-container", { "has-expanded": !!expandId }]} id="floating-container">
```

- [ ] **Step 3: Finish the server-rendered expand on init (client script)**

In the moved `<script>` inside `ProjectsGallery.astro`, locate the end of `initFloatingCards()` — the point after the `cards.forEach(... initCarousel(card))` wiring and before the hover-listener setup is fine, but simplest is to add this block just before the final closing `}` of `initFloatingCards`, after all helper functions are defined (they are hoisted function declarations, so ordering is safe). Add:

```ts
    // If the server rendered a card pre-expanded (deep-link /projects/<id>),
    // finish the parts the CSS class alone can't do: lock scroll, hydrate and
    // play its videos. The expanded/backdrop/has-expanded classes are already
    // present from SSR, so there is no collapse-then-expand flash.
    const preExpanded = cardsWrapper.querySelector('.floating-card.expanded');
    if (preExpanded) {
      document.body.style.overflow = 'hidden';
      hydrateVideos(preExpanded);
      playActiveVideos(preExpanded);
    }
```

- [ ] **Step 4: Create `src/pages/projects/[id].astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ProjectsGallery from '../../components/ProjectsGallery.astro';
import { loadProjects } from '../../lib/projects';

export function getStaticPaths() {
  return loadProjects().map((project) => ({
    params: { id: project.id },
    props: { project },
  }));
}

const { project } = Astro.props;
---

<BaseLayout
  title={project.title}
  description={project.shortDescription}
  image={`/assets/og/${project.id}.jpg`}
>
  <ProjectsGallery expandId={project.id} />
</BaseLayout>
```

- [ ] **Step 5: Build and verify per-id pages exist**

Run: `npm run build`
Expected: `dist/projects/touchshell/index.html` … `dist/projects/mtdict/index.html` all exist (`ls dist/projects | wc -l` → 14 = 13 projects + `index.html`).

- [ ] **Step 6: Verify server-side pre-expand + meta (no JS needed)**

Run: `grep -o 'floating-card expanded' dist/projects/touchshell/index.html | head -1`
Expected: matches `floating-card expanded` (the target card is expanded in the static HTML).

Run: `grep -E '<title>|og:image|og:description' dist/projects/touchshell/index.html`
Expected: title contains `Touchshell | Keith Vassallo`; `og:image` ends `/assets/og/touchshell.jpg`; `og:description` is Touchshell's shortDescription.

- [ ] **Step 7: Browser check — no flash, panel shown**

Run: `npm run preview`, open `http://localhost:4321/projects/loft`.
Expected: the Loft card is expanded immediately (no visible collapsed-grid flash), backdrop dimmed, its media carousel/video active, Escape/close collapses it. Then open `http://localhost:4321/projects` and confirm it still loads collapsed.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProjectTile.astro src/components/ProjectsGallery.astro src/pages/projects/[id].astro
git commit -m "Add /projects/<id> deep-link route with pre-expanded card and per-project meta

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Two-way URL sync (pushState / popstate)

Expanding a card on `/projects` updates the address bar to `/projects/<id>`; closing returns to `/projects`; Back/Forward navigate between states. Must coexist with Astro's `ClientRouter`.

**Files:**
- Modify: `src/components/ProjectsGallery.astro` (client `<script>` only)

**Interfaces:**
- Consumes: existing `expandCard(card)` / `collapseCard(card)` functions and `cardsWrapper`, `backdrop` locals in the gallery script.

- [ ] **Step 1: Add a `pushHistory` parameter to `expandCard`**

Change the `expandCard` signature and append a `pushState` at the end. The function currently starts `function expandCard(card: Element) {`. Change to:

```ts
    function expandCard(card: Element, pushHistory = true) {
```

At the very end of `expandCard` (after `playActiveVideos(card);`), add:

```ts
      if (pushHistory) {
        const id = card.getAttribute('data-project-id');
        if (id) history.pushState({ projectId: id }, '', `/projects/${id}`);
      }
```

Also, inside `expandCard`, the existing loop that collapses any other open card must NOT push history (otherwise switching directly from card A to card B creates a spurious `/projects` entry). Change the existing call `collapseCard(c);` (in the `cards.forEach(c => { if (c !== card && c.classList.contains('expanded')) { … } })` block near the top of `expandCard`) to:

```ts
          collapseCard(c, false);
```

- [ ] **Step 2: Add a `pushHistory` parameter to `collapseCard`**

Change `function collapseCard(card: Element) {` to:

```ts
    function collapseCard(card: Element, pushHistory = true) {
```

Inside the existing `if (!anyExpanded) { … }` block (which runs only when no cards remain expanded), after the existing body, add the history update so we only return to `/projects` once everything is closed:

```ts
        if (pushHistory) {
          history.pushState({}, '', '/projects');
        }
```

- [ ] **Step 3: Add a capture-phase `popstate` handler**

Immediately after the `initFloatingCards` function definition body starts wiring (place this near the other top-level listeners in the script, e.g. just after the `document.addEventListener('keydown', …)` Escape handler block, so `cards`, `cardsWrapper`, `expandCard`, `collapseCard` are all in scope), add:

```ts
    // Keep card state in sync with Back/Forward. Registered in the capture phase
    // and stops propagation for our own /projects[/id] transitions so Astro's
    // ClientRouter does not also try to swap the page for an in-page state change.
    window.addEventListener('popstate', (e) => {
      const match = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
      const targetId = match ? match[1] : null;
      const target = targetId
        ? cardsWrapper.querySelector(`.floating-card[data-project-id="${targetId}"]`)
        : null;

      // Only handle transitions that stay within this gallery: either the base
      // /projects page, or /projects/<id> for a card that exists here.
      const isInternal = location.pathname === '/projects' || !!target;
      if (!isInternal) return; // let ClientRouter handle navigation elsewhere

      e.stopImmediatePropagation();

      const currentlyExpanded = cardsWrapper.querySelector('.floating-card.expanded');
      const currentId = currentlyExpanded?.getAttribute('data-project-id') ?? null;
      if (currentId === targetId) return;

      if (currentlyExpanded) collapseCard(currentlyExpanded, false);
      if (target) expandCard(target, false);
    }, true);
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Verify two-way sync in the browser**

Run: `npm run dev` (dev has `ClientRouter` active, like production) and open `http://localhost:4321/projects`.
Perform and confirm each:
1. Click the Touchshell card → address bar becomes `/projects/touchshell`; panel expands with the CSS animation (no page reload/flash).
2. Press browser Back → returns to `/projects`, card collapses, no hard reload.
3. Press browser Forward → `/projects/touchshell`, card expands again.
4. Close the card (X/backdrop/Escape) → address bar returns to `/projects`.
5. With a card open, copy the URL, open it in a new tab → loads with that card pre-expanded (Task 3 path).
6. Navigate `/projects` → click NavRail to `/cv` → Back: confirm normal ClientRouter navigation still works (this exercises the `!isInternal` branch).

If step 2 or 3 causes a full-page reload or a visible double-render, capture the console and history state and report it — the fallback (documented in the design spec's "Integration risk") is to adjust listener ordering; do not silently leave a broken Back button.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectsGallery.astro
git commit -m "Sync /projects/<id> URL with card expand/collapse via pushState

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Namespaced `/projects/<id>` route → Task 3. ✓
- Deployment compatibility (static `getStaticPaths`) → Task 3 Step 4/5. ✓
- `ProjectsGallery` extraction + shared loader → Task 1. ✓
- `ProjectTile` `expanded` prop → Task 3 Step 1. ✓
- Server-side pre-expand, no flash, no-JS → Task 3 Steps 2–3, 6–7. ✓
- Per-project title/description/OG image via BaseLayout props → Task 3 Step 4, verified Step 6. ✓
- Two-way history sync (Approach A) + ClientRouter coexistence + verification → Task 4. ✓
- OG images outside `optimize-images.sh` scope, keyed by id, ffmpeg-generated, committed → Task 2. ✓
- package.json tidy → already applied (committed on branch). ✓
- Out-of-scope items (bare URLs, CI OG regen, cv.astro refactor, shared-element morph) → not present. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code shown in full; verbatim moves specify exact source line ranges. ✓

**Type consistency:** `loadProjects()`/`Project`/`ProjectMedia` defined in Task 1 and consumed in Tasks 1/3. `expandId` prop name consistent across `ProjectsGallery` (Task 1 declares, Task 3 uses). `expanded` prop consistent on `ProjectTile` (Task 3). `expandCard(card, pushHistory)`/`collapseCard(card, pushHistory)` signatures consistent in Task 4. `data-project-id` attribute name matches existing `ProjectTile.astro`. ✓
</content>
