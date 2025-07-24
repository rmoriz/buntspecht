import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Telemetry span interface for type safety
 */
export interface TelemetrySpan {
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(error: Error): void;
  end(): void;
}

/**
 * Helper utility for consistent telemetry span management across the application.
 * Reduces code duplication and ensures proper span lifecycle management.
 */
export class TelemetryHelper {
  /**
   * Executes an operation within a telemetry span with proper error handling and cleanup
   * @param telemetry The telemetry service instance
   * @param spanName Name of the span to create
   * @param initialAttributes Initial attributes to set on the span
   * @param operation The operation to execute within the span
   * @returns The result of the operation
   */
  static async executeWithSpan<T>(
    telemetry: TelemetryService | undefined,
    spanName: string,
    initialAttributes: Record<string, string | number | boolean>,
    operation: (span?: TelemetrySpan) => Promise<T>
  ): Promise<T> {
    const span = telemetry?.startSpan(spanName, initialAttributes) as TelemetrySpan | undefined;

    try {
      const result = await operation(span);
      span?.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Executes a synchronous operation within a telemetry span
   * @param telemetry The telemetry service instance
   * @param spanName Name of the span to create
   * @param initialAttributes Initial attributes to set on the span
   * @param operation The synchronous operation to execute within the span
   * @returns The result of the operation
   */
  static executeWithSpanSync<T>(
    telemetry: TelemetryService | undefined,
    spanName: string,
    initialAttributes: Record<string, string | number | boolean>,
    operation: (span?: TelemetrySpan) => T
  ): T {
    const span = telemetry?.startSpan(spanName, initialAttributes) as TelemetrySpan | undefined;

    try {
      const result = operation(span);
      span?.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Sets attributes on a span if it exists
   * @param span The span to set attributes on
   * @param attributes The attributes to set
   */
  static setAttributes(span: TelemetrySpan | undefined, attributes: Record<string, string | number | boolean>): void {
    span?.setAttributes(attributes);
  }

  /**
   * Records a successful operation status on a span
   * @param span The span to update
   */
  static setSuccess(span: TelemetrySpan | undefined): void {
    span?.setStatus({ code: 1 }); // OK
  }

  /**
   * Records an error status on a span
   * @param span The span to update
   * @param error The error that occurred
   */
  static setError(span: TelemetrySpan | undefined, error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof Error) {
      span?.recordException(error);
    }
    span?.setStatus({ code: 2, message: errorMessage }); // ERROR
  }
}