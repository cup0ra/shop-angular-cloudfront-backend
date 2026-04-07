import { createResponse, getErrorMessage, getProducts, getRequestOrigin } from '../shared/helpers';
import { ApiGatewayEvent } from '../shared/types';

export async function getProductsList(event?: ApiGatewayEvent) {
  try {
    return createResponse(200, getProducts(), getRequestOrigin(event));
  } catch (error) {
    return createResponse(500, { message: getErrorMessage(error) }, getRequestOrigin(event));
  }
}