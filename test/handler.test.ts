import { APIGatewayProxyEvent } from 'aws-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getProductsById,
  getProductsList,
  importFileParser,
  importProductFile,
  products,
} from '../src/products';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('Product Service handlers', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:4200,https://dzpenjz7rcmzz.cloudfront.net';
    process.env.BUCKET_NAME = 'products-bucket';
    process.env.BUCKET_UPLOAD_FOLDER = 'uploaded';
    jest.clearAllMocks();
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

  test('importProductFile returns a signed URL for the requested file', async () => {
    const mockedGetSignedUrl = jest.mocked(getSignedUrl);
    mockedGetSignedUrl.mockResolvedValue('https://signed-url');

    const response = await importProductFile({
      headers: { origin: 'http://localhost:4200' },
      queryStringParameters: { name: 'products.csv' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:4200');
    expect(JSON.parse(response.body)).toEqual({ url: 'https://signed-url' });
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);

    const [, command, options] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input).toEqual({
      Bucket: 'products-bucket',
      Key: 'uploaded/products.csv',
      ContentType: 'text/csv',
    });
    expect(options).toEqual({ expiresIn: 3600 });
  });

  test('importProductFile returns 400 when file name is missing', async () => {
    const response = await importProductFile({
      headers: { origin: 'http://localhost:4200' },
      queryStringParameters: {},
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'File name is required' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test('importProductFile returns 500 when bucket name is not configured', async () => {
    delete process.env.BUCKET_NAME;

    const response = await importProductFile({
      headers: { origin: 'http://localhost:4200' },
      queryStringParameters: { name: 'products.csv' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ message: 'Bucket name is not configured' });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test('importProductFile returns 500 when signed URL generation fails', async () => {
    jest.mocked(getSignedUrl).mockRejectedValue(new Error('presigner failed'));

    const response = await importProductFile({
      headers: { origin: 'http://localhost:4200' },
      queryStringParameters: { name: 'products.csv' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ message: 'Could not generate signed URL' });
  });

  test('importFileParser skips malformed events without Records', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(importFileParser({} as never)).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'importFileParser received an event without S3 records',
      {
        eventType: 'object',
        topLevelKeys: [],
      }
    );

    consoleErrorSpy.mockRestore();
  });
});
