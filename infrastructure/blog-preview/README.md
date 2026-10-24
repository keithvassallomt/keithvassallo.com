# Blog draft preview site

Every open blog draft pull request links to a preview of its post, built with drafts on and
served exactly as the live site would serve it. `scripts/blog-draft/preview.sh` builds `main`
plus every open draft and uploads the result here. The private repository's workflows run it
after each new draft and each revision.

| Resource | Value |
| --- | --- |
| Preview URL | `https://dx7dd333kjm39.cloudfront.net` |
| S3 bucket | `keithvassallo.com-preview` (eu-west-1, private, public access blocked) |
| CloudFront distribution | `E2M0FH8HMTSME4` ([distribution.json](distribution.json)) |
| Origin access control | `EOQUNH10UATD7` |
| Response headers policy | `keithvassallo-com-preview-noindex` (`96a7347b-6400-4bda-86b1-650d824acc01`), sends `X-Robots-Tag: noindex, nofollow` |
| Viewer request function | `keithvassallo_com_fancyurl`, shared with the live site |
| Deploy role | `keithvassallo-com-preview-deploy`, assumable only by `keithvassallomt/blog-private` workflows through GitHub OIDC ([trust](deploy-role-trust.json), [permissions](deploy-role-policy.json)) |

Differences from the live distribution:

- **No caching** (the managed `CachingDisabled` policy), so a revision shows up as soon as it's
  uploaded, with no invalidation.
- **Kept out of search engines** by the `noindex` header and a disallow-all `robots.txt`, which
  `preview.sh` writes over the site's own. The preview links appear in public pull requests.
- **Origin access control** rather than the older origin access identity, with
  [bucket-policy.json](bucket-policy.json) letting only this distribution read the bucket.
- **`PriceClass_100`** (Europe and North America), which is plenty for one reader.

The private repository's workflows read the values above from its `PREVIEW_URL`,
`PREVIEW_BUCKET` and `PREVIEW_ROLE_ARN` variables. Without them, draft pull requests link to the
post on GitHub instead.
