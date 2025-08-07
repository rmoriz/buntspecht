import { JsonTemplateProcessor, AttachmentConfig } from '../utils/jsonTemplateProcessor';
import { Logger } from '../utils/logger';

describe('JsonTemplateProcessor', () => {
  let processor: JsonTemplateProcessor;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      setLevel: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      isDebugEnabled: jest.fn().mockReturnValue(true),
      isInfoEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<Logger>;
    processor = new JsonTemplateProcessor(mockLogger);
  });

  describe('applyTemplate', () => {
    it('should replace simple variables', () => {
      const template = 'Hello {{name}}!';
      const data = { name: 'World' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Hello World!');
    });

    it('should replace nested properties', () => {
      const template = 'User: {{user.profile.name}}';
      const data = { 
        user: { 
          profile: { 
            name: 'John Doe' 
          } 
        } 
      };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('User: John Doe');
    });

    it('should handle multiple variables', () => {
      const template = '{{greeting}} {{name}}, you have {{count}} messages';
      const data = { greeting: 'Hello', name: 'Alice', count: 5 };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Hello Alice, you have 5 messages');
    });

    it('should render empty string for missing variables', () => {
      const template = 'Hello {{name}}, your {{missing}} is ready';
      const data = { name: 'Bob' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Hello Bob, your  is ready');
      expect(mockLogger.debug).toHaveBeenCalledWith('Template variable "missing" not found in JSON data, rendering as empty string');
    });

    it('should handle null and undefined values', () => {
      const template = 'Value: {{nullValue}} and {{undefinedValue}}';
      const data = { nullValue: null, undefinedValue: undefined };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Value:  and ');
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should apply trim function with default suffix', () => {
      const template = 'Message: {{text|trim:10}}';
      const data = { text: 'This is a very long message that should be trimmed' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: This is...');
    });

    it('should apply trim function with custom suffix', () => {
      const template = 'Message: {{text|trim:15,…}}';
      const data = { text: 'This is a very long message' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: This is a very…');
    });

    it('should not trim if text is shorter than limit', () => {
      const template = 'Message: {{text|trim:50}}';
      const data = { text: 'Short message' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: Short message');
    });

    it('should handle trim with zero length', () => {
      const template = 'Message: {{text|trim:0}}';
      const data = { text: 'Any text' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: ...');
    });

    it('should handle invalid trim arguments', () => {
      const template = 'Message: {{text|trim:invalid}}';
      const data = { text: 'Some text' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: Some text');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid maxLength "invalid" for trim function on variable "text". Must be a non-negative integer.'
      );
    });

    it('should handle trim without arguments', () => {
      const template = 'Message: {{text|trim}}';
      const data = { text: 'Some text' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: Some text');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'trim function requires at least one argument (maxLength) for variable "text"'
      );
    });

    it('should handle unknown template functions', () => {
      const template = 'Message: {{text|unknown:arg}}';
      const data = { text: 'Some text' };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Message: Some text');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unknown template function "unknown" for variable "text"'
      );
    });

    it('should handle complex nested paths', () => {
      const template = 'Data: {{response.data.items.0.name}}';
      const data = { 
        response: { 
          data: { 
            items: [
              { name: 'First Item' },
              { name: 'Second Item' }
            ]
          }
        }
      };
      
      const result = processor.applyTemplate(template, data);
      
      expect(result).toBe('Data: First Item');
    });
  });

  describe('getNestedProperty', () => {
    it('should get simple property', () => {
      const obj = { name: 'test' };
      
      const result = processor.getNestedProperty(obj, 'name');
      
      expect(result).toBe('test');
    });

    it('should get nested property', () => {
      const obj = { user: { profile: { name: 'John' } } };
      
      const result = processor.getNestedProperty(obj, 'user.profile.name');
      
      expect(result).toBe('John');
    });

    it('should return undefined for missing property', () => {
      const obj = { name: 'test' };
      
      const result = processor.getNestedProperty(obj, 'missing.property');
      
      expect(result).toBeUndefined();
    });

    it('should handle array indices', () => {
      const obj = { items: ['first', 'second', 'third'] };
      
      const result = processor.getNestedProperty(obj, 'items.1');
      
      expect(result).toBe('second');
    });
  });

  describe('extractAttachments', () => {
    const config: AttachmentConfig = {
      attachmentsKey: 'attachments',
      attachmentDataKey: 'data',
      attachmentMimeTypeKey: 'mimeType',
      attachmentFilenameKey: 'filename',
      attachmentDescriptionKey: 'description'
    };

    it('should extract valid attachments', () => {
      const jsonData = {
        attachments: [
          {
            data: 'dGVzdA==', // base64 for "test"
            mimeType: 'text/plain',
            filename: 'test.txt',
            description: 'Test file'
          }
        ]
      };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        data: 'dGVzdA==',
        mimeType: 'text/plain',
        filename: 'test.txt',
        description: 'Test file'
      });
    });

    it('should return empty array when no attachmentsKey configured', () => {
      const jsonData = { attachments: [] };
      const configWithoutKey: AttachmentConfig = {};
      
      const result = processor.extractAttachments(jsonData, configWithoutKey);
      
      expect(result).toEqual([]);
    });

    it('should return empty array when attachments key not found', () => {
      const jsonData = { other: 'data' };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toEqual([]);
    });

    it('should warn when attachments key exists but is not array', () => {
      const jsonData = { attachments: 'not an array' };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attachments key "attachments" exists but is not an array'
      );
    });

    it('should skip invalid attachment objects', () => {
      const jsonData = {
        attachments: [
          'not an object',
          null,
          {
            data: 'dGVzdA==',
            mimeType: 'text/plain'
          }
        ]
      };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Attachment at index 0 is not an object');
      expect(mockLogger.warn).toHaveBeenCalledWith('Attachment at index 1 is not an object');
    });

    it('should skip attachments with missing required fields', () => {
      const jsonData = {
        attachments: [
          {
            mimeType: 'text/plain'
            // missing data field
          },
          {
            data: 'dGVzdA=='
            // missing mimeType field
          }
        ]
      };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attachment at index 0 missing or invalid \'data\' field'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attachment at index 1 missing or invalid \'mimeType\' field (also checked \'type\' and \'mimeType\' as fallbacks)'
      );
    });

    it('should use fallback field names', () => {
      const jsonData = {
        attachments: [
          {
            data: 'dGVzdA==',
            type: 'text/plain', // fallback for mimeType
            name: 'test.txt',   // fallback for filename
            alt: 'Test file'    // fallback for description
          }
        ]
      };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        data: 'dGVzdA==',
        mimeType: 'text/plain',
        filename: 'test.txt',
        description: 'Test file'
      });
    });

    it('should skip attachments with invalid base64', () => {
      const jsonData = {
        attachments: [
          {
            data: 'invalid-base64!@#',
            mimeType: 'text/plain'
          }
        ]
      };
      
      const result = processor.extractAttachments(jsonData, config);
      
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attachment at index 0 has invalid base64 data in \'data\' field'
      );
    });

    it('should handle nested attachments key', () => {
      const jsonData = {
        response: {
          data: {
            files: [
              {
                data: 'dGVzdA==',
                mimeType: 'text/plain'
              }
            ]
          }
        }
      };
      
      const nestedConfig: AttachmentConfig = {
        ...config,
        attachmentsKey: 'response.data.files'
      };
      
      const result = processor.extractAttachments(jsonData, nestedConfig);
      
      expect(result).toHaveLength(1);
      expect(result[0].data).toBe('dGVzdA==');
    });

    it('should handle custom field names', () => {
      const jsonData = {
        files: [
          {
            content: 'dGVzdA==',
            format: 'text/plain',
            title: 'test.txt',
            caption: 'Test file'
          }
        ]
      };
      
      const customConfig: AttachmentConfig = {
        attachmentsKey: 'files',
        attachmentDataKey: 'content',
        attachmentMimeTypeKey: 'format',
        attachmentFilenameKey: 'title',
        attachmentDescriptionKey: 'caption'
      };
      
      const result = processor.extractAttachments(jsonData, customConfig);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        data: 'dGVzdA==',
        mimeType: 'text/plain',
        filename: 'test.txt',
        description: 'Test file'
      });
    });
  });

  describe('isValidBase64', () => {
    it('should validate correct base64 strings', () => {
      expect(processor.isValidBase64('dGVzdA==')).toBe(true);
      expect(processor.isValidBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(processor.isValidBase64('YWJjZGVmZw==')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(processor.isValidBase64('invalid!@#')).toBe(false);
      expect(processor.isValidBase64('not-base64')).toBe(false);
      expect(processor.isValidBase64('dGVzdA==!')).toBe(false);
    });

    it('should handle base64 without padding', () => {
      expect(processor.isValidBase64('dGVzdA')).toBe(true);
      expect(processor.isValidBase64('SGVsbG8gV29ybGQ')).toBe(true);
    });

    it('should handle empty string', () => {
      expect(processor.isValidBase64('')).toBe(true);
    });

    it('should handle malformed base64', () => {
      expect(processor.isValidBase64('dGVzdA===')).toBe(false); // too much padding
      expect(processor.isValidBase64('dGVz dA==')).toBe(false); // space in middle
    });
  });
});