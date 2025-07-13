import { Logger } from '../../utils/logger';

/**
 * Handles JSON array parsing and validation for multi-JSON command providers.
 * Responsible for validating JSON structure and extracting individual items.
 */
export class JsonArrayProcessor {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validates and processes JSON data, ensuring it's an array of objects
   */
  public validateAndProcessJson(jsonData: unknown): Record<string, unknown>[] {
    if (!Array.isArray(jsonData)) {
      throw new Error('JSON data must be an array');
    }

    if (jsonData.length === 0) {
      this.logger.warn('JSON array is empty');
      return [];
    }

    const validItems: Record<string, unknown>[] = [];

    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      
      if (typeof item !== 'object' || item === null) {
        this.logger.warn(`JSON array item at index ${i} is not an object, skipping`);
        continue;
      }

      validItems.push(item as Record<string, unknown>);
    }

    this.logger.debug(`Processed JSON array: ${jsonData.length} total items, ${validItems.length} valid objects`);
    return validItems;
  }

  /**
   * Validates that all items have the required unique key
   */
  public validateUniqueKeys(items: Record<string, unknown>[], uniqueKey: string): void {
    const seenKeys = new Set<string>();
    const duplicates: string[] = [];

    for (const item of items) {
      if (!(uniqueKey in item)) {
        throw new Error(`Missing required unique key "${uniqueKey}" in JSON object`);
      }

      const keyValue = String(item[uniqueKey]);
      if (seenKeys.has(keyValue)) {
        duplicates.push(keyValue);
      } else {
        seenKeys.add(keyValue);
      }
    }

    if (duplicates.length > 0) {
      throw new Error(`Duplicate unique keys found: ${duplicates.join(', ')}`);
    }

    this.logger.debug(`Validated ${items.length} items with unique key "${uniqueKey}"`);
  }

  /**
   * Extracts unique identifier from an item
   */
  public getUniqueId(item: Record<string, unknown>, uniqueKey: string, fallbackIndex: number): string {
    return String(item[uniqueKey] || fallbackIndex);
  }
}