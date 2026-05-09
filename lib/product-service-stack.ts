import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { createLambda } from './lambda-factory';
import { allowedOriginsByStage, buildStageUrl } from '../src/products';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

type ProductServiceStackProps = cdk.StackProps & {
  stageName: string;
};

export class ProductServiceStack extends cdk.Stack {
  private productTableName = 'Products';
  private stockTableName = 'Stock';
  public readonly batchSize = '5';
  public readonly catalogItemsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: ProductServiceStackProps) {
    super(scope, id, props);

    const { stageName } = props;
    const allowedOrigins = allowedOriginsByStage[stageName] ?? [];

    const { productsTable, stockTable } = this.createTables(stageName);
    this.catalogItemsQueue = this.createQueue(stageName);
    const createProductTopic = this.createTopic(stageName);
    const environment = this.createEnvironment(
      allowedOrigins,
      stageName,
      this.catalogItemsQueue.queueUrl,
      createProductTopic.topicArn
    );

    const { getProductsList, getProductById, createProduct, catalogBatchProcess } =
      this.createLambdas(environment);

    catalogBatchProcess.addEventSource(
      new lambdaEventSources.SqsEventSource(this.catalogItemsQueue, {
        batchSize: +this.batchSize,
        reportBatchItemFailures: true,
      })
    );

    createProductTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('aropuc@outlook.com')
    );

    createProductTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('aropuc@mail.ru', {
        filterPolicy: {
          productCount: sns.SubscriptionFilter.numericFilter({
            greaterThan: 2,
          }),
        },
      })
    );

    productsTable.grantReadData(getProductsList);
    productsTable.grantReadData(catalogBatchProcess);
    stockTable.grantReadData(getProductsList);
    stockTable.grantReadData(catalogBatchProcess);
    productsTable.grantReadData(getProductById);
    stockTable.grantReadData(getProductById);
    productsTable.grantWriteData(createProduct);
    productsTable.grantWriteData(catalogBatchProcess);
    stockTable.grantWriteData(createProduct);
    stockTable.grantWriteData(catalogBatchProcess);
    createProductTopic.grantPublish(catalogBatchProcess);

    this.configureApi({
      allowedOrigins,
      stageName,
      getProductsList,
      getProductById,
      createProduct,
    });
  }

  private createEnvironment(
    allowedOrigins: string[],
    stageName: string,
    queueUrl: string,
    topicArn: string
  ) {
    return {
      ALLOWED_ORIGINS: allowedOrigins.join(','),
      PRODUCT_TABLE_NAME: this.productTableName + (stageName ? `-${stageName}` : ''),
      STOCK_TABLE_NAME: this.stockTableName + (stageName ? `-${stageName}` : ''),
      QUEUE_URL: queueUrl,
      BATCH_SIZE: this.batchSize,
      TOPIC_ARN: topicArn,
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
      environment,
      handler: 'getProductsList',
      description: 'Retrieves the list of products from the database',
    });

    const getProductById = createLambda(this, 'GetProductByIdFunction', {
      entry,
      environment,
      handler: 'getProductsById',
      description: 'Retrieves a product by its ID from the database',
    });

    const createProduct = createLambda(this, 'CreateProduct', {
      entry,
      environment,
      handler: 'createProduct',
      description: 'Creates a new product in the database',
    });

    const catalogBatchProcess = createLambda(this, 'CatalogBatchProcess', {
      entry,
      environment,
      handler: 'catalogBatchProcess',
      description: 'Retrieves the catalog product by the database',
    });

    return { getProductsList, getProductById, createProduct, catalogBatchProcess };
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

  createQueue(stageName: string): Queue {
    return new sqs.Queue(this, 'CatalogItemsQueue', {
      queueName: `catalogItemsQueue-${stageName}`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
    });
  }

  createTopic(stageName: string): sns.Topic {
    return new sns.Topic(this, 'CreateProductTopic', {
      topicName: `createProductTopic-${stageName}`,
      displayName: 'Create Product Topic',
    });
  }
}
