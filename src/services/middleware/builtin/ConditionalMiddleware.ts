import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface ConditionalConfig {
  /** Conditions that must be met */
  conditions: ConditionRule[];
  /** Logic operator for multiple conditions: 'and' or 'or' */
  operator?: 'and' | 'or';
  /** Action when conditions are not met */
  action: 'skip' | 'continue';
  /** Custom skip reason */
  skipReason?: string;
  /** Whether to invert the condition result */
  invert?: boolean;
}

export interface ConditionRule {
  /** Type of condition */
  type: 'text' | 'length' | 'time' | 'provider' | 'account' | 'data' | 'environment';
  /** Field to check (for data/environment conditions) */
  field?: string;
  /** Operator for comparison */
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';
  /** Value to compare against */
  value: string | number | boolean | string[] | number[];
  /** Case sensitive comparison (for string operations) */
  caseSensitive?: boolean;
  /** Regex flags (for regex operator) */
  regexFlags?: string;
}

/**
 * Middleware for conditional message processing based on various criteria
 */
export class ConditionalMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: ConditionalConfig;
  private logger?: Logger;

  constructor(name: string, config: ConditionalConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      operator: 'and',
      invert: false,
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized ConditionalMiddleware: ${this.name} with ${this.config.conditions.length} condition(s)`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      // Evaluate all conditions
      const conditionResults = this.config.conditions.map(condition => 
        this.evaluateCondition(condition, context)
      );

      // Apply operator logic
      let finalResult: boolean;
      if (this.config.operator === 'or') {
        finalResult = conditionResults.some(result => result);
      } else {
        finalResult = conditionResults.every(result => result);
      }

      // Apply inversion if configured
      if (this.config.invert) {
        finalResult = !finalResult;
      }

      this.logger?.debug(`ConditionalMiddleware ${this.name}: conditions evaluated to ${finalResult}`);
      context.data[`${this.name}_condition_result`] = finalResult;
      context.data[`${this.name}_individual_results`] = conditionResults;

      // Take action based on result
      if (!finalResult && this.config.action === 'skip') {
        context.skip = true;
        context.skipReason = this.config.skipReason || 'Conditional requirements not met';
        
        this.logger?.info(`ConditionalMiddleware ${this.name} skipped message: ${context.skipReason}`);
        context.data[`${this.name}_skipped`] = true;
        
        return; // Don't call next() - stop the chain
      }

      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`ConditionalMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private evaluateCondition(condition: ConditionRule, context: MessageMiddlewareContext): boolean {
    const actualValue = this.getActualValue(condition, context);
    const expectedValue = condition.value;

    this.logger?.debug(`Evaluating condition: ${condition.type}.${condition.field || 'value'} ${condition.operator} ${expectedValue} (actual: ${actualValue})`);

    switch (condition.operator) {
      case 'equals':
        return this.compareValues(actualValue, expectedValue, 'equals', condition.caseSensitive);
      
      case 'not_equals':
        return !this.compareValues(actualValue, expectedValue, 'equals', condition.caseSensitive);
      
      case 'contains':
        return this.stringContains(String(actualValue), String(expectedValue), condition.caseSensitive);
      
      case 'not_contains':
        return !this.stringContains(String(actualValue), String(expectedValue), condition.caseSensitive);
      
      case 'starts_with':
        return this.stringStartsWith(String(actualValue), String(expectedValue), condition.caseSensitive);
      
      case 'ends_with':
        return this.stringEndsWith(String(actualValue), String(expectedValue), condition.caseSensitive);
      
      case 'regex':
        return this.regexMatch(String(actualValue), String(expectedValue), condition.regexFlags);
      
      case 'gt':
        return Number(actualValue) > Number(expectedValue);
      
      case 'lt':
        return Number(actualValue) < Number(expectedValue);
      
      case 'gte':
        return Number(actualValue) >= Number(expectedValue);
      
      case 'lte':
        return Number(actualValue) <= Number(expectedValue);
      
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      
      default:
        this.logger?.warn(`Unknown operator: ${condition.operator}`);
        return false;
    }
  }

  private getActualValue(condition: ConditionRule, context: MessageMiddlewareContext): unknown {
    switch (condition.type) {
      case 'text':
        return context.message.text;
      
      case 'length':
        return context.message.text.length;
      
      case 'time':
        const now = new Date();
        switch (condition.field) {
          case 'hour':
            return now.getHours();
          case 'day':
            return now.getDay();
          case 'date':
            return now.getDate();
          case 'month':
            return now.getMonth() + 1;
          case 'year':
            return now.getFullYear();
          case 'timestamp':
            return now.getTime();
          default:
            return now.toISOString();
        }
      
      case 'provider':
        return context.providerName;
      
      case 'account':
        if (condition.field === 'count') {
          return context.accountNames.length;
        } else if (condition.field === 'names') {
          return context.accountNames;
        } else {
          return context.accountNames.join(',');
        }
      
      case 'data':
        if (!condition.field) {
          return context.data;
        }
        return this.getNestedProperty(context.data, condition.field);
      
      case 'environment':
        if (!condition.field) {
          return process.env;
        }
        return process.env[condition.field];
      
      default:
        this.logger?.warn(`Unknown condition type: ${condition.type}`);
        return undefined;
    }
  }

  private compareValues(actual: unknown, expected: unknown, operator: string, caseSensitive?: boolean): boolean {
    if (typeof actual === 'string' && typeof expected === 'string') {
      const actualStr = caseSensitive ? actual : actual.toLowerCase();
      const expectedStr = caseSensitive ? expected : expected.toLowerCase();
      return actualStr === expectedStr;
    }
    return actual === expected;
  }

  private stringContains(actual: string, expected: string, caseSensitive?: boolean): boolean {
    const actualStr = caseSensitive ? actual : actual.toLowerCase();
    const expectedStr = caseSensitive ? expected : expected.toLowerCase();
    return actualStr.includes(expectedStr);
  }

  private stringStartsWith(actual: string, expected: string, caseSensitive?: boolean): boolean {
    const actualStr = caseSensitive ? actual : actual.toLowerCase();
    const expectedStr = caseSensitive ? expected : expected.toLowerCase();
    return actualStr.startsWith(expectedStr);
  }

  private stringEndsWith(actual: string, expected: string, caseSensitive?: boolean): boolean {
    const actualStr = caseSensitive ? actual : actual.toLowerCase();
    const expectedStr = caseSensitive ? expected : expected.toLowerCase();
    return actualStr.endsWith(expectedStr);
  }

  private regexMatch(actual: string, pattern: string, flags?: string): boolean {
    try {
      const regex = new RegExp(pattern, flags || '');
      return regex.test(actual);
    } catch (error) {
      this.logger?.error(`Invalid regex pattern: ${pattern}`, error);
      return false;
    }
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? (current as any)[key] : undefined;
    }, obj);
  }
}