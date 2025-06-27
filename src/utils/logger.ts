export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private level: LogLevel;
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (this.levels[level] >= this.levels[this.level]) {
      const timestamp = new Date().toISOString();
      const levelStr = level.toUpperCase().padEnd(5);
      const logMessage = `[${timestamp}] ${levelStr} ${message}`;
      
      if (args.length > 0) {
        console.log(logMessage, ...args);
      } else {
        console.log(logMessage);
      }
    }
  }

  public isDebugEnabled(): boolean {
    return this.levels.debug >= this.levels[this.level];
  }

  public isInfoEnabled(): boolean {
    return this.levels.info >= this.levels[this.level];
  }
}