import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";

export type { StorageProvider } from "./types";

let _storage: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (_storage) return _storage;

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    // Lazy-load Azure provider only when configured
    const { AzureBlobStorageProvider } = require("./azure");
    _storage = new AzureBlobStorageProvider();
  } else {
    _storage = new LocalStorageProvider();
  }

  return _storage!;
}
