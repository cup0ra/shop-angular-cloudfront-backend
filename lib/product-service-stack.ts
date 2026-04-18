import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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
  private productTableName = 'Products';
  private stockTableName = 'Stock';

  constructor(scope: Construct, id: string, props: ProductServiceStackProps) {
    super(scope, id, props);

    const { stageName } = props;
    const allowedOrigins = getAllowedOrigins(stageName);

    const environment = this.createEnvironment(allowedOrigins, stageName);
    const { productsTable, stockTable } = this.createTables(stageName);
    const { getProductsList, getProductById, createProduct } = this.createLambdas(environment);

    productsTable.grantReadData(getProductsList);
    stockTable.grantReadData(getProductsList);
    productsTable.grantReadData(getProductById);
    stockTable.grantReadData(getProductById);
    productsTable.grantWriteData(createProduct);
    stockTable.grantWriteData(createProduct);

    this.configureApi({
      allowedOrigins,
      stageName,
      getProductsList,
      getProductById,
      createProduct,
    });
  }

  private createEnvironment(allowedOrigins: string[], stageName?: string) {
    return {
      ALLOWED_ORIGINS: allowedOrigins.join(','),
      PRODUCT_TABLE_NAME: this.productTableName + (stageName ? `-${stageName}` : ''),
      STOCK_TABLE_NAME: this.stockTableName + (stageName ? `-${stageName}` : ''),
    };
  }

  private createTables(stageName?: string) {
    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: this.productTableName + (stageName ? `-${stageName}` : ''),
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    const stockTable = new dynamodb.Table(this, 'StockTable', {
      tableName: this.stockTableName + (stageName ? `-${stageName}` : ''),
      partitionKey: {
        name: 'product_id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    return { productsTable, stockTable };
  }

  private createLambdas(environment: Record<string, string>) {
    const entry = path.join(__dirname, '../src/products/index.ts');

    const getProductsList = createLambda(this, 'GetProductsListFunction', {
      entry,
      handler: 'getProductsList',
      environment,
    });

    const getProductById = createLambda(this, 'GetProductByIdFunction', {
      entry,
      handler: 'getProductsById',
      environment,
    });

    const createProduct = createLambda(this, 'CreateProduct', {
      entry,
      handler: 'createProduct',
      environment,
    });

    return { getProductsList, getProductById, createProduct };
  }

  private configureApi(params: {
    allowedOrigins: string[];
    stageName: string;
    getProductsList: lambda.Function;
    getProductById: lambda.Function;
    createProduct: lambda.Function;
  }) {
    const { allowedOrigins, stageName, getProductsList, getProductById, createProduct } = params;

    const api = new apigateway.RestApi(this, 'ProductServiceApi', {
      restApiName: `Product Service API ${stageName}`,
      description: `API for product service endpoints (${stageName}).`,
      deployOptions: {
        stageName,
      },
    });

    const stageUrl = buildStageUrl(api, this, api.deploymentStage.stageName);
    const productsResource = api.root.addResource('products');

    productsResource.addMethod('GET', new apigateway.LambdaIntegration(getProductsList), {
      methodResponses: [{ statusCode: '200' }],
    });

    productsResource.addMethod('POST', new apigateway.LambdaIntegration(createProduct), {
      methodResponses: [{ statusCode: '201' }],
    });

    productsResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: ['GET', 'POST'],
    });

    const productResource = productsResource.addResource('{id}');
    productResource.addMethod('GET', new apigateway.LambdaIntegration(getProductById), {
      methodResponses: [{ statusCode: '200' }],
    });

    productResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: ['GET', 'POST'],
    });

    new cdk.CfnOutput(this, 'ProductsApiUrl', {
      description: `GET products endpoint for PLP frontend integration (${stageName}).`,
      value: `${stageUrl}products`,
    });

    new cdk.CfnOutput(this, 'ProductByIdApiUrl', {
      description: `GET product by id endpoint for PDP frontend integration (${stageName}).`,
      value: `${stageUrl}products/{id}`,
    });
  }
}
