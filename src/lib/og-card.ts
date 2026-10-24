import { readFileSync } from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import type { CardContent } from './social';
import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from './social';

// Renders the branded 1200x630 social cards at build time. Only the og/ endpoints import
// this module, so satori and the font files never reach a page bundle.

const COLORS = {
  bg: '#0B0D12',
  text: '#EEF1F5',
  secondary: '#A3ACB9',
  border: '#262C37',
  green: '#8CD49C',
  orange: '#ffa657',
  cyan: '#56d4dd',
  purple: '#d2a8ff',
  blue: '#79c0ff',
  red: '#ff7b72',
  indigo: '#a5a6ff',
  yellow: '#f2cc60',
  pink: '#f2a0d6',
  lime: '#b9e06f',
};

const root = process.cwd();

function fontFile(pkg: string, file: string): Buffer {
  return readFileSync(path.join(root, 'node_modules', pkg, 'files', file));
}

// satori reads TTF, OTF and WOFF but not WOFF2, so these come from the static fontsource
// packages. Each family loads latin and latin-ext, so Maltese titles render too.
function loadFonts() {
  const family = (name: string, pkg: string, stem: string, weight: 400 | 500 | 700 | 800) =>
    ['latin', 'latin-ext'].map((subset) => ({
      name,
      weight,
      style: 'normal' as const,
      data: fontFile(pkg, `${stem}-${subset}-${weight}-normal.woff`),
    }));
  return [
    ...family('Bricolage', '@fontsource/bricolage-grotesque', 'bricolage-grotesque', 800),
    ...family('Atkinson', '@fontsource/atkinson-hyperlegible-next', 'atkinson-hyperlegible-next', 400),
    ...family('Atkinson', '@fontsource/atkinson-hyperlegible-next', 'atkinson-hyperlegible-next', 700),
    ...family('JetBrains', '@fontsource/jetbrains-mono', 'jetbrains-mono', 500),
  ];
}

function dataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

let shared: Promise<{ fonts: ReturnType<typeof loadFonts>; logo: string; avatar: string }> | undefined;

function loadShared() {
  shared ??= (async () => ({
    fonts: loadFonts(),
    logo: dataUri(readFileSync(path.join(root, 'public/assets/icons/kv.png'))),
    avatar: dataUri(
      await sharp(path.join(root, 'public/assets/images/keith_pic.png'))
        .resize(144, 144, { fit: 'cover', position: 'top' })
        .flatten({ background: '#C9CED6' })
        .png()
        .toBuffer(),
    ),
  }))();
  return shared;
}

// Minimal element factory in the shape satori expects (it accepts React-like objects).
type Child = SatoriNode | string;
interface SatoriNode {
  type: string;
  props: Record<string, unknown>;
}

function el(type: string, props: Record<string, unknown>, ...children: Child[]): SatoriNode {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

function titleSize(title: string): number {
  if (title.length <= 32) return 84;
  if (title.length <= 56) return 72;
  if (title.length <= 84) return 60;
  return 50;
}

function tint(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export async function renderCard(card: CardContent): Promise<Buffer> {
  const { fonts, logo, avatar } = await loadShared();
  const size = titleSize(card.title);
  const labelColor = card.label ? COLORS[card.label.color] : COLORS.green;

  const header = el(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 20 } },
    el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: 999,
          border: `3px solid ${COLORS.green}`,
        },
      },
      el('img', { src: logo, width: 40, height: 29 }),
    ),
    el('div', { style: { fontFamily: 'JetBrains', fontSize: 26, color: COLORS.secondary } }, 'keithvassallo.com'),
  );

  const body = el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
    el('div', { style: { fontFamily: 'JetBrains', fontSize: 30, color: COLORS.green } }, card.eyebrow),
    el(
      'div',
      {
        style: {
          display: 'block',
          lineClamp: 4,
          fontFamily: 'Bricolage',
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.04,
          letterSpacing: -size * 0.025,
          color: COLORS.text,
        },
      },
      card.title,
    ),
  );

  const footerItems: Child[] = [];
  if (card.label) {
    footerItems.push(
      el(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 22px',
            borderRadius: 999,
            background: tint(labelColor, 0.14),
            color: labelColor,
            fontSize: 26,
            fontWeight: 700,
          },
        },
        el('div', { style: { width: 12, height: 12, borderRadius: 999, background: labelColor } }),
        card.label.text,
      ),
    );
  }
  footerItems.push(
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: COLORS.secondary } },
      el('img', { src: avatar, width: 52, height: 52, style: { borderRadius: 999 } }),
      card.meta,
    ),
  );

  const footer = el('div', { style: { display: 'flex', alignItems: 'center', gap: 28 } }, ...footerItems);

  const tree = el(
    'div',
    {
      style: {
        width: SOCIAL_IMAGE_WIDTH,
        height: SOCIAL_IMAGE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 80px 60px',
        background: COLORS.bg,
        borderTop: `10px solid ${labelColor}`,
        fontFamily: 'Atkinson',
        color: COLORS.text,
      },
    },
    header,
    body,
    footer,
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    fonts,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
}

/** Crops and compresses a hand-made social image to exactly 1200x630. */
export async function renderPhoto(source: string): Promise<Buffer> {
  return sharp(source)
    .resize(SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .flatten({ background: COLORS.bg })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
