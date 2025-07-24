import { JsonCommandProvider } from '../messages/jsonCommandProvider';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('JsonCommandProvider - File Support', () => {
  let mockLogger: jest.Mocked<Logger>;
  let testFilePath: string;

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

    testFilePath = path.join(__dirname, 'test-data.json');
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it('should create provider with file configuration', () => {
    const config = {
      file: testFilePath,
      template: 'Test: {{message}}'
    };

    expect(() => new JsonCommandProvider(config)).not.toThrow();
  });

  it('should reject both command and file', () => {
    const config = {
      command: 'echo "test"',
      file: testFilePath,
      template: 'Test: {{message}}'
    };

    expect(() => new JsonCommandProvider(config)).toThrow('Cannot specify both command and file');
  });

  it('should reject neither command nor file', () => {
    const config = {
      template: 'Test: {{message}}'
    };

    expect(() => new JsonCommandProvider(config)).toThrow('Either command or file is required');
  });

  it('should read JSON from file and apply template', async () => {
    const testData = { message: 'Hello from file', count: 42 };
    fs.writeFileSync(testFilePath, JSON.stringify(testData));

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Message: {{message}}, Count: {{count}}'
    });

    await provider.initialize(mockLogger);
    const result = await provider.generateMessage();

    expect(result).toBe('Message: Hello from file, Count: 42');
  });

  it('should handle file not found error', async () => {
    const provider = new JsonCommandProvider({
      file: '/nonexistent/file.json',
      template: 'Test: {{message}}'
    });

    await provider.initialize(mockLogger);
    await expect(provider.generateMessage()).rejects.toThrow('File does not exist');
  });

  it('should handle empty file error', async () => {
    fs.writeFileSync(testFilePath, '');

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Test: {{message}}'
    });

    await provider.initialize(mockLogger);
    await expect(provider.generateMessage()).rejects.toThrow('File is empty');
  });

  it('should handle invalid JSON error', async () => {
    fs.writeFileSync(testFilePath, 'invalid json');

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Test: {{message}}'
    });

    await provider.initialize(mockLogger);
    await expect(provider.generateMessage()).rejects.toThrow('Failed to parse file content as JSON');
  });

  it('should detect file changes', async () => {
    const testData1 = { message: 'First version' };
    fs.writeFileSync(testFilePath, JSON.stringify(testData1));

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Message: {{message}}'
    });

    await provider.initialize(mockLogger);
    
    // Initial state - no changes
    expect(provider.hasFileChanged()).toBe(false);

    // Modify file
    const testData2 = { message: 'Second version' };
    fs.writeFileSync(testFilePath, JSON.stringify(testData2));

    // Should detect change
    expect(provider.hasFileChanged()).toBe(true);
    
    // Second call should return false (no new changes)
    expect(provider.hasFileChanged()).toBe(false);
  });

  it('should work with attachments from file', async () => {
    const testData = {
      message: 'Test with attachment',
      attachments: [
        {
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          mimeType: 'image/png',
          filename: 'test.png',
          description: 'Test image'
        }
      ]
    };
    fs.writeFileSync(testFilePath, JSON.stringify(testData));

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Message: {{message}}',
      attachmentsKey: 'attachments'
    });

    await provider.initialize(mockLogger);
    const result = await provider.generateMessageWithAttachments();

    expect(result.text).toBe('Message: Test with attachment');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].mimeType).toBe('image/png');
  });

  it('should cleanup file watcher', async () => {
    fs.writeFileSync(testFilePath, '{"message": "test"}');

    const provider = new JsonCommandProvider({
      file: testFilePath,
      template: 'Test: {{message}}'
    });

    await provider.initialize(mockLogger);
    
    // Cleanup should not throw
    expect(() => provider.cleanup()).not.toThrow();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped watching file'));
  });
});