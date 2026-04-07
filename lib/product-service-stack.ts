import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

type ProductServiceStackProps = cdk.StackProps & {
  stageName: string;
};

const allowedOriginsByStage: Record<string, string[]> = {
  dev: ['*'],
  prod: ['https://dzpenjz7rcmzz.cloudfront.net'],
};

function buildStageUrl(api: apigateway.RestApi, stack: cdk.Stack, stageName: string) {
  return `https://${api.restApiId}.execute-api.${stack.region}.${stack.urlSuffix}/${stageName}/`;
}

function getAllowedOrigins(stageName: string) {
  return allowedOriginsByStage[stageName] ?? [];
}

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ProductServiceStackProps) {
    super(scope, id, props);

    const { stageName } = props;
    const allowedOrigins = getAllowedOrigins(stageName);

    const getProductsList = new lambda.Function(this, 'GetProductsListFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: 'handlers/index.getProductsList',
      code: lambda.Code.fromAsset(path.join(__dirname, './')),
      environment: {
        ALLOWED_ORIGINS: allowedOrigins.join(','),
      },
    });

    const getProductById = new lambda.Function(this, 'GetProductByIdFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      handler: 'handlers/index.getProductsById',
      code: lambda.Code.fromAsset(path.join(__dirname, './')),
      environment: {
        ALLOWED_ORIGINS: allowedOrigins.join(','),
      },
    });

    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: `Product Service API ${stageName}`,
      description: `API for product service endpoints (${stageName}).`,
      deployOptions: {
        stageName,
      },
    });

    const stageUrl = buildStageUrl(api, this, api.deploymentStage.stageName);

    const getProductsListIntegration = new apigateway.LambdaIntegration(getProductsList);

    const productsResource = api.root.addResource('products');

    productsResource.addMethod('GET', getProductsListIntegration, {
      methodResponses: [{ statusCode: '200' }],
    });

    productsResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: ['GET'],
    });

    new cdk.CfnOutput(this, 'ProductsApiUrl', {
      description: `GET products endpoint for PLP frontend integration (${stageName}).`,
      value: `${stageUrl}products`,
    });

    const getProductByIdIntegration = new apigateway.LambdaIntegration(getProductById);
    const productResource = productsResource.addResource('{id}');

    productResource.addMethod('GET', getProductByIdIntegration, {
      methodResponses: [{ statusCode: '200' }],
    });

    productResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: ['GET'],
    });

    new cdk.CfnOutput(this, 'ProductByIdApiUrl', {
      description: `GET product by id endpoint for PDP frontend integration (${stageName}).`,
      value: `${stageUrl}products/{id}`,
    });
  }
}
