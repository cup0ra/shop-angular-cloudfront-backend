import { APIGatewayProxyEvent } from 'aws-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PublishCommand } from '@aws-sdk/client-sns';
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  catalogBatchProcess,
  getProductsById,
  getProductsList,
  importFileParser,
  importProductFile,
  products,
} from '../src/products';

const mockUuid = 'test-product-id';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => mockUuid),
}));

jest.mock('../src/products/db', () => ({
  ...jest.requireActual('../src/products/db'),
  dynamoDB: { send: jest.fn() },
  productTableName: 'products-table',
  stockTableName: 'stocks-table',
}));

jest.mock('@aws-sdk/client-sns', () => {
  const actual = jest.requireActual('@aws-sdk/client-sns');
  const mockSend = jest.fn();

  return {
    ...actual,
    __mockSnsSend: mockSend,
    SNSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

const mockDynamoSend = (jest.requireMock('../src/products/db') as { dynamoDB: { send: jest.Mock } })
  .dynamoDB.send;
const mockSnsSend = (jest.requireMock('@aws-sdk/client-sns') as { __mockSnsSend: jest.Mock })
  .__mockSnsSend;

describe('Product Service handlers', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:4200,https://dzpenjz7rcmzz.cloudfront.net';
    process.env.BUCKET_NAME = 'products-bucket';
    process.env.BUCKET_UPLOAD_FOLDER = 'uploaded';
    process.env.TOPIC_ARN = 'arn:aws:sns:eu-west-1:123456789012:create-products';
    mockDynamoSend.mockReset();
    mockSnsSend.mockReset();
    jest.clearAllMocks();
  });

  test('getProductsList returns full products array', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Items: products.map(({ count, ...product }) => product),
      })
      .mockResolvedValueOnce({
        Items: products.map(product => ({
          product_id: product.id,
          count: product.count,
        })),
      });

    const response = await getProductsList({
      headers: { origin: 'http://localhost:4200' },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:4200');
    expect(JSON.parse(response.body)).toEqual(products);
  });

  test('getProductsById returns a product by id', async () => {
    mockDynamoSend.mockResolvedValue({
      Responses: {
        'products-table': [
          marshall({
            id: products[0].id,
            title: products[0].title,
            description: products[0].description,
            price: products[0].price,
          }),
        ],
        'stocks-table': [
          marshall({
            product_id: products[0].id,
            count: products[0].count,
          }),
        ],
      },
    });

    const response = await getProductsById({
      headers: { origin: 'http://localhost:4200' },
      pathParameters: { id: products[0].id },
    } as unknown as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(products[0]);
  });

  test('getProductsById returns 404 when product is not found', async () => {
    mockDynamoSend.mockResolvedValue({
      Responses: {},
    });

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

  test('importFileParser rejects malformed events without Records', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(importFileParser({} as never)).rejects.toBeInstanceOf(TypeError);

    expect(consoleErrorSpy).toHaveBeenCalledWith('importFileParser error:', expect.any(TypeError));

    consoleErrorSpy.mockRestore();
  });

  test('catalogBatchProcess stores valid products and publishes an SNS event', async () => {
    mockDynamoSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});

    await expect(
      catalogBatchProcess({
        Records: [
          {
            body: JSON.stringify({
              title: 'Product 1',
              description: 'First product',
              price: 10,
              count: 3,
            }),
            messageId: 'message-1',
          },
          {
            body: JSON.stringify({
              title: 'Product 2',
              description: 'Second product',
              price: 25,
              count: 7,
            }),
            messageId: 'message-2',
          },
        ],
      } as never)
    ).resolves.toBeUndefined();

    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
    expect(mockSnsSend).toHaveBeenCalledTimes(1);

    const firstTransaction = mockDynamoSend.mock.calls[0][0] as TransactWriteItemsCommand;
    expect(firstTransaction).toBeInstanceOf(TransactWriteItemsCommand);
    expect(firstTransaction.input).toEqual({
      TransactItems: [
        {
          Put: {
            TableName: 'products-table',
            Item: marshall({
              id: mockUuid,
              title: 'Product 1',
              description: 'First product',
              price: 10,
            }),
            ConditionExpression: 'attribute_not_exists(id)',
          },
        },
        {
          Put: {
            TableName: 'stocks-table',
            Item: marshall({
              product_id: mockUuid,
              count: 3,
            }),
            ConditionExpression: 'attribute_not_exists(product_id)',
          },
        },
      ],
    });

    const publishCommand = mockSnsSend.mock.calls[0][0] as PublishCommand;
    expect(publishCommand).toBeInstanceOf(PublishCommand);
    expect(publishCommand.input.TopicArn).toBe(process.env.TOPIC_ARN);
    expect(publishCommand.input.Subject).toBe('Products were created');
    expect(publishCommand.input.MessageAttributes).toEqual({
      productCount: {
        DataType: 'Number',
        StringValue: '2',
      },
    });

    const messageBody = JSON.parse(publishCommand.input.Message as string);
    expect(messageBody).toMatchObject({
      message: 'Products were successfully created',
      productsCount: 2,
      products: [
        {
          id: mockUuid,
          title: 'Product 1',
          description: 'First product',
          price: 10,
          count: 3,
        },
        {
          id: mockUuid,
          title: 'Product 2',
          description: 'Second product',
          price: 25,
          count: 7,
        },
      ],
    });
    expect(messageBody.createdAt).toEqual(expect.any(String));
  });

  test('catalogBatchProcess rejects invalid SQS records', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(
      catalogBatchProcess({
        Records: [
          {
            body: JSON.stringify({
              title: 'Broken product',
              description: 'Invalid payload',
              price: '10',
              count: 1,
            }),
            messageId: 'message-invalid',
          },
        ],
      } as never)
    ).rejects.toThrow('Invalid product data in SQS record message-invalid');

    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(mockSnsSend).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing record', expect.any(Error));
  });

  test('catalogBatchProcess fails when TOPIC_ARN is missing', async () => {
    delete process.env.TOPIC_ARN;
    mockDynamoSend.mockResolvedValue({});

    await expect(
      catalogBatchProcess({
        Records: [
          {
            body: JSON.stringify({
              title: 'Product 1',
              description: 'First product',
              price: 10,
              count: 3,
            }),
            messageId: 'message-1',
          },
        ],
      } as never)
    ).rejects.toThrow('TOPIC_ARN is not defined');

    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    expect(mockSnsSend).not.toHaveBeenCalled();
  });
});
