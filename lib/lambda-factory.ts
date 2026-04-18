import * as path from 'node:path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CreateLambdaProps {
  entry: string;
  handler?: string;
  memorySize?: number;
  timeout?: number;
  environment?: Record<string, string>;
}

export const createLambda = (scope: Construct, id: string, props: CreateLambdaProps) => {
  return new NodejsFunction(scope, id, {
    runtime: lambda.Runtime.NODEJS_20_X,
    entry: props.entry,
    handler: props.handler ?? 'handler',
    memorySize: props.memorySize ?? 1024,
    timeout: Duration.seconds(props.timeout ?? 5),
    environment: props.environment,

    bundling: {
      minify: true,
      sourceMap: true,
      target: 'node20',
      sourcesContent: false,
      externalModules: [], // Bundle @aws-sdk instead of relying on the Lambda runtime version
    },
  });
};
