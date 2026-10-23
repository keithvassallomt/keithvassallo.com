// Markdown extensions for blog posts, wired up in astro.config.mjs.
// The hast plugins use Sätteri's visitor API (Astro's default Markdown processor);
// codeBlockChrome is a Shiki transformer.

const element = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });
const isBlank = (node) => node.type === 'text' && !node.value.trim();

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

/** GitHub-style callouts: a blockquote starting with [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]. */
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
      const match = /^\s*\[!(note|tip|important|warning|caution)\]\s*/i.exec(lead.value);
      if (!match) return;

      const kind = match[1].toLowerCase();
      const remainder = lead.value.slice(match[0].length);
      const leadChildren = [...(remainder ? [text(remainder)] : []), ...first.children.slice(1)];
      const body = node.children.flatMap((child, index) => {
        if (index !== firstIndex) return [child];
        return leadChildren.some((part) => !isBlank(part)) ? [element('p', {}, leadChildren)] : [];
      });

      ctx.replaceNode(
        node,
        element('aside', { className: ['callout', `callout-${kind}`] }, [
          element('p', { className: ['callout-title'] }, [text(CALLOUTS[kind])]),
          ...body,
        ]),
      );
    },
  },
};

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
