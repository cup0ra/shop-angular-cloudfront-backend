import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { Product } from '../models';
import { products } from '../db/products';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda/trigger/api-gateway-proxy';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { z } from 'zod';

function getAllowedOrigins(): string[] {
  return (
    process.env.ALLOWED_ORIGINS?.split(',')
      .map(origin => origin.trim())
      .filter(Boolean) ?? []
  );
}

export function getResponseHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Content-Type': 'application/json',
  };
}

export function getRequestOrigin(event?: APIGatewayProxyEvent): string | undefined {
  return event?.headers?.origin ?? event?.headers?.Origin;
}

export function getProductId(event?: APIGatewayProxyEvent): string | undefined {
  return event?.pathParameters?.id;
}

export function createResponse(
  statusCode: number,
  payload: unknown,
  origin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: getResponseHeaders(origin),
    body: JSON.stringify(payload),
  };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function getProducts(): Promise<Product[]> {
  if (!products) {
    throw new Error('Products data is not available');
  }

  return Promise.resolve(products);
}

export async function findProductById(id: string): Promise<Product | undefined> {
  const products = await getProducts();
  return Promise.resolve(products.find(product => product.id === id));
}

export async function scanAll(
  client: DynamoDBDocumentClient,
  tableName: string
): Promise<Record<string, NativeAttributeValue>[]> {
  const items: Record<string, NativeAttributeValue>[] = [];
  let lastEvaluatedKey: Record<string, NativeAttributeValue> | undefined;

  do {
    const params: ScanCommandInput = { TableName: tableName, ExclusiveStartKey: lastEvaluatedKey };
    const result = await client.send(new ScanCommand(params));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey !== undefined);

  return items;
}

export const allowedOriginsByStage: Record<string, string[]> = {
  dev: ['*'],
  prod: ['https://dzpenjz7rcmzz.cloudfront.net'],
};

export function buildStageUrl(api: apigateway.RestApi, stack: cdk.Stack, stageName: string) {
  return `https://${api.restApiId}.execute-api.${stack.region}.${stack.urlSuffix}/${stageName}/`;
}

export const createProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().positive(),
  count: z.number().int().nonnegative(),
});
