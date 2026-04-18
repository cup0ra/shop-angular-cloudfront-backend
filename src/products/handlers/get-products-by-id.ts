import { BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import { dynamoDB, productTableName, stockTableName } from '../db';
import { createResponse, getErrorMessage, getProductId, getRequestOrigin } from '../utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export async function getProductsById(
  event?: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('getProductsById', { event });
  try {
    const productId = getProductId(event);
    if (!productId) {
      return createResponse(400, { message: 'Product id is required' }, getRequestOrigin(event));
    }

    const result = await dynamoDB.send(
      new BatchGetItemCommand({
        RequestItems: {
          [productTableName]: {
            Keys: [marshall({ id: productId })],
          },
          [stockTableName]: {
            Keys: [marshall({ product_id: productId })],
          },
        },
      })
    );
    const productItem = result.Responses?.[productTableName]?.[0];
    const stockItem = result.Responses?.[stockTableName]?.[0];

    if (!productItem) {
      return createResponse(404, { message: 'Product not found' }, getRequestOrigin(event));
    }

    const product = {
      ...unmarshall(productItem),
      count: stockItem ? unmarshall(stockItem).count : 0,
    };
    console.log('product', product);
    return createResponse(200, product, getRequestOrigin(event));
  } catch (error) {
    console.error(error);
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}
