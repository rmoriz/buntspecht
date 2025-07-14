import { CacheMigrator } from '../messages/multiJson/CacheMigrator';
import { Logger } from '../utils/logger';
import * as fs from 'fs';

describe('CacheMigrator', () => {
  let migrator: CacheMigrator;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    
    migrator = new CacheMigrator(logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    
    // Clean up test files
    const testFiles = [
      './tmp_rovodev_legacy_processed_array.json',
      './tmp_rovodev_legacy_config_cache.json',
      './tmp_rovodev_legacy_object_items.json',
      './tmp_rovodev_legacy_flat_object.json',
      './tmp_rovodev_legacy_complex_objects.json',
      './tmp_rovodev_legacy_processed_array.json.pre-migration-backup',
      './tmp_rovodev_legacy_config_cache.json.pre-migration-backup',
      './tmp_rovodev_legacy_object_items.json.pre-migration-backup',
      './tmp_rovodev_legacy_flat_object.json.pre-migration-backup',
      './tmp_rovodev_legacy_complex_objects.json.pre-migration-backup',
    ];
    
    testFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });

  describe('migrateCacheFiles', () => {
    it('should migrate from processed array format', () => {
      // Create legacy cache file
      const legacyData = ['1', '2', '3'];
      fs.writeFileSync('./tmp_rovodev_legacy_processed_array.json', JSON.stringify(legacyData));
      
      // Mock findLegacyCacheFiles to return our test file
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_processed_array.json', type: 'processed_array' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(3);
      expect(result.has('1')).toBe(true);
      expect(result.has('2')).toBe(true);
      expect(result.has('3')).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Migrated 3 processed items from legacy cache')
      );
    });

    it('should migrate from configuration cache format', () => {
      // Create legacy config cache file
      const legacyData = {
        processedItems: ['item1', 'item2'],
        lastCheck: '2023-01-01T00:00:00Z',
        version: '1.0'
      };
      fs.writeFileSync('./tmp_rovodev_legacy_config_cache.json', JSON.stringify(legacyData));
      
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_config_cache.json', type: 'configuration_cache' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(2);
      expect(result.has('item1')).toBe(true);
      expect(result.has('item2')).toBe(true);
    });

    it('should migrate from object with items format', () => {
      // Create legacy object format
      const legacyData = {
        items: ['a', 'b', 'c'],
        metadata: { version: '2.0' }
      };
      fs.writeFileSync('./tmp_rovodev_legacy_object_items.json', JSON.stringify(legacyData));
      
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_object_items.json', type: 'object_with_items' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(3);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(true);
      expect(result.has('c')).toBe(true);
    });

    it('should migrate from flat object format', () => {
      // Create legacy flat object format
      const legacyData = {
        '1': true,
        '2': true,
        '3': false,
        '4': 1,
        '5': 0
      };
      fs.writeFileSync('./tmp_rovodev_legacy_flat_object.json', JSON.stringify(legacyData));
      
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_flat_object.json', type: 'flat_object' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(3); // Only truthy values: '1', '2', '4'
      expect(result.has('1')).toBe(true);
      expect(result.has('2')).toBe(true);
      expect(result.has('4')).toBe(true);
      expect(result.has('3')).toBe(false); // false value
      expect(result.has('5')).toBe(false); // 0 value
    });

    it('should migrate from complex objects format', () => {
      // Create legacy complex objects format
      const legacyData = [
        { id: 'obj1', processed: true },
        { uniqueId: 'obj2', status: 'done' },
        { key: 'obj3', data: 'test' },
        { identifier: 'obj4' },
        { name: 'obj5' } // No valid ID field
      ];
      fs.writeFileSync('./tmp_rovodev_legacy_complex_objects.json', JSON.stringify(legacyData));
      
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_complex_objects.json', type: 'complex_objects' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(4); // obj1, obj2, obj3, obj4 (obj5 has no valid ID)
      expect(result.has('obj1')).toBe(true);
      expect(result.has('obj2')).toBe(true);
      expect(result.has('obj3')).toBe(true);
      expect(result.has('obj4')).toBe(true);
      expect(result.has('obj5')).toBe(false);
    });

    it('should handle migration errors gracefully', () => {
      // Create invalid JSON file
      fs.writeFileSync('./tmp_rovodev_legacy_invalid.json', 'invalid json content');
      
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([
        { path: './tmp_rovodev_legacy_invalid.json', type: 'processed_array' }
      ]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to migrate cache file'),
        expect.any(Error)
      );
      
      // Cleanup
      fs.unlinkSync('./tmp_rovodev_legacy_invalid.json');
    });

    it('should return empty set when no legacy files found', () => {
      jest.spyOn(migrator as any, 'findLegacyCacheFiles').mockReturnValue([]);
      
      const result = migrator.migrateCacheFiles('test-provider', './cache');
      
      expect(result.size).toBe(0);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Cache migration completed')
      );
    });
  });

  describe('validateMigratedData', () => {
    it('should validate empty data as valid', () => {
      const result = migrator.validateMigratedData(new Set(), 'test-provider');
      expect(result).toBe(true);
    });

    it('should validate reasonable data as valid', () => {
      const data = new Set(['1', '2', '3', 'item-4', 'uuid-123']);
      const result = migrator.validateMigratedData(data, 'test-provider');
      expect(result).toBe(true);
    });

    it('should reject data with too many items', () => {
      const data = new Set<string>();
      for (let i = 0; i < 100001; i++) {
        data.add(String(i));
      }
      
      const result = migrator.validateMigratedData(data, 'test-provider');
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unusually high')
      );
    });

    it('should reject data with suspicious formats', () => {
      const data = new Set([
        'normal-id',
        'a'.repeat(1001), // Too long
        'id-with\nnewline', // Contains newline
        'id-with\rcarriage-return' // Contains carriage return
      ]);
      
      const result = migrator.validateMigratedData(data, 'test-provider');
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('suspicious formats')
      );
    });
  });
});