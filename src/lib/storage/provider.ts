import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

// Extension comes from the allow-listed MIME type, never from the client file name (no "/" or ".." in keys).
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const ALLOWED_MIME_TYPES = Object.keys(EXTENSION_BY_MIME);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export type StorageFolder =
  | `lands/${string}/images`
  | `lands/${string}/documents`
  | `leads/${string}/attachments`
  | `submissions/${string}/images`
  | `submissions/${string}/documents`
  | `blog/${string}`
  | "public-assets";

function getS3Client() {
  return new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT!,
    region: process.env.DO_SPACES_REGION ?? "sgp1",
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
    forcePathStyle: false,
  });
}

function isPrivateFolder(folder: StorageFolder): boolean {
  return folder.endsWith("/documents") || folder.includes("/attachments");
}

function generateUuid(): string {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function generatePresignedUpload(opts: {
  folder: StorageFolder;
  mimeType: string;
  fileSize: number;
  originalName: string;
}): Promise<{ uploadUrl: string; storageKey: string; cdnUrl: string | null }> {
  if (!ALLOWED_MIME_TYPES.includes(opts.mimeType)) {
    throw new Error(`File type not allowed: ${opts.mimeType}`);
  }
  if (opts.fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large: max ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  const ext = EXTENSION_BY_MIME[opts.mimeType];
  const uuid = generateUuid();
  const storageKey = `${opts.folder}/${uuid}.${ext}`;
  const isPrivate = isPrivateFolder(opts.folder);

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET!,
    Key: storageKey,
    ContentType: opts.mimeType,
    ContentLength: opts.fileSize,
    ACL: isPrivate ? "private" : "public-read",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });

  const cdnBase = process.env.DO_SPACES_CDN_BASE;
  const cdnUrl = !isPrivate && cdnBase ? `${cdnBase}/${storageKey}` : null;

  return { uploadUrl, storageKey, cdnUrl };
}

export async function deleteStorageObject(storageKey: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET!,
      Key: storageKey,
    })
  );
}

export async function getStorageObjectMetadata(storageKey: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const client = getS3Client();
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: process.env.DO_SPACES_BUCKET!,
        Key: storageKey,
      })
    );
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      contentType: result.ContentType ?? null,
    };
  } catch {
    return null;
  }
}

export async function headStorageObject(storageKey: string): Promise<boolean> {
  return (await getStorageObjectMetadata(storageKey)) !== null;
}

export function storagePublicUrl(storageKey: string): string | null {
  const cdnBase = process.env.DO_SPACES_CDN_BASE?.replace(/\/$/, "");
  return cdnBase ? `${cdnBase}/${storageKey}` : null;
}
