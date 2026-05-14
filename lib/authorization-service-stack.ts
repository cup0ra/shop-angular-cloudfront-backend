import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { Construct } from 'constructs';
import { createLambda } from './lambda-factory';

type AuthorizationServiceStackProps = cdk.StackProps & {
  stageName: string;
};

export class AuthorizationServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AuthorizationServiceStackProps) {
    super(scope, id, props);

    const loginName = process.env.LOGIN_NAME as string;
    const loginPassword = process.env.LOGIN_PASSWORD as string;
    const environment = {
      [loginName]: loginPassword,
    };

    const basicAuthorizer = createLambda(this, 'AuthorizerFunction', {
      entry: path.join(__dirname, '../src/authorizer/handlers/authorizer.ts'),
      handler: 'basicAuthorizer',
      description: '',
      environment,
    });

    basicAuthorizer.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:*/authorizers/*`,
    });

    new cdk.CfnOutput(this, 'AuthorizerFunctionArn', {
      value: basicAuthorizer.functionArn,
      exportName: `BasicAuthorizerLambdaArn-${props?.stageName}`,
    });
  }
}
