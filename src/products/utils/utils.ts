import { Product } from '../models';
import { products } from '../db/products';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda/trigger/api-gateway-proxy';

function getAllowedOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? [];
}

export function getResponseHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] ?? '*';

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

export function createResponse(statusCode: number, payload: unknown, origin?: string): APIGatewayProxyResult {
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