import type { APIRoute, GetStaticPaths } from 'astro';
import { renderPhoto } from '../../lib/og-card';
import { getSocialAssets } from '../../lib/social';

export const getStaticPaths = (async () => {
  const assets = await getSocialAssets();
  return assets.flatMap((asset) => (asset.kind === 'photo' ? [{ params: { name: asset.name }, props: { source: asset.source } }] : []));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ source: string }> = async ({ props }) => {
  const jpeg = await renderPhoto(props.source);
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } });
};
