CDN isn't the issue — the assets are. Three compounding problems:

1. Videos have no faststart (moov atom at end-of-file). Every MP4 has the index in the last ~50 KB instead of the front. Browsers must download essentially the whole file before they can show frame one — CloudFront can serve those bytes fast, but the browser still has to wait for ~24 MB of data before playback begins on the iCloudBridge notes clip.

2. Videos are massively over-encoded for web. The iCloudBridge clips are 3840×2152 @ 60fps @ ~5 Mbit/s — raw screen recordings. Total of ~127 MB of video, ~100 MB of which is iCloudBridge alone. The carousel viewport renders them at ~400px tall. Re-encoding to 1080p/30fps/~1.5 Mbit/s would cut size ~5–10× with no visible loss.

3. preload="metadata" on every video fires on page load (src/components/ProjectTile.astro:90), so the browser starts pulling bytes for all 8 videos as soon as /projects opens — even though every card is collapsed. Combine with the missing faststart and it's hammering each file looking for the moov atom.

Bonus: a few PNGs are oversized too (mtdict/bg_image.png 6.5 MB, wfos/wfos_logo.png 3.8 MB) — the card-face blurs them anyway.

Recommended order of attack:

Quick code win, zero asset work: change preload="metadata" → preload="none" and only set src when a card expands. Cuts the page-load video traffic from ~all-of-them to zero. (5 min of work)
Re-encode videos with ffmpeg -movflags +faststart, 1080p/30fps, CRF 26, AAC 96k. Optionally generate a WebM/AV1 alternative. Biggest user-perceived win.
Compress the heavy PNGs (or move to WebP via Astro's <Image /> once they live under src/assets/).
(Lower priority) verify CloudFront cache-control on /public/ assets — by default Astro's public/ is copied straight through with no content hash, so cache TTL relies entirely on S3 object metadata.
Want me to do (1) right now as a no-risk patch, and write you an ffmpeg script for (2) that you can run against public/assets/projects?