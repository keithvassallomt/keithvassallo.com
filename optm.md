(Lower priority) verify CloudFront cache-control on /public/ assets — by default Astro's public/ is copied straight through with no content hash, so cache TTL relies entirely on S3 object metadata.
Want me to do (1) right now as a no-risk patch, and write you an ffmpeg script for (2) that you can run against public/assets/projects?


- typewriter
- buildspec cdn invalidate