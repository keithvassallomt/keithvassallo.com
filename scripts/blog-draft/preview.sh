#!/usr/bin/env bash
#
# Builds the site from main plus every open blog draft and uploads it to the preview site, so
# each draft's pull request can link to the post as it will look. The private repository's
# workflows run it after pushing a draft or a revision. It leaves the checkout on main with
# the drafts added, so run it last.
#
# The preview site is infrastructure/blog-preview: a private S3 bucket behind CloudFront, with
# caching off and search engines kept out.
#
# Needs: GH_TOKEN (read access is enough), AWS credentials that can write PREVIEW_BUCKET, and
# the site's npm dependencies.
#
# Usage: PREVIEW_BUCKET=keithvassallo.com-preview scripts/blog-draft/preview.sh

set -euo pipefail
: "${PREVIEW_BUCKET:?PREVIEW_BUCKET is not set}"
REPO=keithvassallomt/keithvassallo.com

git fetch --quiet --depth=1 origin +main:refs/remotes/origin/main
git checkout --quiet --detach origin/main

drafts=$(gh pr list --repo "$REPO" --state open --limit 100 --json headRefName \
  --jq '.[].headRefName | select(startswith("blog-draft/"))')
for branch in $drafts; do
  slug=${branch#blog-draft/}
  git fetch --quiet --depth=1 origin "+$branch:refs/remotes/origin/$branch"
  if git checkout --quiet "origin/$branch" -- "src/content/blog/$slug"; then
    echo "Previewing $slug"
  else
    echo "Skipping $branch: it has no src/content/blog/$slug"
  fi
done

BLOG_DRAFTS=true npm run build

# The preview duplicates the live site, so keep search engines out of it. The distribution
# also sends X-Robots-Tag: noindex with every response.
printf 'User-agent: *\nDisallow: /\n' > dist/robots.txt
aws s3 sync dist/ "s3://$PREVIEW_BUCKET/" --delete --only-show-errors
