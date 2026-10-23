// CloudFront Function `keithvassallo_com_fancyurl` (viewer request, cloudfront-js-2.0).
// Publish changes with infrastructure/cloudfront/apply.sh.
import cf from 'cloudfront';

// Permanent redirects, keyed by path without a trailing slash (/blog/old-slug -> /blog/new-slug),
// held in the keithvassallo-com-redirects key-value store. scripts/sync-redirects.mjs keeps it in
// step with blog post `redirectFrom` frontmatter during each deploy.
const redirects = cf.kvs('afe01dc3-1fec-4b6a-ae4e-84d74a3001d4');

async function handler(event) {
    var request = event.request;
    var uri = request.uri;
    var isPage = !uri.includes('.');

    // Only page URLs can redirect, so assets skip the lookup
    if (isPage && uri !== '/') {
        var key = uri.endsWith('/') ? uri.slice(0, -1) : uri;
        try {
            var target = await redirects.get(key);
            return {
                statusCode: 301,
                statusDescription: 'Moved Permanently',
                headers: {
                    location: { value: target },
                    'cache-control': { value: 'public, max-age=86400' }
                }
            };
        } catch (err) {
            // Not in the store: serve the request as normal
        }
    }

    // If URI ends with '/' or has no file extension, append index.html
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (isPage) {
        request.uri += '/index.html';
    }

    return request;
}
