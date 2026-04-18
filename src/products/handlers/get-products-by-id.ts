import { createResponse, findProductById, getErrorMessage, getProductId, getRequestOrigin } from '../utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export async function getProductsById(event?: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const productId =  getProductId(event);
    console.log("productId", productId);
    if (!productId) {
      return createResponse(400, { message: 'Product id is required' }, getRequestOrigin(event));
    }

    const product = await findProductById(productId);
    console.log("product", product);

    if (!product) {
      return createResponse(404, { message: 'Product not found' }, getRequestOrigin(event));
    }

    return createResponse(200, product, getRequestOrigin(event));
  } catch (error) {
    console.error(error);
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}