// Renders a post body the way the site build does: Astro's Sätteri processor with the site's
// Shiki theme and its own Markdown plugins (src/lib/markdown.mjs, bundled from the site).
// Keep the options in step with `markdown` in astro.config.mjs.
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { callouts, codeBlockChrome, figures, scrollableTables } from '../../../../src/lib/markdown.mjs';

let processor = null;

const escape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {string} body the post's Markdown
 * @param {(path: string) => Promise<string | null>} imageUrl a viewable URL for one of the
 *   post's own images (`./name.webp`), or null when it hasn't been uploaded
 */
export async function renderPreview(body, imageUrl) {
  processor ??= await createSatteriMarkdownProcessor({
    shikiConfig: { theme: 'github-dark-default', transformers: [codeBlockChrome] },
    hastPlugins: [scrollableTables, figures, callouts],
  });
  const { code } = await processor.render(body);

  // Astro swaps its image markers for optimised images at build time; the preview points them
  // at the uploaded files instead
  const images = [...code.matchAll(/<img __ASTRO_IMAGE_="([^"]*)"\s*\/?>/g)];
  const replacements = await Promise.all(
    images.map(async ([marker, attribute]) => {
      const props = JSON.parse(attribute.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
      const src = props.src.startsWith('./') ? await imageUrl(props.src) : props.src;
      const title = props.title ? ` title="${escape(props.title)}"` : '';
      if (!src) return [marker, `<span class="preview-missing">Missing image: ${escape(props.src)}</span>`];
      return [marker, `<img src="${escape(src)}" alt="${escape(props.alt ?? '')}"${title} loading="lazy">`];
    }),
  );
  return replacements.reduce((html, [marker, replacement]) => html.replace(marker, replacement), code);
}
