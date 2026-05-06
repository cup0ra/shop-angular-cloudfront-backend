import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ProductServiceStack } from '../lib/product-service-stack';

test('Creates products lambda and GET /products endpoint', () => {
  const app = new cdk.App();
  const stack = new ProductServiceStack(app, 'ProductServiceStackDev', {
    stageName: 'dev',
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.getProductsList',
    Runtime: 'nodejs20.x',
  });

  template.hasResourceProperties('AWS::ApiGateway::Method', {
    HttpMethod: 'GET',
  });

  template.hasOutput('ProductsApiUrl', {});
});
