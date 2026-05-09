import { S3Event } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { Product } from '../models';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const limit = pLimit(20);

export const importFileParser = async (event: S3Event): Promise<void> => {
  try {
    const record = event.Records[0];
    const bucketName = record.s3.bucket.name;
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log('Processing file:', {
      bucketName,
      objectKey,
    });

    const { Body } = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: objectKey })
    );

    if (!Body) {
      console.warn('Empty S3 object body');
    }

    await processCsvStream(Body as Readable);

    await transferFile(objectKey, bucketName);
    console.log('Successfully uploaded file');
  } catch (error) {
    console.error('importFileParser error:', error);
    throw error;
  }
};

async function transferFile(objectKey: string, bucketName: string): Promise<void> {
  try {
    const bucketUploadFolder = process.env.BUCKET_UPLOAD_FOLDER;
    const bucketParsedFolder = process.env.BUCKET_PARSED_FOLDER;
    const parsedKey = objectKey.replace(`${bucketUploadFolder}/`, `${bucketParsedFolder}/`);

    await s3Client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${objectKey}`,
        Key: parsedKey,
      })
    );

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      })
    );
  } catch (error) {
    console.error('transferFile error:', error);
  }
}

function processCsvStream(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const allPromises: Promise<void>[] = [];
    let batch: Partial<Product>[] = [];
    let totalRows = 0;
    let totalBatches = 0;
    const csvStream = stream.pipe(csv());

    const batchSize = Number(process.env.BATCH_SIZE);
    csvStream
      .on('data', row => {
        totalRows++;
        const product = mapCsvRecordToProduct(row);
        batch.push(product);
        if (batch.length === batchSize) {
          totalBatches++;
          const currentBatch = [...batch];
          batch = [];
          allPromises.push(limit(() => sendBatchToSqs(currentBatch)));
        }
      })
      .on('end', async () => {
        if (batch.length > 0) {
          totalBatches++;
          allPromises.push(limit(() => sendBatchToSqs(batch)));
        }
        await Promise.all(allPromises);
        console.log(`Total rows processed: ${totalRows}`);
        console.log(`Total batches sent: ${totalBatches}`);
        resolve();
      })
      .on('error', error => {
        console.error('CSV parsing error:', error);
        limit.clearQueue();
        reject(error);
      });
  });
}

async function sendBatchToSqs(products: Partial<Product>[]): Promise<void> {
  const queueUrl = process.env.QUEUE_URL;

  if (!queueUrl) {
    throw new Error('QUEUE_URL is not defined');
  }

  if (!products.length) {
    return;
  }

  await sqsClient.send(
    new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: products.map((product, index) => ({
        Id: uuidv4(),
        MessageBody: JSON.stringify(product),
      })),
    })
  );
}

function mapCsvRecordToProduct(record: Record<string, string>): Partial<Product> {
  return {
    title: record.title,
    description: record.description,
    price: Number(record.price),
    count: Number(record.count),
  };
}
