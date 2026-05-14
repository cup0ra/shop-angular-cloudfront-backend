#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib/core';
import { ProductServiceStack } from '../lib/product-service-stack';
import { ImportServiceStack } from '../lib/import-service-stack';
import { AuthorizationServiceStack } from '../lib/authorization-service-stack';

const app = new cdk.App();
const defaultStackProps = {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
};

const productServiceStackDev = new ProductServiceStack(app, 'ProductServiceStackDev', {
  ...defaultStackProps,
  stageName: 'dev',
});

const authorizationServiceStackDev = new AuthorizationServiceStack(
  app,
  'AuthorizationServiceStackDev',
  {
    ...defaultStackProps,
    stageName: 'dev',
  }
);

const importServiceStackDev = new ImportServiceStack(app, 'ImportServiceStackDev', {
  ...defaultStackProps,
  stageName: 'dev',
  catalogItemsQueue: productServiceStackDev.catalogItemsQueue,
  batchSize: productServiceStackDev.batchSize,
});
importServiceStackDev.addDependency(authorizationServiceStackDev);

const productServiceStackProd = new ProductServiceStack(app, 'ProductServiceStackProd', {
  ...defaultStackProps,
  stageName: 'prod',
});

const authorizationServiceStackProd = new AuthorizationServiceStack(
  app,
  'AuthorizationServiceStackProd',
  {
    ...defaultStackProps,
    stageName: 'prod',
  }
);

const importServiceStackProd = new ImportServiceStack(app, 'ImportServiceStackProd', {
  ...defaultStackProps,
  stageName: 'prod',
  catalogItemsQueue: productServiceStackProd.catalogItemsQueue,
  batchSize: productServiceStackProd.batchSize,
});
importServiceStackProd.addDependency(authorizationServiceStackProd);
