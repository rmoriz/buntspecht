import { Logger } from '../utils/logger.js';
import { TelemetryService } from './telemetryInterface.js';

/**
 * Base class for services that provides common dependency injection pattern.
 * Eliminates repetitive constructor code for logger and telemetry dependencies.
 */
export abstract class BaseService {
  protected readonly logger: Logger;
  protected readonly telemetry: TelemetryService;

  constructor(logger: Logger, telemetry: TelemetryService) {
    this.logger = logger;
    this.telemetry = telemetry;
  }
}

/**
 * Base class for services that also need configuration.
 * Generic type T allows for type-safe configuration injection.
 */
export abstract class BaseConfigurableService<T = any> extends BaseService {
  protected readonly config: T;

  constructor(config: T, logger: Logger, telemetry: TelemetryService) {
    super(logger, telemetry);
    this.config = config;
  }
}