import { S3Event } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import csv from 'csv-parser';
import { Readable } from 'stream';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const importFileParser = async (event: S3Event): Promise<void> => {
  try {
    for (const record of event.Records) {
      const bucketName = record.s3.bucket.name;
      const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      console.log('Processing file:', {
        bucketName,
        objectKey,
      });

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        console.warn('Empty S3 object body');
        continue;
      }

      await parseCsvStream(response.Body as Readable);

      await transferFile(objectKey, bucketName);
      console.log('Successfully uploaded file');
    }
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

function parseCsvStream(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', data => {
        console.log('CSV record:', data);
      })
      .on('end', () => {
        console.log('CSV parsing completed');
        resolve();
      })
      .on('error', error => {
        console.error('CSV parsing error:', error);
        reject(error);
      });
  });
}
