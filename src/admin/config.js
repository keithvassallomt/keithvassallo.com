// Where the admin's sign-in and API live: the outputs of the BlogAdmin stack
// (infrastructure/blog-admin, `npm run deploy` there writes them to cdk-outputs.json).
// None of these are secrets.
export const config = {
  authUrl: 'https://auth.keithvassallo.com',
  clientId: '4om474088lhqopff4d29v3k4ik',
  apiUrl: 'https://dqdiusoprh.execute-api.eu-west-1.amazonaws.com',
};
