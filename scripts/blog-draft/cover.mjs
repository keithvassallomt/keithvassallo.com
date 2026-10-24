// Generates a draft's cover illustration with the OpenAI Images API, in one house style that
// sits with the blog's dark palette. Illustrations only: text, logos, interfaces and
// screenshots are ruled out, since a generated one could pass for real.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateImage } from './openai.mjs';

export const COVER_FILE = 'cover.webp';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';

/** The hex value of a category colour, read from the blog's own tokens in BlogShell.astro. */
function accent(siteDir, color) {
  const shell = readFileSync(path.join(siteDir, 'src/layouts/BlogShell.astro'), 'utf8');
  return new RegExp(`--c-${color}:\\s*(#[0-9a-f]{6})`, 'i').exec(shell)?.[1] ?? '#8cd49c';
}

/** @returns {Promise<Buffer>} a 2048x1024 WebP */
export function generateCover({ siteDir, title, idea, color }) {
  const prompt = `A wide editorial illustration for a technical blog post titled "${title}".

Scene: ${idea}

Style: a flat, modern editorial illustration with subtle grain, simple geometric shapes and generous negative space. A very dark blue-black background (#0b0d12), muted slate shapes (#12161d, #262c37) and soft accents in ${accent(siteDir, color)} and #8cd49c. Calm and quietly playful rather than dramatic. Keep the main subject near the centre, since the image is also cropped to a narrower card.

Do not include any text, letters, numbers, logos, brand marks, user interfaces, screenshots or real people.`;

  return generateImage({
    model: IMAGE_MODEL,
    prompt,
    size: '2048x1024',
    quality: 'high',
    output_format: 'webp',
    output_compression: 85,
  });
}
