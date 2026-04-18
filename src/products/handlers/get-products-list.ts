import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, productTableName, stockTableName } from '../db';
import { createResponse, getErrorMessage, getProducts, getRequestOrigin } from '../utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export async function getProductsList(
  event?: APIGatewayProxyEvent,
  context?: Context
): Promise<APIGatewayProxyResult> {
  console.log('getProductsList', { event, context });
  try {
    const products = await dynamoDB.send(new ScanCommand({ TableName: productTableName }));
    const counts = await dynamoDB.send(new ScanCommand({ TableName: stockTableName }));
    const productsWithStock = products.Items?.map(product => {
      const stockItem = counts.Items?.find(stock => stock.product_id === product.id);
      return {
        ...product,
        count: stockItem ? stockItem.count : 0,
      };
    });
    console.log('productsWithStock', productsWithStock);
    return createResponse(200, productsWithStock, getRequestOrigin(event));
  } catch (error) {
    console.error(error);
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}
