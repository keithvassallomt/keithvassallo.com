#!/usr/bin/env bash
#
# Applies the CloudFront and IAM settings the blog relies on. Safe to re-run.
#
#   1. Loads viewer-request.js into the `keithvassallo_com_fancyurl` function with the redirects
#      key-value store attached, tests it in the DEVELOPMENT stage, then publishes it.
#   2. Serves /404.html with a real 404 status for missing pages. The S3 origin is private,
#      so it answers 403 for keys that don't exist; both codes map to the 404 page.
#   3. Applies infrastructure/codebuild-deploy-policy.json to the CodeBuild role, which lets
#      scripts/sync-redirects.mjs update the redirects store during deploys.
#
# Run it before the first deploy that includes scripts/sync-redirects.mjs.
#
# Usage: infrastructure/cloudfront/apply.sh
# Requires: aws CLI with credentials for account 781345700122, python3

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/../.." && pwd)"

FUNCTION=keithvassallo_com_fancyurl
DISTRIBUTION=E1W88AN3N1ZWL6
KVS_ARN=arn:aws:cloudfront::781345700122:key-value-store/afe01dc3-1fec-4b6a-ae4e-84d74a3001d4
ROLE=codebuild-keithvassallo_com_codebuild-service-role_eu_west_1
POLICY=CodeBuildDeployToS3AndCloudFront

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> 1. Function $FUNCTION"
etag=$(aws cloudfront describe-function --name "$FUNCTION" --stage DEVELOPMENT --query ETag --output text)
cat > "$TMP_DIR/function-config.json" <<EOF
{
  "Comment": "Pretty URLs (/cv -> /cv/index.html) and 301 redirects from the keithvassallo-com-redirects store",
  "Runtime": "cloudfront-js-2.0",
  "KeyValueStoreAssociations": { "Quantity": 1, "Items": [{ "KeyValueStoreARN": "$KVS_ARN" }] }
}
EOF
etag=$(aws cloudfront update-function --name "$FUNCTION" --if-match "$etag" \
  --function-config "file://$TMP_DIR/function-config.json" \
  --function-code "fileb://$DIR/viewer-request.js" \
  --query ETag --output text)

# Each test is "<request uri> <expected uri after the function>"
while read -r uri expected; do
  printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"192.0.2.1"},"request":{"method":"GET","uri":"%s","querystring":{},"headers":{},"cookies":{}}}' \
    "$uri" > "$TMP_DIR/event.json"
  aws cloudfront test-function --name "$FUNCTION" --if-match "$etag" --stage DEVELOPMENT \
    --event-object "fileb://$TMP_DIR/event.json" --output json > "$TMP_DIR/result.json"
  python3 - "$TMP_DIR/result.json" "$uri" "$expected" <<'EOF'
import json, sys
result, uri, expected = json.load(open(sys.argv[1]))['TestResult'], sys.argv[2], sys.argv[3]
if result.get('FunctionErrorMessage'):
    sys.exit(f"   FAIL {uri}: {result['FunctionErrorMessage']}")
actual = json.loads(result['FunctionOutput'])['request']['uri']
if actual != expected:
    sys.exit(f"   FAIL {uri}: got {actual}, expected {expected}")
print(f"   ok   {uri} -> {actual}")
EOF
done <<'TESTS'
/ /index.html
/cv /cv/index.html
/blog/ /blog/index.html
/blog/some-post /blog/some-post/index.html
/_astro/page.abc123.js /_astro/page.abc123.js
/og/blog-post-1a2b3c.png /og/blog-post-1a2b3c.png
TESTS

aws cloudfront publish-function --name "$FUNCTION" --if-match "$etag" >/dev/null
echo "   published to LIVE"

echo "==> 2. Custom error responses on $DISTRIBUTION"
aws cloudfront get-distribution-config --id "$DISTRIBUTION" --output json > "$TMP_DIR/distribution.json"
python3 - "$TMP_DIR/distribution.json" "$TMP_DIR/distribution-config.json" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
config = data['DistributionConfig']
config['CustomErrorResponses'] = {
    'Quantity': 2,
    'Items': [
        {'ErrorCode': code, 'ResponsePagePath': '/404.html', 'ResponseCode': '404', 'ErrorCachingMinTTL': 60}
        for code in (403, 404)
    ],
}
json.dump(config, open(sys.argv[2], 'w'))
open(sys.argv[1] + '.etag', 'w').write(data['ETag'])
EOF
aws cloudfront update-distribution --id "$DISTRIBUTION" --if-match "$(cat "$TMP_DIR/distribution.json.etag")" \
  --distribution-config "file://$TMP_DIR/distribution-config.json" >/dev/null
echo "   403 and 404 now serve /404.html with status 404 (takes a few minutes to deploy)"

echo "==> 3. IAM policy $POLICY on $ROLE"
aws iam put-role-policy --role-name "$ROLE" --policy-name "$POLICY" \
  --policy-document "file://$ROOT_DIR/infrastructure/codebuild-deploy-policy.json"
echo "   applied infrastructure/codebuild-deploy-policy.json"

echo
echo "Done. After the next deploy, check: curl -sI https://keithvassallo.com/no-such-page"
