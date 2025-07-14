import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';

/**
 * Handles migration of cache files between different versions of the MultiJsonCommandProvider.
 * Prevents duplicate message sending when cache formats or locations change.
 */
export class CacheMigrator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Migrates cache files from old formats/locations to new ones
   */
  public migrateCacheFiles(providerName: string, newCacheDir: string): Set<string> {
    const processedItems = new Set<string>();
    
    // Try to find and migrate from various old cache file patterns
    const migrationSources = this.findLegacyCacheFiles(providerName);
    
    for (const source of migrationSources) {
      try {
        const migratedItems = this.migrateSingleCacheFile(source, providerName);
        migratedItems.forEach(item => processedItems.add(item));
        
        this.logger.info(`Migrated ${migratedItems.size} processed items from legacy cache: ${source.path}`);
        
        // Optionally backup the old file before removal
        this.backupLegacyFile(source.path);
        
      } catch (error) {
        this.logger.warn(`Failed to migrate cache file ${source.path}:`, error);
      }
    }

    if (processedItems.size > 0) {
      this.logger.info(`Cache migration completed: ${processedItems.size} total items migrated for provider ${providerName}`);
    }

    return processedItems;
  }

  /**
   * Finds potential legacy cache files for a provider
   */
  private findLegacyCacheFiles(providerName: string): CacheFileSource[] {
    const sources: CacheFileSource[] = [];
    
    // Common legacy patterns to check
    const legacyPatterns = [
      // Old format: provider-cache.json (configuration cache)
      `./cache/${providerName}-cache.json`,
      `./cache/${providerName}_cache.json`,
      
      // Old format: provider.json (simple cache)
      `./cache/${providerName}.json`,
      `./${providerName}.json`,
      
      // Old format: different directory structures
      `./data/${providerName}_processed.json`,
      `./tmp/${providerName}_processed.json`,
      
      // Old format: with different suffixes
      `./cache/${providerName}_items.json`,
      `./cache/${providerName}_sent.json`,
      `./cache/${providerName}_done.json`,
      
      // Current format in different locations (in case directory changed)
      `./${providerName}_processed.json`,
      `./data/${providerName}_processed.json`,
    ];

    for (const pattern of legacyPatterns) {
      if (fs.existsSync(pattern)) {
        sources.push({
          path: pattern,
          type: this.detectCacheFileType(pattern)
        });
      }
    }

    return sources;
  }

  /**
   * Migrates a single cache file to the new format
   */
  private migrateSingleCacheFile(source: CacheFileSource, providerName: string): Set<string> {
    const processedItems = new Set<string>();
    
    try {
      const content = fs.readFileSync(source.path, 'utf8');
      const data = JSON.parse(content);
      
      switch (source.type) {
        case 'processed_array':
          // Current format: ["1", "2", "3"]
          if (Array.isArray(data)) {
            data.forEach(item => processedItems.add(String(item)));
          }
          break;
          
        case 'configuration_cache':
          // Old configuration cache format: { processedItems: [...], lastCheck: ... }
          if (data.processedItems && Array.isArray(data.processedItems)) {
            data.processedItems.forEach((item: unknown) => processedItems.add(String(item)));
          }
          break;
          
        case 'object_with_items':
          // Object format: { items: [...], metadata: ... }
          if (data.items && Array.isArray(data.items)) {
            data.items.forEach((item: unknown) => processedItems.add(String(item)));
          }
          break;
          
        case 'flat_object':
          // Flat object: { "1": true, "2": true }
          Object.keys(data).forEach(key => {
            if (data[key]) {
              processedItems.add(key);
            }
          });
          break;
          
        case 'complex_objects':
          // Array of objects: [{ id: "1", processed: true }, ...]
          if (Array.isArray(data)) {
            data.forEach((item: any) => {
              if (item && typeof item === 'object') {
                // Try common ID fields
                const id = item.id || item.uniqueId || item.key || item.identifier;
                if (id !== undefined) {
                  processedItems.add(String(id));
                }
              }
            });
          }
          break;
      }
      
    } catch (error) {
      this.logger.warn(`Failed to parse legacy cache file ${source.path}:`, error);
    }
    
    return processedItems;
  }

  /**
   * Detects the type of cache file based on its content and path
   */
  private detectCacheFileType(filePath: string): CacheFileType {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Check for current format first
      if (Array.isArray(data) && data.every(item => typeof item === 'string' || typeof item === 'number')) {
        return 'processed_array';
      }
      
      // Check for configuration cache format
      if (data && typeof data === 'object' && data.processedItems) {
        return 'configuration_cache';
      }
      
      // Check for object with items array
      if (data && typeof data === 'object' && data.items && Array.isArray(data.items)) {
        return 'object_with_items';
      }
      
      // Check for flat object (key-value pairs)
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const values = Object.values(data);
        if (values.every(v => typeof v === 'boolean' || v === 1 || v === 0)) {
          return 'flat_object';
        }
      }
      
      // Check for array of complex objects
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return 'complex_objects';
      }
      
    } catch (error) {
      this.logger.debug(`Could not detect cache file type for ${filePath}:`, error);
    }
    
    return 'unknown';
  }

  /**
   * Creates a backup of the legacy cache file before migration
   */
  private backupLegacyFile(filePath: string): void {
    try {
      const backupPath = `${filePath}.pre-migration-backup`;
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
        this.logger.debug(`Created backup of legacy cache file: ${backupPath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to backup legacy cache file ${filePath}:`, error);
    }
  }

  /**
   * Validates that migrated data makes sense
   */
  public validateMigratedData(processedItems: Set<string>, providerName: string): boolean {
    if (processedItems.size === 0) {
      return true; // Empty is valid
    }
    
    // Check for reasonable data
    const items = Array.from(processedItems);
    
    // Warn if we have suspiciously many items (might indicate migration error)
    if (items.length > 100000) {
      this.logger.warn(`Migration resulted in ${items.length} processed items for ${providerName} - this seems unusually high`);
      return false;
    }
    
    // Check for reasonable ID formats
    const invalidItems = items.filter(item => {
      // IDs should be reasonable strings/numbers
      return item.length > 1000 || item.includes('\n') || item.includes('\r');
    });
    
    if (invalidItems.length > 0) {
      this.logger.warn(`Migration found ${invalidItems.length} items with suspicious formats for ${providerName}`);
      return false;
    }
    
    this.logger.debug(`Migration validation passed for ${providerName}: ${items.length} items`);
    return true;
  }
}

/**
 * Represents a source cache file that can be migrated
 */
interface CacheFileSource {
  path: string;
  type: CacheFileType;
}

/**
 * Types of cache file formats we can migrate from
 */
type CacheFileType = 
  | 'processed_array'      // Current format: ["1", "2"]
  | 'configuration_cache'  // Old config format: { processedItems: [...] }
  | 'object_with_items'    // Object format: { items: [...] }
  | 'flat_object'          // Flat format: { "1": true, "2": true }
  | 'complex_objects'      // Array of objects: [{ id: "1" }, ...]
  | 'unknown';             // Unknown format