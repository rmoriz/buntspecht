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

interface MockProgram {
  name: jest.Mock;
  description: jest.Mock;
  version: jest.Mock;
  option: jest.Mock;
  parse: jest.Mock;
  opts: jest.Mock;
}

describe('CLI', () => {
  let mockProgram: MockProgram;

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
        'Buntspecht - A reliable Fediverse bot for automated messages with flexible sources'
      );
      expect(mockProgram.version).toHaveBeenCalledWith('0.2.1');
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