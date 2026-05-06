import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createResponse, getRequestOrigin } from '../utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({});

export async function importProductFile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('importProductFile');
    const origin = getRequestOrigin(event);
    const fileName = event.queryStringParameters?.name;
    if (!fileName) {
      return createResponse(400, { message: 'File name is required' }, origin);
    }
    console.log(`File name: ${fileName}`);
    const bucketName = process.env.BUCKET_NAME;
    const bucketFolder = process.env.BUCKET_UPLOAD_FOLDER;
    if (!bucketName) {
      return createResponse(500, { message: 'Bucket name is not configured' }, origin);
    }
    console.log(`Bucket name: ${bucketName}`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: `${bucketFolder}/${fileName}`,
      ContentType: 'text/csv',
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
    console.log(`Signed URL: ${signedUrl}`);

    return createResponse(200, { url: signedUrl }, origin);
  } catch (error) {
    console.error(error);
    return createResponse(
      500,
      { message: 'Could not generate signed URL' },
      getRequestOrigin(event)
    );
  }
}
