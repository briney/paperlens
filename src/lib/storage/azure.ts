import { BlobServiceClient } from "@azure/storage-blob";
import type { StorageProvider } from "./types";

export class AzureBlobStorageProvider implements StorageProvider {
  private client: BlobServiceClient;
  private containerName: string;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING environment variable is not set"
      );
    }
    this.client = BlobServiceClient.fromConnectionString(connectionString);
    this.containerName =
      process.env.AZURE_STORAGE_CONTAINER ?? "paperlens-files";
  }

  private getContainerClient() {
    return this.client.getContainerClient(this.containerName);
  }

  private getBlobClient(path: string) {
    return this.getContainerClient().getBlockBlobClient(path);
  }

  async upload(
    path: string,
    data: Buffer,
    contentType?: string
  ): Promise<string> {
    const blob = this.getBlobClient(path);
    await blob.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType ?? "application/pdf" },
    });
    return path;
  }

  async download(path: string): Promise<Buffer> {
    const blob = this.getBlobClient(path);
    return blob.downloadToBuffer();
  }

  async delete(path: string): Promise<void> {
    const blob = this.getBlobClient(path);
    await blob.deleteIfExists();
  }

  async exists(path: string): Promise<boolean> {
    const blob = this.getBlobClient(path);
    return blob.exists();
  }

  async getUrl(path: string): Promise<string> {
    const blob = this.getBlobClient(path);
    return blob.url;
  }
}
