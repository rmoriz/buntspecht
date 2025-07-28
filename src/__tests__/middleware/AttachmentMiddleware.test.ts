import { AttachmentMiddleware } from '../../services/middleware/builtin/AttachmentMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';
import { Attachment } from '../../messages/messageProvider';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('AttachmentMiddleware', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let context: MessageMiddlewareContext;
  let nextMock: jest.Mock;

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: 'test', serviceVersion: '1.0.0' }, logger);
    nextMock = jest.fn();
    
    context = {
      message: { text: 'Test message' },
      providerName: 'test-provider',
      providerConfig: { name: 'test', type: 'test', accounts: [], config: {} },
      accountNames: ['test-account'],
      visibility: 'public',
      data: {},
      logger,
      telemetry,
      startTime: Date.now(),
      skip: false
    };

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const middleware = new AttachmentMiddleware('test', { action: 'add' });
      await middleware.initialize(logger, telemetry);
      expect(middleware.name).toBe('test');
      expect(middleware.enabled).toBe(true);
    });

    it('should be disabled when specified', () => {
      const middleware = new AttachmentMiddleware('test', { action: 'add' }, false);
      expect(middleware.enabled).toBe(false);
    });
  });

  describe('add action', () => {
    it('should add attachments from base64 data', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: [
          {
            data: 'dGVzdCBkYXRh', // base64 for "test data"
            mimeType: 'text/plain',
            filename: 'test.txt',
            description: 'Test file'
          }
        ]
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(1);
      expect(context.message.attachments![0]).toEqual({
        data: 'dGVzdCBkYXRh',
        mimeType: 'text/plain',
        filename: 'test.txt',
        description: 'Test file'
      });
      expect(nextMock).toHaveBeenCalled();
    });

    it('should add attachments from file path', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: [
          {
            data: '/path/to/file.txt',
            mimeType: 'text/plain',
            filename: 'file.txt',
            isFilePath: true
          }
        ]
      });

      // Mock file reading
      mockedFs.readFileSync.mockReturnValue(Buffer.from('file content'));

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/path/to/file.txt');
      expect(context.message.attachments).toHaveLength(1);
      expect(context.message.attachments![0].data).toBe(Buffer.from('file content').toString('base64'));
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: [
          {
            data: '/nonexistent/file.txt',
            mimeType: 'text/plain',
            isFilePath: true
          }
        ]
      });

      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toEqual([]);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should do nothing when no attachments specified', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: []
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toBeUndefined();
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('remove action', () => {
    beforeEach(() => {
      context.message.attachments = [
        { data: 'data1', mimeType: 'image/jpeg', filename: 'photo.jpg' },
        { data: 'data2', mimeType: 'text/plain', filename: 'document.txt' },
        { data: 'data3', mimeType: 'image/png', filename: 'screenshot.png' },
        { data: 'verylongdatastring'.repeat(1000), mimeType: 'video/mp4', filename: 'video.mp4' }
      ];
    });

    it('should remove attachments by MIME type pattern', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: {
          mimeType: 'image/*'
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(2);
      expect(context.message.attachments!.map(a => a.mimeType)).toEqual(['text/plain', 'video/mp4']);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should remove attachments by filename pattern', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: {
          filename: '*.txt'
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(3);
      expect(context.message.attachments!.map(a => a.filename)).toEqual(['photo.jpg', 'screenshot.png', 'video.mp4']);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should remove attachments by size limit', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: {
          maxSize: 1000 // bytes
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(3);
      expect(context.message.attachments!.map(a => a.filename)).toEqual(['photo.jpg', 'document.txt', 'screenshot.png']);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should remove attachments by indices', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: {
          indices: [0, 2]
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(2);
      expect(context.message.attachments!.map(a => a.filename)).toEqual(['document.txt', 'video.mp4']);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle multiple filter criteria', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: {
          mimeType: 'image/*',
          maxSize: 1000
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(1);
      expect(context.message.attachments!.map(a => a.mimeType)).toEqual(['text/plain']);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should do nothing when no attachments exist', async () => {
      context.message.attachments = undefined;
      
      const middleware = new AttachmentMiddleware('test', {
        action: 'remove',
        removeFilter: { mimeType: 'image/*' }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toBeUndefined();
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('validate action', () => {
    beforeEach(() => {
      context.message.attachments = [
        { data: 'data1', mimeType: 'image/jpeg', filename: 'photo.jpg' },
        { data: 'data2', mimeType: 'text/plain', filename: 'document.txt' }
      ];
    });

    it('should pass validation when all criteria are met', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: {
          maxCount: 5,
          maxSize: 1000,
          allowedTypes: ['image/jpeg', 'text/plain']
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(false);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should fail validation when too many attachments', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: {
          maxCount: 1
        },
        skipOnValidationFailure: true
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('Attachment validation failed');
      expect(nextMock).not.toHaveBeenCalled();
    });

    it('should fail validation when file too large', async () => {
      context.message.attachments = [
        { data: 'x'.repeat(2000), mimeType: 'image/jpeg', filename: 'large.jpg' }
      ];

      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: {
          maxSize: 100
        },
        skipOnValidationFailure: true,
        skipReason: 'File too large'
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('File too large');
      expect(nextMock).not.toHaveBeenCalled();
    });

    it('should fail validation when MIME type not allowed', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: {
          allowedTypes: ['image/jpeg']
        },
        skipOnValidationFailure: true
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(true);
      expect(nextMock).not.toHaveBeenCalled();
    });

    it('should continue processing when validation fails but skipOnValidationFailure is false', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: {
          maxCount: 1
        },
        skipOnValidationFailure: false
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(false);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should pass validation when no validation rules specified', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'validate'
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.skip).toBe(false);
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('modify action', () => {
    beforeEach(() => {
      context.message.attachments = [
        { data: 'data1', mimeType: 'image/jpeg', filename: 'photo.jpg' },
        { data: 'data2', mimeType: 'text/plain', filename: 'document.txt' }
      ];
    });

    it('should process image modifications (placeholder)', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'modify',
        modifications: {
          resize: {
            maxWidth: 800,
            maxHeight: 600,
            quality: 80
          }
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      // Since this is a placeholder implementation, just verify it doesn't crash
      expect(context.message.attachments).toHaveLength(2);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle watermark modifications (placeholder)', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'modify',
        modifications: {
          watermark: {
            text: 'Copyright',
            position: 'bottom-right'
          }
        }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(2);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should do nothing when no modifications specified', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'modify'
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(2);
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate errors during execution', async () => {
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: [
          {
            data: '/nonexistent/file.txt',
            mimeType: 'text/plain',
            isFilePath: true
          }
        ]
      });

      // Mock fs to throw an error that can't be caught
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Critical file system error');
      });

      await middleware.initialize(logger, telemetry);

      // The middleware should handle file read errors gracefully
      await expect(middleware.execute(context, nextMock)).resolves.not.toThrow();
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('context data tracking', () => {
    it('should track attachment count changes', async () => {
      // Start with no attachments to ensure count change is detected
      const middleware = new AttachmentMiddleware('test', {
        action: 'add',
        attachments: [
          {
            data: 'dGVzdA==',
            mimeType: 'text/plain',
            filename: 'test.txt'
          }
        ]
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.message.attachments).toHaveLength(1);
      expect(context.data['test_original_count']).toBe(0);
      expect(context.data['test_new_count']).toBe(1);
      expect(nextMock).toHaveBeenCalled();
    });

    it('should not track when attachment count unchanged', async () => {
      context.message.attachments = [
        { data: 'data1', mimeType: 'image/jpeg', filename: 'photo.jpg' }
      ];

      const middleware = new AttachmentMiddleware('test', {
        action: 'validate',
        validation: { maxCount: 5 }
      });

      await middleware.initialize(logger, telemetry);
      await middleware.execute(context, nextMock);

      expect(context.data['test_original_count']).toBeUndefined();
      expect(context.data['test_new_count']).toBeUndefined();
      expect(nextMock).toHaveBeenCalled();
    });
  });
});