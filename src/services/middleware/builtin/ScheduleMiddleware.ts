import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface ScheduleConfig {
  /** Time-based rules for when to allow messages */
  timeRules?: {
    /** Allowed hours (0-23) */
    allowedHours?: number[];
    /** Allowed days of week (0=Sunday, 6=Saturday) */
    allowedDays?: number[];
    /** Timezone for time calculations */
    timezone?: string;
    /** Quiet hours (messages will be skipped) */
    quietHours?: { start: number; end: number };
  };
  /** Date-based rules */
  dateRules?: {
    /** Skip messages on these dates (YYYY-MM-DD format) */
    skipDates?: string[];
    /** Only allow messages on these dates */
    allowDates?: string[];
    /** Skip messages during date ranges */
    skipRanges?: Array<{ start: string; end: string }>;
  };
  /** Frequency rules */
  frequencyRules?: {
    /** Minimum time between messages in milliseconds */
    minInterval?: number;
    /** Maximum messages per day */
    maxPerDay?: number;
    /** Maximum messages per hour */
    maxPerHour?: number;
  };
  /** Action when schedule conditions are not met */
  action: 'skip' | 'delay' | 'queue';
  /** Custom skip reason */
  skipReason?: string;
  /** Maximum delay time in milliseconds (for delay action) */
  maxDelayMs?: number;
}

interface ScheduleState {
  lastMessageTime: number;
  messagesThisHour: number;
  messagesThisDay: number;
  currentHour: number;
  currentDay: number;
}

/**
 * Middleware for scheduling and timing control of messages
 */
export class ScheduleMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: ScheduleConfig;
  private logger?: Logger;
  private scheduleState: ScheduleState;

  constructor(name: string, config: ScheduleConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      maxDelayMs: 3600000, // 1 hour default
      skipReason: 'Message scheduled for later',
      ...config
    };
    
    this.scheduleState = {
      lastMessageTime: 0,
      messagesThisHour: 0,
      messagesThisDay: 0,
      currentHour: -1,
      currentDay: -1
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized ScheduleMiddleware: ${this.name}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const now = new Date();
      const currentTime = now.getTime();
      
      // Update schedule state
      this.updateScheduleState(now);
      
      // Check all schedule rules
      const scheduleCheck = this.checkScheduleRules(now, currentTime);
      
      if (!scheduleCheck.allowed) {
        if (this.config.action === 'skip') {
          context.skip = true;
          context.skipReason = scheduleCheck.reason || this.config.skipReason || 'Message not allowed at this time';
          
          this.logger?.info(`ScheduleMiddleware ${this.name} skipped message: ${context.skipReason}`);
          context.data[`${this.name}_scheduled_skip`] = true;
          context.data[`${this.name}_skip_reason`] = context.skipReason;
          
          return; // Don't call next() - stop the chain
        } else if (this.config.action === 'delay') {
          const delayMs = Math.min(scheduleCheck.suggestedDelay || 0, this.config.maxDelayMs || 3600000);
          
          if (delayMs > 0) {
            this.logger?.info(`ScheduleMiddleware ${this.name} delaying message by ${delayMs}ms`);
            context.data[`${this.name}_delayed`] = true;
            context.data[`${this.name}_delay_ms`] = delayMs;
            
            await this.delay(delayMs);
          }
        } else if (this.config.action === 'queue') {
          // For queue action, we would need a separate queueing system
          // For now, we'll just delay until the next allowed time
          const delayMs = scheduleCheck.suggestedDelay || 0;
          if (delayMs > 0 && delayMs <= (this.config.maxDelayMs || 3600000)) {
            this.logger?.info(`ScheduleMiddleware ${this.name} queuing message for ${delayMs}ms`);
            await this.delay(delayMs);
          } else {
            context.skip = true;
            context.skipReason = 'Message queued for too long, skipping';
            return;
          }
        }
      }

      // Update counters
      this.scheduleState.lastMessageTime = currentTime;
      this.scheduleState.messagesThisHour++;
      this.scheduleState.messagesThisDay++;

      this.logger?.debug(`ScheduleMiddleware ${this.name}: Message allowed`);
      context.data[`${this.name}_allowed`] = true;
      context.data[`${this.name}_messages_this_hour`] = this.scheduleState.messagesThisHour;
      context.data[`${this.name}_messages_this_day`] = this.scheduleState.messagesThisDay;

      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`ScheduleMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private updateScheduleState(now: Date): void {
    const currentHour = now.getHours();
    const currentDay = now.getDate();

    // Reset hourly counter
    if (this.scheduleState.currentHour !== currentHour) {
      this.scheduleState.messagesThisHour = 0;
      this.scheduleState.currentHour = currentHour;
    }

    // Reset daily counter
    if (this.scheduleState.currentDay !== currentDay) {
      this.scheduleState.messagesThisDay = 0;
      this.scheduleState.currentDay = currentDay;
    }
  }

  private checkScheduleRules(now: Date, currentTime: number): { allowed: boolean; reason?: string; suggestedDelay?: number } {
    // Check time rules
    if (this.config.timeRules) {
      const timeCheck = this.checkTimeRules(now);
      if (!timeCheck.allowed) {
        return timeCheck;
      }
    }

    // Check date rules
    if (this.config.dateRules) {
      const dateCheck = this.checkDateRules(now);
      if (!dateCheck.allowed) {
        return dateCheck;
      }
    }

    // Check frequency rules
    if (this.config.frequencyRules) {
      const frequencyCheck = this.checkFrequencyRules(currentTime);
      if (!frequencyCheck.allowed) {
        return frequencyCheck;
      }
    }

    return { allowed: true };
  }

  private checkTimeRules(now: Date): { allowed: boolean; reason?: string; suggestedDelay?: number } {
    const rules = this.config.timeRules!;
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Check allowed hours
    if (rules.allowedHours && !rules.allowedHours.includes(hour)) {
      const nextAllowedHour = this.findNextAllowedHour(hour, rules.allowedHours);
      const delayMs = this.calculateDelayToHour(now, nextAllowedHour);
      return {
        allowed: false,
        reason: `Current hour ${hour} not in allowed hours: ${rules.allowedHours.join(', ')}`,
        suggestedDelay: delayMs
      };
    }

    // Check allowed days
    if (rules.allowedDays && !rules.allowedDays.includes(dayOfWeek)) {
      return {
        allowed: false,
        reason: `Current day ${dayOfWeek} not in allowed days: ${rules.allowedDays.join(', ')}`
      };
    }

    // Check quiet hours
    if (rules.quietHours) {
      const { start, end } = rules.quietHours;
      const isQuietTime = (start <= end) 
        ? (hour >= start && hour < end)
        : (hour >= start || hour < end); // Handles overnight quiet hours

      if (isQuietTime) {
        const nextActiveHour = (end + 24) % 24;
        const delayMs = this.calculateDelayToHour(now, nextActiveHour);
        return {
          allowed: false,
          reason: `Current time is during quiet hours (${start}:00 - ${end}:00)`,
          suggestedDelay: delayMs
        };
      }
    }

    return { allowed: true };
  }

  private checkDateRules(now: Date): { allowed: boolean; reason?: string } {
    const rules = this.config.dateRules!;
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check skip dates
    if (rules.skipDates && rules.skipDates.includes(dateString)) {
      return {
        allowed: false,
        reason: `Current date ${dateString} is in skip dates list`
      };
    }

    // Check allow dates (if specified, only these dates are allowed)
    if (rules.allowDates && !rules.allowDates.includes(dateString)) {
      return {
        allowed: false,
        reason: `Current date ${dateString} not in allowed dates list`
      };
    }

    // Check skip ranges
    if (rules.skipRanges) {
      for (const range of rules.skipRanges) {
        if (dateString >= range.start && dateString <= range.end) {
          return {
            allowed: false,
            reason: `Current date ${dateString} is in skip range ${range.start} to ${range.end}`
          };
        }
      }
    }

    return { allowed: true };
  }

  private checkFrequencyRules(currentTime: number): { allowed: boolean; reason?: string; suggestedDelay?: number } {
    const rules = this.config.frequencyRules!;

    // Check minimum interval
    if (rules.minInterval && this.scheduleState.lastMessageTime > 0) {
      const timeSinceLastMessage = currentTime - this.scheduleState.lastMessageTime;
      if (timeSinceLastMessage < rules.minInterval) {
        const delayMs = rules.minInterval - timeSinceLastMessage;
        return {
          allowed: false,
          reason: `Minimum interval not met (${timeSinceLastMessage}ms < ${rules.minInterval}ms)`,
          suggestedDelay: delayMs
        };
      }
    }

    // Check max per hour
    if (rules.maxPerHour && this.scheduleState.messagesThisHour >= rules.maxPerHour) {
      return {
        allowed: false,
        reason: `Maximum messages per hour exceeded (${this.scheduleState.messagesThisHour}/${rules.maxPerHour})`
      };
    }

    // Check max per day
    if (rules.maxPerDay && this.scheduleState.messagesThisDay >= rules.maxPerDay) {
      return {
        allowed: false,
        reason: `Maximum messages per day exceeded (${this.scheduleState.messagesThisDay}/${rules.maxPerDay})`
      };
    }

    return { allowed: true };
  }

  private findNextAllowedHour(currentHour: number, allowedHours: number[]): number {
    const sortedHours = [...allowedHours].sort((a, b) => a - b);
    
    // Find next allowed hour today
    for (const hour of sortedHours) {
      if (hour > currentHour) {
        return hour;
      }
    }
    
    // If no allowed hour today, return first allowed hour tomorrow
    return sortedHours[0];
  }

  private calculateDelayToHour(now: Date, targetHour: number): number {
    const target = new Date(now);
    target.setHours(targetHour, 0, 0, 0);
    
    // If target is in the past today, move to tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    
    return target.getTime() - now.getTime();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}