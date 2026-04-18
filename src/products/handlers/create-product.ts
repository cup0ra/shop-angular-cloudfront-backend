import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, getErrorMessage, getRequestOrigin } from '../utils';
import { marshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { dynamoDB, productTableName, stockTableName } from '../db';

const createProductSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().positive(),
  count: z.number().int().nonnegative(),
});

type CreateProductBody = z.infer<typeof createProductSchema>;

export async function createProduct(event?: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('createProduct', { event });
  const origin = getRequestOrigin(event);
  try {
    if (!event?.body) {
      return createResponse(400, { message: 'Product data is required' }, origin);
    }

    let body: unknown;

    try {
      body = JSON.parse(event.body);
    } catch {
      return createResponse(400, { message: 'Invalid JSON body' }, origin);
    }

    const validationResult = createProductSchema.safeParse(body);

    if (!validationResult.success) {
      return createResponse(
        400,
        { message: 'Invalid product data', errors: validationResult.error.issues },
        origin
      );
    }

    const { count, ...productFields }: CreateProductBody = validationResult.data;
    const productId = uuidv4();

    const productItem = {
      id: productId,
      ...productFields,
    };

    const stockItem = {
      product_id: productId,
      count,
    };

    await dynamoDB.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: productTableName,
              Item: marshall(productItem),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Put: {
              TableName: stockTableName,
              Item: marshall(stockItem),
              ConditionExpression: 'attribute_not_exists(product_id)',
            },
          },
        ],
      })
    );

    return createResponse(201, { ...productItem, count }, origin);
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { message: getErrorMessage(error) }, origin);
  }
}
