import * as fs from 'fs';
import * as path from 'path';
import { AzureClient } from '../services/azure';

interface FileInfo {
  path: string;
  content: string;
  hash: string;
  lastModified: string;
  fileType: string;
}

interface WorkspaceMetadata {
  path: string;
  lastIndexed: string;
  fileCount: number;
}

export class MemoryManager {
  private azureClient: AzureClient;
  private localCachePath: string;
  private fileCount: number = 0;

  constructor(azureClient: AzureClient) {
    this.azureClient = azureClient;
    
    // Setup local cache directory
    this.localCachePath = process.env.KODER_MEMORY_PATH || path.join(process.cwd(), '.koder-cache');
    if (!fs.existsSync(this.localCachePath)) {
      fs.mkdirSync(this.localCachePath, { recursive: true });
    }
  }

  public async storeFile(fileInfo: FileInfo): Promise<void> {
    try {
      // Store in local cache
      await this.storeFileLocally(fileInfo);
      
      // Store in Azure Blob Storage for persistence
      await this.azureClient.storeBlob(`files/${fileInfo.hash}`, fileInfo.content);
      
      // Store metadata in Cosmos DB
      await this.azureClient.storeDocument('files', {
        id: fileInfo.hash,
        path: fileInfo.path,
        lastModified: fileInfo.lastModified,
        fileType: fileInfo.fileType,
        size: fileInfo.content.length
      });
      
      this.fileCount++;
    } catch (error) {
      console.error(`Failed to store file ${fileInfo.path}:`, error);
      throw error;
    }
  }

  private async storeFileLocally(fileInfo: FileInfo): Promise<void> {
    const filePath = path.join(this.localCachePath, fileInfo.hash);
    fs.writeFileSync(filePath, fileInfo.content);
    
    // Store a mapping from actual path to hash for quicker lookups
    const mappingsPath = path.join(this.localCachePath, 'path_mappings.json');
    let mappings: Record<string, string> = {};
    
    if (fs.existsSync(mappingsPath)) {
      mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    }
    
    mappings[fileInfo.path] = fileInfo.hash;
    fs.writeFileSync(mappingsPath, JSON.stringify(mappings, null, 2));
  }

  public async getFile(filePath: string): Promise<string | null> {
    try {
      // Check local cache first
      const mappingsPath = path.join(this.localCachePath, 'path_mappings.json');
      if (fs.existsSync(mappingsPath)) {
        const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
        const hash = mappings[filePath];
        
        if (hash) {
          const cachedPath = path.join(this.localCachePath, hash);
          if (fs.existsSync(cachedPath)) {
            return fs.readFileSync(cachedPath, 'utf8');
          }
        }
      }
      
      // If not in local cache, try Azure
      const fileMetadata = await this.azureClient.queryDocuments('files', {
        query: 'SELECT * FROM c WHERE c.path = @path',
        parameters: [{ name: '@path', value: filePath }]
      });
      
      if (fileMetadata && fileMetadata.length > 0) {
        const content = await this.azureClient.getBlob(`files/${fileMetadata[0].id}`);
        // Cache it locally for next time
        if (content) {
          this.storeFileLocally({
            path: filePath,
            content,
            hash: fileMetadata[0].id,
            lastModified: fileMetadata[0].lastModified,
            fileType: fileMetadata[0].fileType
          });
        }
        return content;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to retrieve file ${filePath}:`, error);
      return null;
    }
  }

  public async saveWorkspaceMetadata(metadata: WorkspaceMetadata): Promise<void> {
    try {
      // Store locally
      const metadataPath = path.join(this.localCachePath, 'workspace_metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Store in Cosmos DB
      await this.azureClient.storeDocument('metadata', {
        id: 'workspace',
        ...metadata
      });
    } catch (error) {
      console.error('Failed to save workspace metadata:', error);
      throw error;
    }
  }

  public getFileCount(): number {
    return this.fileCount;
  }

  public async search(query: string): Promise<any[]> {
    // Implement search functionality using Azure Cognitive Search
    return this.azureClient.searchCode(query);
  }
}