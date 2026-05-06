import { APIGatewayProxyEvent } from 'aws-lambda';
import { getProductsById, getProductsList, products } from '../src/products';

describe('Product Service handlers', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:4200,https://dzpenjz7rcmzz.cloudfront.net';
  });

  test('getProductsList returns full products array', async () => {
    const response = await getProductsList({
      headers: { origin: 'http://localhost:4200' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:4200');
    expect(JSON.parse(response.body)).toEqual(products);
  });

  test('getProductsById returns a product by id', async () => {
    const response = await getProductsById({
      headers: { origin: 'http://localhost:4200' },
      pathParameters: { id: products[0].id },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(products[0]);
  });

  test('getProductsById returns 404 when product is not found', async () => {
    const response = await getProductsById({
      headers: { origin: 'http://localhost:4200' },
      pathParameters: { id: 'missing-product-id' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ message: 'Product not found' });
  });

  test('getProductsById returns 400 when id is missing', async () => {
    const response = await getProductsById({
      headers: { origin: 'http://localhost:4200' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'Product id is required' });
  });
});
