# Blog admin infrastructure

The AWS side of the blog admin at `keithvassallo.com/admin`
([plan](../../docs/blog-admin-plan.md)): Keith's sign-in, the API behind the admin, and the
store for drafts. One CDK app, `BlogAdmin` in eu-west-1. The admin itself is `src/admin/` in the
site, and reads the stack's outputs from `src/admin/config.js`.

| Resource | What it is |
| --- | --- |
| Cognito user pool `keithvassallo-com-admin` (`eu-west-1_m5iSfSXvD`) | Essentials plan, sign-up off, password or passkey. Keith (`adminEmail` in `cdk.json`) is created by the stack and put in the `admins` group |
| `auth.keithvassallo.com` | Managed login, with the account's `*.keithvassallo.com` certificate from us-east-1 and a Route 53 alias. Passkeys are registered to this domain |
| App client `admin` | Public client: authorization code with PKCE, callbacks to `/admin` on the site and on `localhost:4321`. Refresh tokens last 30 days |
| HTTP API `keithvassallo-com-admin` | Checks the Cognito access token, then the `Api` Lambda checks the `admins` group |
| DynamoDB table | Posts, versions, jobs and settings (`pk`, `sk`), with point-in-time recovery and a change stream |
| S3 bucket | Post files, images and the AI's notes. Versioned; replaced copies expire after 30 days |

The user pool, table and bucket are retained if the stack is deleted, and the pool and table
have deletion protection on.

## Deploying

```bash
cd infrastructure/blog-admin
npm install
npm run diff
npm run deploy -- --outputs-file cdk-outputs.json
```

If the API URL or client ID changes, copy them from `cdk-outputs.json` into
`src/admin/config.js`.

## First sign-in

The first deploy emails Keith a temporary password from Cognito's own sender. Sign in at
`https://keithvassallo.com/admin`, choose a password, and accept the offer to add a passkey. To
add one on another device, sign in there and use Settings, Add a passkey.
