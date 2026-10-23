import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ImageMetadata } from 'astro';
import { formatDate, getCategoryMap, getPosts, type Category, type Post } from './blog';
import { AUTHOR, absoluteUrl } from './site';

// Social preview images (Open Graph, X cards, structured data).
//
// Every image is 1200x630 and its filename carries a hash of whatever it was made from,
// so editing a title or swapping an image yields a new URL and social networks fetch it
// afresh instead of serving a stale cached preview.

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;

// Bump when the card design in og-card.ts changes, so every card gets a new URL.
const CARD_TEMPLATE_VERSION = 1;

export interface SocialImage {
  url: string;
  width: number;
  height: number;
  type: 'image/png' | 'image/jpeg';
  alt: string;
}

export interface CardContent {
  eyebrow: string;
  title: string;
  /** Small coloured chip, for example the post's category. */
  label?: { text: string; color: Category['data']['color'] };
  meta: string;
}

/** A generated branded card, or a hand-made image resized to the social format. */
export type SocialAsset =
  | { kind: 'card'; name: string; card: CardContent; image: SocialImage }
  | { kind: 'photo'; name: string; source: string; image: SocialImage };

// Cards for pages that are not articles. BaseLayout falls back to `site`.
export const SITE_CARDS = {
  site: { eyebrow: '~', title: 'Keith Vassallo', meta: 'Educator, developer & geek' },
  cv: { eyebrow: '~/cv', title: 'Curriculum Vitae', meta: 'Experience, skills and education' },
  projects: { eyebrow: '~/projects', title: 'Projects', meta: "Things I've designed & built" },
  contact: { eyebrow: '~/contact', title: 'Get in touch', meta: 'Have a question or want to work together?' },
  blog: { eyebrow: '~/blog', title: 'Notes from the workbench.', meta: 'Write-ups on the things I build, break and teach' },
  about: { eyebrow: '~/about', title: 'Keith Vassallo', meta: `${AUTHOR.jobTitle} @ ${AUTHOR.employer.name}` },
} satisfies Record<string, CardContent>;

export type SiteCard = keyof typeof SITE_CARDS;

function shortHash(...parts: unknown[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(Buffer.isBuffer(part) ? part : JSON.stringify(part));
  return hash.digest('hex').slice(0, 10);
}

function cardAsset(name: string, card: CardContent, alt: string): SocialAsset {
  const fullName = `${name}-${shortHash(CARD_TEMPLATE_VERSION, card)}`;
  return {
    kind: 'card',
    name: fullName,
    card,
    image: {
      url: absoluteUrl(`/og/${fullName}.png`),
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      type: 'image/png',
      alt,
    },
  };
}

export function siteCardAsset(key: SiteCard): SocialAsset {
  const card = SITE_CARDS[key];
  return cardAsset(`site-${key}`, card, `${card.title}: ${card.meta}. keithvassallo.com`);
}

export function postSocialAsset(post: Post, category: Category): SocialAsset {
  const { title, socialImage, socialImageAlt, coverAlt } = post.data;

  if (socialImage) {
    // Image proxies expose the source file path at build time
    const source = (socialImage as ImageMetadata & { fsPath: string }).fsPath;
    const name = `blog-${post.id}-${shortHash(readFileSync(source))}`;
    return {
      kind: 'photo',
      name,
      source,
      image: {
        url: absoluteUrl(`/og/${name}.jpg`),
        width: SOCIAL_IMAGE_WIDTH,
        height: SOCIAL_IMAGE_HEIGHT,
        type: 'image/jpeg',
        alt: socialImageAlt ?? coverAlt ?? title,
      },
    };
  }

  const card: CardContent = {
    eyebrow: '~/blog',
    title,
    label: { text: category.data.name, color: category.data.color },
    meta: `${AUTHOR.name} · ${formatDate(post.data.pubDate)}`,
  };
  return cardAsset(`blog-${post.id}`, card, `"${title}" by ${AUTHOR.name}, filed under ${category.data.name}`);
}

/** Every social image the build must generate. */
export async function getSocialAssets(): Promise<SocialAsset[]> {
  const [posts, categories] = await Promise.all([getPosts(), getCategoryMap()]);
  const siteAssets = (Object.keys(SITE_CARDS) as SiteCard[]).map(siteCardAsset);
  const postAssets = posts.map((post) => postSocialAsset(post, categories.get(post.data.category.id)!));
  return [...siteAssets, ...postAssets];
}
