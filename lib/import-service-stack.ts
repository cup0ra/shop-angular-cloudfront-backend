import { StackProps, Stack, aws_s3, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createLambda } from './lambda-factory';
import path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { buildStageUrl } from '../src/products';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';

const { HttpMethods, EventType } = aws_s3;

interface ImportServiceStackProps extends StackProps {
  stageName: string;
  batchSize: string;
  catalogItemsQueue: sqs.IQueue;
}

export class ImportServiceStack extends Stack {
  public readonly batchSize: string;
  public readonly queueUrl: string;
  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    const { stageName, batchSize, catalogItemsQueue } = props;
    this.batchSize = batchSize;
    this.queueUrl = catalogItemsQueue.queueUrl;
    const bucketName = `cup0ra-product-file-bucket-${stageName}`;
    const bucketUploadFolder = 'uploaded';
    const bucketParsedFolder = 'parsed';
    const allowedOrigins = stageName === 'prod' ? ['https://dzpenjz7rcmzz.cloudfront.net'] : ['*'];

    const productFileBucket = this.createBucket(bucketName, allowedOrigins);
    const { importProductFile, importFileParser } = this.createLambdas(
      bucketName,
      bucketUploadFolder,
      bucketParsedFolder
    );

    this.configureApi({ importProductFile, importFileParser, allowedOrigins, stageName });

    productFileBucket.grantPut(importProductFile, `${bucketUploadFolder}/*`);
    productFileBucket.grantRead(importFileParser, `${bucketUploadFolder}/*`);
    productFileBucket.grantDelete(importFileParser, `${bucketUploadFolder}/*`);
    productFileBucket.grantPut(importFileParser, `${bucketParsedFolder}/*`);
    props.catalogItemsQueue.grantSendMessages(importFileParser);

    productFileBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParser),
      {
        prefix: `${bucketUploadFolder}/`,
      }
    );
  }

  private createBucket(bucketName: string, allowedOrigins: string[]): aws_s3.Bucket {
    return new aws_s3.Bucket(this, 'ProductFileBucket', {
      bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.POST, HttpMethods.PUT],
          allowedOrigins,
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Amz-Date',
            'X-Api-Key',
            'X-Amz-Security-Token',
          ],
        },
      ],
    });
  }

  private createLambdas(
    bucketName: string,
    bucketUploadFolder: string,
    bucketParsedFolder: string
  ): Record<string, lambda.Function> {
    const entry = path.join(__dirname, '../src/products/index.ts');
    const environment = {
      BUCKET_NAME: bucketName,
      BUCKET_UPLOAD_FOLDER: bucketUploadFolder,
      BUCKET_PARSED_FOLDER: bucketParsedFolder,
      QUEUE_URL: this.queueUrl,
      BATCH_SIZE: this.batchSize,
    };
    const importProductFile = createLambda(this, 'ImportProductFileFunction', {
      entry,
      environment,
      handler: 'importProductFile',
      description: 'Generates a pre-signed URL for uploading product files to S3',
    });

    const importFileParser = createLambda(this, 'ImportFileFunction', {
      entry,
      environment,
      handler: 'importFileParser',
      description: 'Parses uploaded product files and moves them to the parsed folder in S3',
    });

    return { importProductFile, importFileParser };
  }

  private configureApi(params: {
    allowedOrigins: string[];
    stageName: string;
    importProductFile: lambda.Function;
    importFileParser: lambda.Function;
  }) {
    const { allowedOrigins, stageName, importProductFile, importFileParser } = params;

    const api = new apigateway.RestApi(this, 'ImportServiceApi', {
      restApiName: `Import Service API ${stageName}`,
      description: `API for import service endpoints (${stageName}).`,
      deployOptions: {
        stageName,
      },
    });

    const stageUrl = buildStageUrl(api, this, api.deploymentStage.stageName);
    const importResource = api.root.addResource('import');

    importResource.addMethod('GET', new apigateway.LambdaIntegration(importProductFile));

    importResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: [HttpMethods.GET, HttpMethods.POST, HttpMethods.PUT, HttpMethods.DELETE],
    });
    new CfnOutput(this, 'ImportApiUrl', {
      value: `${stageUrl}import`,
    });
  }
}
