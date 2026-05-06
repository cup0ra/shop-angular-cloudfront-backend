import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dynamoDB = new DynamoDBClient({ region: process.env.AWS_REGION });

const productTableName = process.env.PRODUCT_TABLE_NAME as string;
const stockTableName = process.env.STOCK_TABLE_NAME as string;

export { dynamoDB, productTableName, stockTableName };
