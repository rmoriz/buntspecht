import { parseCliArguments } from '../cli';

// Mock commander
jest.mock('commander', () => {
  const mockProgram = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    opts: jest.fn(),
  };

  return {
    Command: jest.fn(() => mockProgram),
  };
});

describe('CLI', () => {
  let mockProgram: any;

  beforeEach(() => {
    const { Command } = require('commander');
    mockProgram = new Command();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseCliArguments', () => {
    it('should parse CLI arguments with config option', () => {
      mockProgram.opts.mockReturnValue({
        config: '/path/to/config.toml',
      });

      const result = parseCliArguments();

      expect(result).toEqual({
        config: '/path/to/config.toml',
        testPost: undefined,
        verify: undefined,
      });
    });

    it('should parse CLI arguments with test-post option', () => {
      mockProgram.opts.mockReturnValue({
        testPost: true,
      });

      const result = parseCliArguments();

      expect(result).toEqual({
        config: undefined,
        testPost: true,
        verify: undefined,
      });
    });

    it('should parse CLI arguments with verify option', () => {
      mockProgram.opts.mockReturnValue({
        verify: true,
      });

      const result = parseCliArguments();

      expect(result).toEqual({
        config: undefined,
        testPost: undefined,
        verify: true,
      });
    });

    it('should parse CLI arguments with all options', () => {
      mockProgram.opts.mockReturnValue({
        config: '/custom/config.toml',
        testPost: true,
        verify: true,
      });

      const result = parseCliArguments();

      expect(result).toEqual({
        config: '/custom/config.toml',
        testPost: true,
        verify: true,
      });
    });

    it('should parse CLI arguments with no options', () => {
      mockProgram.opts.mockReturnValue({});

      const result = parseCliArguments();

      expect(result).toEqual({
        config: undefined,
        testPost: undefined,
        verify: undefined,
      });
    });

    it('should setup commander correctly', () => {
      parseCliArguments();

      expect(mockProgram.name).toHaveBeenCalledWith('buntspecht');
      expect(mockProgram.description).toHaveBeenCalledWith(
        'Buntspecht - Ein Fediverse/Mastodon-Bot der PING-Nachrichten nach Zeitplan postet'
      );
      expect(mockProgram.version).toHaveBeenCalledWith('1.0.0');
      expect(mockProgram.option).toHaveBeenCalledWith(
        '-c, --config <path>',
        'path to configuration file'
      );
      expect(mockProgram.option).toHaveBeenCalledWith(
        '--test-post',
        'post a test message immediately and exit'
      );
      expect(mockProgram.option).toHaveBeenCalledWith(
        '--verify',
        'verify connection to Mastodon and exit'
      );
      expect(mockProgram.parse).toHaveBeenCalled();
    });
  });
});