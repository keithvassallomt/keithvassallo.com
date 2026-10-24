#!/usr/bin/env node
// CDK entry point for the blog admin's AWS side (docs/blog-admin-plan.md).
import { App } from 'aws-cdk-lib';
import { BlogAdminStack } from '../lib/blog-admin-stack.js';

const app = new App();

// Pinned rather than taken from the CLI profile, whose default region here is eu-south-1.
// The rest of the site's AWS lives in eu-west-1, plus us-east-1 for CloudFront certificates.
new BlogAdminStack(app, 'BlogAdmin', {
  env: { account: '781345700122', region: 'eu-west-1' },
  // ASCII only: CloudFormation round-trips the description, and cdk diff mangles anything else
  description: 'keithvassallo.com blog admin - sign-in, API, drafts store',
});
