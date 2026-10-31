#!/usr/bin/env node
//
// Draws the blog admin's app icons (public/admin-icons/) from the site's logo, so the installed
// admin looks like its own app rather than the main site: the logo in the site green on the
// blog's dark ground. public/admin.webmanifest and src/pages/admin/index.astro list them.
//
//   icon.svg, icon-192.png, icon-512.png   rounded square, for browsers and the install prompt
//   maskable-192.png, maskable-512.png      full bleed, with the logo inside Android's safe zone
//   apple-touch-icon.png                    full bleed, 180 px: iOS rounds the corners itself
//   badge-96.png                            white on transparent, for Android's status bar
//   shortcut-*.png                          the long-press shortcuts' icons
//
// Usage: node scripts/admin-icons.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/admin-icons');
mkdirSync(out, { recursive: true });

const GROUND = '#0b0d12';
const GREEN = '#8cd49c';

// The logo's outline from the site's favicon, and the box it fills in its 128 × 128 view
const LOGO = /<path d="([^"]+)"/.exec(readFileSync(path.join(root, 'public/favicon.svg'), 'utf8'))[1];
const LOGO_BOX = { x: 21.9, y: 16.5, width: 84.2, height: 105.9 };

/** The logo, `share` of the icon's height tall, centred on a `size` canvas. */
function logo(size, share, fill) {
  const scale = (size * share) / LOGO_BOX.height;
  const x = size / 2 - (LOGO_BOX.x + LOGO_BOX.width / 2) * scale;
  const y = size / 2 - (LOGO_BOX.y + LOGO_BOX.height / 2) * scale;
  return `<path d="${LOGO}" fill="${fill}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})"/>`;
}

const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>`;

// A rounded square for browsers that show the icon as it is
const rounded = (size) => svg(size, `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${GROUND}"/>${logo(size, 0.62, GREEN)}`);
// Full bleed: Android crops to its own shape, keeping the middle 80% circle
const maskable = (size) => svg(size, `<rect width="${size}" height="${size}" fill="${GROUND}"/>${logo(size, 0.5, GREEN)}`);
const apple = (size) => svg(size, `<rect width="${size}" height="${size}" fill="${GROUND}"/>${logo(size, 0.58, GREEN)}`);
const badge = (size) => svg(size, logo(size, 0.82, '#ffffff'));

/** A shortcut icon: a Lucide icon in green on a dark circle. */
function shortcut(name, size = 96) {
  const icons = JSON.parse(readFileSync(path.join(root, 'node_modules/@iconify-json/lucide/icons.json'), 'utf8'));
  const body = icons.icons[name].body.replaceAll('currentColor', GREEN);
  const inner = size * 0.5;
  return svg(size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${GROUND}"/><svg x="${(size - inner) / 2}" y="${(size - inner) / 2}" width="${inner}" height="${inner}" viewBox="0 0 24 24">${body}</svg>`);
}

const png = (file, source) => sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toFile(path.join(out, file));

writeFileSync(path.join(out, 'icon.svg'), `${rounded(128)}\n`);
await Promise.all([
  png('icon-192.png', rounded(192)),
  png('icon-512.png', rounded(512)),
  png('maskable-192.png', maskable(192)),
  png('maskable-512.png', maskable(512)),
  png('apple-touch-icon.png', apple(180)),
  png('badge-96.png', badge(96)),
  png('shortcut-idea.png', shortcut('lightbulb')),
  png('shortcut-posts.png', shortcut('file-text')),
  png('shortcut-weekly.png', shortcut('calendar')),
]);
console.log(`Icons written to ${path.relative(root, out)}`);
