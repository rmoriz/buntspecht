import { Logger } from '../utils/logger';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should set default log level to info', () => {
      const logger = new Logger();
      expect(logger.isInfoEnabled()).toBe(true);
      expect(logger.isDebugEnabled()).toBe(false);
    });

    it('should set custom log level', () => {
      const logger = new Logger('debug');
      expect(logger.isDebugEnabled()).toBe(true);
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      const logger = new Logger('info');
      expect(logger.isDebugEnabled()).toBe(false);
      
      logger.setLevel('debug');
      expect(logger.isDebugEnabled()).toBe(true);
    });
  });

  describe('logging methods', () => {
    it('should log debug messages when level is debug', () => {
      const logger = new Logger('debug');
      logger.debug('test debug message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] DEBUG test debug message/)
      );
    });

    it('should not log debug messages when level is info', () => {
      const logger = new Logger('info');
      logger.debug('test debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log info messages when level is info', () => {
      const logger = new Logger('info');
      logger.info('test info message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] INFO {2}test info message/)
      );
    });

    it('should log warn messages when level is info', () => {
      const logger = new Logger('info');
      logger.warn('test warn message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] WARN {2}test warn message/)
      );
    });

    it('should log error messages when level is info', () => {
      const logger = new Logger('info');
      logger.error('test error message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] ERROR test error message/)
      );
    });

    it('should log with additional arguments', () => {
      const logger = new Logger('info');
      const obj = { key: 'value' };
      logger.info('test message', obj, 123);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] INFO {2}test message/),
        obj,
        123
      );
    });

    it('should only log messages at or above the current level', () => {
      const logger = new Logger('warn');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN {2}warn message/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR error message/)
      );
    });
  });

  describe('level check methods', () => {
    it('should correctly report debug enabled status', () => {
      const debugLogger = new Logger('debug');
      const infoLogger = new Logger('info');
      
      expect(debugLogger.isDebugEnabled()).toBe(true);
      expect(infoLogger.isDebugEnabled()).toBe(false);
    });

    it('should correctly report info enabled status', () => {
      const debugLogger = new Logger('debug');
      const infoLogger = new Logger('info');
      const warnLogger = new Logger('warn');
      
      expect(debugLogger.isInfoEnabled()).toBe(true);
      expect(infoLogger.isInfoEnabled()).toBe(true);
      expect(warnLogger.isInfoEnabled()).toBe(false);
    });
  });
});