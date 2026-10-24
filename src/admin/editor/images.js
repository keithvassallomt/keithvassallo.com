// Images from the editor: shrunk and re-encoded in the browser, then uploaded straight to the
// admin's bucket. Re-encoding through a canvas also drops the photo's metadata, so a phone
// picture's location never leaves the phone.
import { api } from '../api.js';

const MAX_SIZE = 2400;

/** Draws the file at no more than 2,400 px a side and encodes it as WebP (JPEG where unsupported). */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', 0.85);
  if (webp?.type === 'image/webp') return { blob: webp, extension: 'webp' };
  return { blob: await encode('image/jpeg', 0.88), extension: 'jpg' };
}

/** A file name the API accepts, from the original name plus a few random letters. */
export function imageName(file, extension) {
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'image'}-${suffix}.${extension}`;
}

export async function uploadImage(postId, blob, name) {
  const { url } = await api(`/posts/${postId}/images`, { method: 'POST', body: { name, type: blob.type } });
  const response = await fetch(url, { method: 'PUT', headers: { 'content-type': blob.type }, body: blob });
  if (!response.ok) throw new Error(`The image didn't upload (${response.status})`);
  return name;
}
