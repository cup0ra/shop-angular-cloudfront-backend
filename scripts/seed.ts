import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Product, products } from '../src/products';
import { marshall } from '@aws-sdk/util-dynamodb';

const dynamoDB = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

const stage = process.env.STAGE ?? 'dev';
const productTableName = process.env.PRODUCT_TABLE_NAME ?? `Products-${stage}`;
const stockTableName = process.env.STOCK_TABLE_NAME ?? `Stock-${stage}`;

async function createSeedProduct(product: Product): Promise<void> {
  const productId = uuidv4();

  const productItem = {
    id: productId,
    title: product.title,
    description: product.description,
    price: product.price,
  };

  const stockItem = {
    product_id: productId,
    count: product.count,
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

  console.log(`Created product: ${product.title} (${productId})`);
}

async function seed(): Promise<void> {
  try {
    for (const product of products) {
      await createSeedProduct(product);
    }

    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

void seed();
