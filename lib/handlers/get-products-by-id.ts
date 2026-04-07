import { createResponse, findProductById, getErrorMessage, getProductId, getRequestOrigin } from '../shared/helpers';
import { ApiGatewayEvent } from '../shared/types';

export async function getProductsById(event?: ApiGatewayEvent) {
  try {
    const productId = getProductId(event);

    if (!productId) {
      return createResponse(400, { message: 'Product id is required' }, getRequestOrigin(event));
    }

    const product = findProductById(productId);

    if (!product) {
      return createResponse(404, { message: 'Product not found' }, getRequestOrigin(event));
    }

    return createResponse(200, product, getRequestOrigin(event));
  } catch (error) {
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}