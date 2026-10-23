import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard } from '../../lib/og-card';
import { getSocialAssets, type CardContent } from '../../lib/social';

export const getStaticPaths = (async () => {
  const assets = await getSocialAssets();
  return assets.flatMap((asset) => (asset.kind === 'card' ? [{ params: { name: asset.name }, props: { card: asset.card } }] : []));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card: CardContent }> = async ({ props }) => {
  const png = await renderCard(props.card);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
