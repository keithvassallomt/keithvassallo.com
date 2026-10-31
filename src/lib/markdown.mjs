// Markdown extensions for blog posts, wired up in astro.config.mjs.
// The hast plugins use Sätteri's visitor API (Astro's default Markdown processor);
// codeBlockChrome is a Shiki transformer.

import { renderMermaidSVG } from 'beautiful-mermaid';

const element = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });
const isBlank = (node) => node.type === 'text' && !node.value.trim();
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wraps tables in a focusable region so wide tables scroll sideways instead of the page. */
export const scrollableTables = {
  name: 'blog-scrollable-tables',
  element: {
    filter: ['table'],
    visit(node, ctx) {
      ctx.wrapNode(node, { raw: '<div class="table-scroll" tabindex="0" role="region" aria-label="Table, scrolls sideways"></div>' });
    },
  },
};

/** Turns an image on its own line with a title, ![alt](src "Caption"), into a figure with a caption. */
export const figures = {
  name: 'blog-figures',
  element: {
    filter: ['p'],
    visit(node, ctx) {
      const content = node.children.filter((child) => !isBlank(child));
      const [image] = content;
      if (content.length !== 1 || image.type !== 'element' || image.tagName !== 'img') return;
      const caption = image.properties?.title;
      if (!caption) return;
      ctx.replaceNode(node, element('figure', {}, [image, element('figcaption', {}, [text(String(caption))])]));
    },
  },
};

const CALLOUTS = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/**
 * GitHub-style callouts: a blockquote starting with [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or
 * [!CAUTION]. [!KEITH] is a gap the AI left for Keith (src/lib/post-checks.mjs), titled with its
 * label so the admin's preview shows what's missing. Publishing refuses a post with one left.
 */
export const callouts = {
  name: 'blog-callouts',
  element: {
    filter: ['blockquote'],
    visit(node, ctx) {
      const firstIndex = node.children.findIndex((child) => child.type === 'element');
      const first = node.children[firstIndex];
      if (!first || first.tagName !== 'p') return;
      const lead = first.children[0];
      if (!lead || lead.type !== 'text') return;
      const match = /^\s*\[!(note|tip|important|warning|caution|keith)\][ \t]*/i.exec(lead.value);
      if (!match) return;

      const kind = match[1].toLowerCase();
      let remainder = lead.value.slice(match[0].length);
      let title = CALLOUTS[kind];
      if (kind === 'keith') {
        // The rest of the marker's line is the gap's label
        const [label, ...rest] = remainder.split('\n');
        title = `For you: ${label.trim() || 'your words'}`;
        remainder = rest.join('\n');
      } else {
        remainder = remainder.replace(/^\s+/, '');
      }
      const leadChildren = [...(remainder ? [text(remainder)] : []), ...first.children.slice(1)];
      const body = node.children.flatMap((child, index) => {
        if (index !== firstIndex) return [child];
        return leadChildren.some((part) => !isBlank(part)) ? [element('p', {}, leadChildren)] : [];
      });

      ctx.replaceNode(
        node,
        element('aside', { className: ['callout', `callout-${kind}`] }, [
          element('p', { className: ['callout-title'] }, [text(title)]),
          ...body,
        ]),
      );
    },
  },
};

// The blog's tokens (BlogShell.astro), so diagrams follow the site's colours
const DIAGRAM_COLOURS = {
  bg: 'var(--blog-surface)',
  fg: 'var(--blog-text)',
  line: 'var(--blog-muted)',
  accent: 'var(--c-green)',
  muted: 'var(--blog-secondary)',
  surface: 'var(--blog-raised)',
  border: 'var(--blog-border)',
};

/** A Mermaid diagram as an SVG in the site's colours and fonts. Throws if the source doesn't parse. */
export function diagramSvg(source) {
  const svg = renderMermaidSVG(source, { ...DIAGRAM_COLOURS, transparent: true });
  // The renderer's stylesheet imports fonts from Google and styles every svg and text element on
  // the page. Keep it to diagrams, in the site's own fonts.
  return svg.replace(/<style>[\s\S]*?<\/style>/, (style) =>
    style
      .replace(/^\s*@import .*\n/gm, '')
      .replace(/\btext \{[^}]*\}/, '.diagram text { font-family: var(--font-reading); }')
      .replace(/\.mono \{[^}]*\}/, '.diagram .mono { font-family: var(--font-mono); }')
      .replace(/\bsvg \{/, '.diagram svg {'),
  );
}

/**
 * Draws ```mermaid blocks as SVG diagrams at build time (Shiki skips them: see `excludeLangs`
 * in astro.config.mjs). `strict` fails on a diagram that doesn't parse, as the build should;
 * otherwise the error shows in its place, which suits the admin's live preview.
 */
export const diagrams = ({ strict = true } = {}) => ({
  name: 'blog-diagrams',
  element: {
    filter: ['pre'],
    visit(node, ctx) {
      const code = node.children.find((child) => child.type === 'element' && child.tagName === 'code');
      const langClass = [code?.properties?.className ?? []].flat().find((name) => String(name).startsWith('language-'));
      if ((code?.data?.lang ?? langClass?.slice('language-'.length)) !== 'mermaid') return;

      const source = ctx.textContent(code);
      let svg;
      try {
        svg = diagramSvg(source);
      } catch (error) {
        if (strict) throw new Error(`A Mermaid diagram doesn't parse: ${error.message}`);
        const message = `<p class="diagram-error">This diagram doesn't parse: ${escape(error.message)}</p>`;
        ctx.replaceNode(node, { type: 'raw', value: `<div class="diagram">${message}<pre>${escape(source)}</pre></div>` });
        return;
      }
      // Wide diagrams shrink to fit, down to a readable size, then scroll sideways like tables
      const width = Math.ceil(Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0));
      ctx.replaceNode(node, {
        type: 'raw',
        value: `<div class="diagram" style="--diagram-width: ${width}px" tabindex="0" role="region" aria-label="Diagram, scrolls sideways">${svg}</div>`,
      });
    },
  },
});

const UNLABELLED_LANGS = new Set(['text', 'txt', 'plaintext', 'plain']);

/**
 * Wraps highlighted code in a figure with a header bar. The header shows the file name
 * from a `title="..."` meta string (```kotlin title="Main.kt"), otherwise the language.
 * A copy button is added to the header by script on the post page.
 */
export const codeBlockChrome = {
  name: 'blog-code-block-chrome',
  root(root) {
    const pre = root.children.find((node) => node.type === 'element' && node.tagName === 'pre');
    if (!pre) return;
    const lang = this.options.lang ?? '';
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1];
    const label = title ?? (UNLABELLED_LANGS.has(lang) ? '' : lang);
    const header = element('figcaption', { className: ['code-block-header'] }, [
      element('span', { className: ['code-block-label'] }, label ? [text(label)] : []),
    ]);
    root.children = [element('figure', { className: ['code-block'] }, [header, pre])];
  },
};
