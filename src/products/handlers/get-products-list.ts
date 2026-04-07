import { createResponse, getErrorMessage, getProducts, getRequestOrigin } from '../utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export async function getProductsList(event?: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> {
  try {
    console.log("getProduct");
    const products = await getProducts();
    console.log("products", products);
    return createResponse(200, products, getRequestOrigin(event));
  } catch (error) {
    console.error(error);
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}