export type ApiGatewayEvent = {
  headers?: Record<string, string | undefined> | null;
  pathParameters?: Record<string, string | undefined> | null;
};

export type ApiGatewayResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  count: number;
}