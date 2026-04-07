import { products } from '../data/products';
import { ApiGatewayEvent, ApiGatewayResponse } from './types';

function getAllowedOrigins() {
  return process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? [];
}

export function getResponseHeaders(origin?: string) {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] ?? '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Content-Type': 'application/json',
  };
}

export function getRequestOrigin(event?: ApiGatewayEvent) {
  return event?.headers?.origin ?? event?.headers?.Origin;
}

export function getProductId(event?: ApiGatewayEvent) {
  return event?.pathParameters?.id;
}

export function createResponse(statusCode: number, payload: unknown, origin?: string): ApiGatewayResponse {
  return {
    statusCode,
    headers: getResponseHeaders(origin),
    body: JSON.stringify(payload),
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function getProducts() {
  if (!products) {
    throw new Error('Products data is not available');
  }

  return products;
}

export function findProductById(id: string) {
  return getProducts().find(product => product.id === id);
}