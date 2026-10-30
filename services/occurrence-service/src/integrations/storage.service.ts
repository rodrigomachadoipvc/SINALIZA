import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import { OCCURRENCE_CONFIG, type OccurrenceConfig, type StorageConfig } from '../config.js';

function client(config: StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });
}

/**
 * Photos live in the S3-compatible storage (RNF11); the database stores only the key.
 * Reads use pre-signed GET URLs signed for the public endpoint, so the app downloads directly.
 */
@Injectable()
export class StorageService {
  private readonly internal: S3Client;
  private readonly publicSigner: S3Client;
  private readonly bucket: string;

  constructor(@Inject(OCCURRENCE_CONFIG) private readonly config: OccurrenceConfig) {
    this.internal = client(config.storage, config.storage.endpoint);
    this.publicSigner = client(config.storage, config.storage.publicEndpoint);
    this.bucket = config.storage.bucket;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internal.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  /** GET URL valid for PHOTO_URL_TTL_SECONDS (15 min by default). */
  signedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.publicSigner,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: this.config.photoUrlTtlSeconds,
      },
    );
  }
}
