import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

type PolicyEffect = 'Allow' | 'Deny';

export const basicAuthorizer = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log('basicAuthorizer event:', JSON.stringify(event));

  const authorizationToken = event.authorizationToken;

  if (!authorizationToken) {
    console.log('Authorization header is missing');

    throw new Error('Unauthorized'); // API Gateway returns 401
  }

  try {
    const [authType, encodedCredentials] = authorizationToken.split(' ');

    if (authType !== 'Basic' || !encodedCredentials) {
      console.log('Invalid authorization token format');

      return generatePolicy('user', 'Deny', event.methodArn);
    }

    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex <= 0) {
      console.log('Invalid authorization token payload');

      return generatePolicy('user', 'Deny', event.methodArn);
    }

    const login = decodedCredentials.slice(0, separatorIndex);
    const password = decodedCredentials.slice(separatorIndex + 1);

    const storedPassword = process.env[login];

    if (!storedPassword || storedPassword !== password) {
      console.log('Invalid credentials');

      return generatePolicy('user', 'Deny', event.methodArn);
    }

    console.log('User is authorized');

    return generatePolicy(login, 'Allow', event.methodArn);
  } catch (error) {
    console.error('Authorization error:', error);

    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

const generatePolicy = (
  principalId: string,
  effect: PolicyEffect,
  resource: string
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      },
    ],
  },
});
