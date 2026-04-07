import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { createLambda } from './lambda-factory';

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

  const getProductsList = createLambda(this, 'GetProductsListFunction', {
    entry: path.join(__dirname, '../src/products/index.ts'),
      handler: 'getProductsList',
      memorySize: 1024,
      timeout: 5,
      environment: {
        ALLOWED_ORIGINS: allowedOrigins.join(','),
      },
    });

    const getProductById = createLambda(this, 'GetProductByIdFunction', {
      entry: path.join(__dirname, '../src/products/index.ts'),
      handler: 'getProductsById',
      memorySize: 1024,
      timeout: 5,
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
