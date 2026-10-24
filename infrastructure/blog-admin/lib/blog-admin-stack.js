// The blog admin's AWS side: Keith's sign-in, the API behind /admin, and the store for drafts.
// See docs/blog-admin-plan.md for how it fits with the site and the AI workflows, and
// infrastructure/blog-admin/README.md for deploying it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Members of this group may use the API. Only Keith is in it. */
export const ADMIN_GROUP = 'admins';
const SITE_REPO = 'keithvassallomt/keithvassallo.com';
const PRIVATE_REPO = 'keithvassallomt/blog-private';
const GITHUB_TOKEN_PARAMETER = '/blog-admin/github-token';
const SCHEDULE_GROUP = 'blog-admin';

export class BlogAdminStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const context = (key) => {
      const value = this.node.tryGetContext(key);
      if (!value) throw new Error(`cdk.json is missing the context value "${key}"`);
      return value;
    };
    const siteUrl = context('siteUrl');
    const devUrl = context('devUrl');
    const authDomain = context('authDomain');
    const adminEmail = context('adminEmail');
    const origins = [siteUrl, devUrl];

    // ---- sign-in ----------------------------------------------------------------------
    // One user, created below. Sign-up is off, so nobody else can get an account.
    const users = new cognito.UserPool(this, 'Users', {
      userPoolName: 'keithvassallo-com-admin',
      // Essentials is the lowest plan with passkeys and managed login
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 14, requireLowercase: false, requireUppercase: false, requireDigits: false, requireSymbols: false },
      signInPolicy: { allowedFirstAuthFactors: { password: true, passkey: true } },
      // With a custom domain and managed login, the passkey's relying party must be that domain
      passkeyRelyingPartyId: authDomain,
      // Preferred, so managed login offers to add a passkey after a password sign-in
      passkeyUserVerification: cognito.PasskeyUserVerification.PREFERRED,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: 'Your keithvassallo.com admin account',
        emailBody: `Sign in at ${siteUrl}/admin with {username} and the temporary password {####}. You'll choose your own password, then you can add a passkey.`,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const domain = users.addDomain('Domain', {
      customDomain: {
        domainName: authDomain,
        // The account's *.keithvassallo.com certificate. Cognito needs it in us-east-1.
        certificate: acm.Certificate.fromCertificateArn(this, 'Certificate', context('certificateArn')),
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    new route53.ARecord(this, 'AuthRecord', {
      zone: route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: context('hostedZoneId'),
        zoneName: context('zoneName'),
      }),
      recordName: authDomain,
      target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(domain)),
    });

    // A browser app, so no secret: the code flow with PKCE proves it's the same browser
    const client = users.addClient('Admin', {
      userPoolClientName: 'admin',
      generateSecret: false,
      authFlows: { user: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: origins.map((origin) => `${origin}/admin`),
        logoutUrls: origins.map((origin) => `${origin}/admin`),
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // Signed in for a month on each device, so the phone doesn't ask every time
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });

    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: users.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    const admins = new cognito.CfnUserPoolGroup(this, 'Admins', {
      userPoolId: users.userPoolId,
      groupName: ADMIN_GROUP,
      description: 'May use the blog admin',
    });

    // Keith's account lives in the stack, so a replaced pool still comes up with him in it.
    // Neither call deletes anything on teardown: the pool is retained, and so is he.
    const sdkPolicy = AwsCustomResourcePolicy.fromSdkCalls({ resources: [users.userPoolArn] });
    const createdAdmin = new AwsCustomResource(this, 'AdminUser', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminCreateUser',
        parameters: {
          UserPoolId: users.userPoolId,
          Username: adminEmail,
          UserAttributes: [
            { Name: 'email', Value: adminEmail },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        },
        physicalResourceId: PhysicalResourceId.of(`admin-user-${adminEmail}`),
        ignoreErrorCodesMatching: 'UsernameExistsException',
      },
      policy: sdkPolicy,
      installLatestAwsSdk: false,
    });
    const promotedAdmin = new AwsCustomResource(this, 'AdminGroupMembership', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminAddUserToGroup',
        parameters: { UserPoolId: users.userPoolId, Username: adminEmail, GroupName: ADMIN_GROUP },
        physicalResourceId: PhysicalResourceId.of(`admin-group-${adminEmail}`),
      },
      policy: sdkPolicy,
      installLatestAwsSdk: false,
    });
    promotedAdmin.node.addDependency(createdAdmin, admins);

    // ---- the store ----------------------------------------------------------------------
    // Posts, versions, jobs and settings, one table. The stream feeds the notifier (stage 6).
    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Autosave snapshots in History expire on their own
      timeToLiveAttribute: 'expiresAt',
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Post files, images and the AI's notes. Versioned, so an overwritten save can come back.
    const files = new s3.Bucket(this, 'Files', {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // The browser uploads images straight to the bucket with presigned URLs
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedOrigins: origins,
        allowedHeaders: ['*'],
        maxAge: 3600,
      }],
      lifecycleRules: [
        // Replaced copies of a file (autosaves, mostly). Labelled versions are kept separately.
        { noncurrentVersionExpiration: Duration.days(30) },
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---- scheduled posts ----------------------------------------------------------------
    // Each scheduled post is a one-off schedule in this group, which calls the API's Lambda
    // at its minute and then deletes itself
    new scheduler.CfnScheduleGroup(this, 'Schedules', { name: SCHEDULE_GROUP });
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
      }),
      description: 'Lets the blog admin\'s scheduled posts call its API Lambda',
    });

    // ---- the API ------------------------------------------------------------------------
    const api = new lambdaNode.NodejsFunction(this, 'Api', {
      entry: path.join(HERE, '..', 'lambda', 'api', 'index.mjs'),
      runtime: lambda.Runtime.NODEJS_22_X,
      // x86_64 because the preview's Markdown processor, Sätteri, is a native module, and it is
      // installed on the (x86_64 Linux) machine that deploys
      architecture: lambda.Architecture.X86_64,
      memorySize: 1024,
      timeout: Duration.seconds(20),
      bundling: {
        format: lambdaNode.OutputFormat.ESM,
        target: 'node22',
        mainFields: ['module', 'main'],
        minify: true,
        sourceMap: true,
        // The AWS SDK is bundled rather than taken from the runtime, which lacks the presigner
        externalModules: [],
        // Installed beside the bundle: Sätteri loads a native binary, and Shiki loads its
        // grammars and themes at run time
        nodeModules: ['@astrojs/markdown-satteri', 'satteri', 'shiki'],
        // Bundled CommonJS dependencies call require(), which ESM output lacks
        banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        TABLE: table.tableName,
        BUCKET: files.bucketName,
        ADMIN_GROUP,
        SITE_REPO,
        PRIVATE_REPO,
        GITHUB_TOKEN_PARAMETER,
        SCHEDULE_GROUP,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    table.grantReadWriteData(api);
    files.grantReadWrite(api);
    api.grantInvoke(schedulerRole);

    // The GitHub token Keith saves in Settings: a SecureString, so CloudFormation can't create
    // it, and the API writes it on first save. Encrypted with the account's aws/ssm key.
    const tokenArn = this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: GITHUB_TOKEN_PARAMETER.slice(1) });
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameter', 'ssm:PutParameter'], resources: [tokenArn] }));
    api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Encrypt', 'kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );
    api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'],
        resources: [this.formatArn({ service: 'scheduler', resource: 'schedule', resourceName: `${SCHEDULE_GROUP}/*` })],
      }),
    );
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerRole.roleArn] }));

    // ---- the site runner ----------------------------------------------------------------
    // .github/workflows/blog-admin-site.yml on the site repo's main branch, and nothing else,
    // may take this role: it reads the post it is publishing and reports back on the job
    const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidc',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const siteRole = new iam.Role(this, 'SiteRunnerRole', {
      roleName: 'keithvassallo-com-blog-admin-site',
      description: 'The blog admin\'s site jobs, run by keithvassallo.com\'s blog-admin-site.yml on main',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${SITE_REPO}:ref:refs/heads/main`,
        },
      }),
    });
    siteRole.addToPolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'], resources: [table.tableArn] }));
    siteRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [files.bucketArn], conditions: { StringLike: { 's3:prefix': 'posts/*' } } }),
    );
    siteRole.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [files.arnForObjects('posts/*')] }));
    siteRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['codepipeline:ListPipelineExecutions'],
        resources: [this.formatArn({ service: 'codepipeline', resource: 'keithvassallo.com' })],
      }),
    );

    const http = new HttpApi(this, 'HttpApi', {
      apiName: 'keithvassallo-com-admin',
      corsPreflight: {
        allowOrigins: origins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.PATCH, CorsHttpMethod.DELETE],
        allowHeaders: ['authorization', 'content-type', 'if-match'],
        maxAge: Duration.hours(1),
      },
      // Checks the access token's issuer, client and expiry before the Lambda runs
      defaultAuthorizer: new HttpJwtAuthorizer('Cognito', users.userPoolProviderUrl, {
        jwtAudience: [client.userPoolClientId],
      }),
    });
    // Every route goes to the one Lambda, which matches on the route key (lambda/api/index.mjs)
    const integration = new HttpLambdaIntegration('ApiIntegration', api);
    const routes = {
      '/me': [HttpMethod.GET],
      '/posts': [HttpMethod.GET, HttpMethod.POST],
      '/posts/import': [HttpMethod.POST],
      '/posts/{id}': [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
      '/posts/{id}/restore': [HttpMethod.POST],
      '/posts/{id}/versions': [HttpMethod.GET],
      '/posts/{id}/versions/{version}': [HttpMethod.GET],
      '/posts/{id}/versions/{version}/restore': [HttpMethod.POST],
      '/posts/{id}/images': [HttpMethod.POST],
      '/posts/{id}/preview': [HttpMethod.POST],
      '/posts/{id}/publish': [HttpMethod.POST],
      '/posts/{id}/schedule': [HttpMethod.DELETE],
      '/posts/{id}/unpublish': [HttpMethod.POST],
      '/posts/{id}/delete-live': [HttpMethod.POST],
      '/posts/{id}/pin': [HttpMethod.POST, HttpMethod.DELETE],
      '/posts/{id}/repo': [HttpMethod.POST],
      '/jobs/{id}': [HttpMethod.GET],
      '/settings': [HttpMethod.GET],
      '/settings/github-token': [HttpMethod.PUT],
    };
    for (const [routePath, methods] of Object.entries(routes)) http.addRoutes({ path: routePath, methods, integration });

    // ---- what src/admin/config.js needs -------------------------------------------------
    new CfnOutput(this, 'UserPoolId', { value: users.userPoolId });
    new CfnOutput(this, 'ClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'AuthUrl', { value: `https://${authDomain}` });
    new CfnOutput(this, 'ApiUrl', { value: http.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'BucketName', { value: files.bucketName });
    // For the site repo's BLOG_ADMIN_SITE_ROLE_ARN variable
    new CfnOutput(this, 'SiteRunnerRoleArn', { value: siteRole.roleArn });
  }
}
