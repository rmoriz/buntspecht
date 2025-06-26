import * as cron from 'node-cron';
import { MastodonClient } from './mastodonClient';
import { BotConfig } from '../types/config';
import { Logger } from '../utils/logger';

export class BotScheduler {
  private mastodonClient: MastodonClient;
  private config: BotConfig;
  private logger: Logger;
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor(mastodonClient: MastodonClient, config: BotConfig, logger: Logger) {
    this.mastodonClient = mastodonClient;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Starts the bot scheduler
   */
  public start(): void {
    if (this.isRunning) {
      this.logger.warn('Bot scheduler is already running');
      return;
    }

    if (!cron.validate(this.config.bot.cronSchedule)) {
      throw new Error(`Invalid cron schedule: ${this.config.bot.cronSchedule}`);
    }

    this.logger.info(`Starting bot scheduler with cron: ${this.config.bot.cronSchedule}`);
    this.logger.info(`Message to post: "${this.config.bot.message}"`);

    this.task = cron.schedule(this.config.bot.cronSchedule, async () => {
      await this.executeTask();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.task.start();
    this.isRunning = true;
    this.logger.info('Bot scheduler started successfully');
  }

  /**
   * Stops the bot scheduler
   */
  public stop(): void {
    if (!this.isRunning || !this.task) {
      this.logger.warn('Bot scheduler is not running');
      return;
    }

    this.task.stop();
    this.task = null;
    this.isRunning = false;
    this.logger.info('Bot scheduler stopped');
  }

  /**
   * Executes a single task (posts the message)
   */
  public async executeTask(): Promise<void> {
    try {
      this.logger.debug('Executing scheduled task...');
      await this.mastodonClient.postStatus(this.config.bot.message);
      this.logger.debug('Scheduled task completed successfully');
    } catch (error) {
      this.logger.error('Failed to execute scheduled task:', error);
      // Don't throw here to prevent the scheduler from stopping
    }
  }

  /**
   * Executes the task immediately (for testing or manual execution)
   */
  public async executeTaskNow(): Promise<void> {
    this.logger.info('Executing task immediately...');
    await this.executeTask();
  }

  /**
   * Returns whether the scheduler is currently running
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Returns the current cron schedule
   */
  public getSchedule(): string {
    return this.config.bot.cronSchedule;
  }
}