import type { SQSEvent } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDB, productTableName, stockTableName } from '../db';
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createProductSchema } from '../utils';
import { z } from 'zod';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Product } from '../models';

const snsClient = new SNSClient({ region: process.env.AWS_REGION });

type CreateProductBody = z.infer<typeof createProductSchema>;

export const catalogBatchProcess = async (event: SQSEvent): Promise<void> => {
  const createdProducts: Product[] = [];
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const validationResult = createProductSchema.safeParse(body);
      if (!validationResult.success) {
        throw new Error(
          `Invalid product data in SQS record ${record.messageId}: ${JSON.stringify(
            validationResult.error.issues
          )}`
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

      createdProducts.push({ ...validationResult.data, id: productId });
    } catch (error) {
      console.error('Error processing record', error);
      throw error;
    }
  }

  if (createdProducts.length > 0) {
    await publishCreateProductsEvent(createdProducts);
  }
};

const publishCreateProductsEvent = async (products: Product[]): Promise<void> => {
  const topicArn = process.env.TOPIC_ARN;

  if (!topicArn) {
    throw new Error('TOPIC_ARN is not defined');
  }

  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: 'Products were created',
      Message: JSON.stringify(
        {
          message: 'Products were successfully created',
          productsCount: products.length,
          products,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      ),
      MessageAttributes: {
        productCount: {
          DataType: 'Number',
          StringValue: String(products.length),
        },
      },
    })
  );
};
