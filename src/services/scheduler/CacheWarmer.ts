import { Logger } from '../../utils/logger';
import { ScheduledProvider } from './ProviderManager';
import { ProviderConfig } from '../../types/config';

/**
 * Handles cache warming logic for providers that support it
 */
export class CacheWarmer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Warms the cache for all providers that support it
   */
  public async warmCache(
    scheduledProviders: ScheduledProvider[],
    getProviderConfigs: () => ProviderConfig[]
  ): Promise<void> {
    this.logger.info('Warming cache for all applicable providers...');
    
    let totalProviders = 0;
    let successfulProviders = 0;
    let failedProviders = 0;
    let skippedProviders = 0;
    
    for (const scheduledProvider of scheduledProviders) {
      totalProviders++;
      
      if (typeof scheduledProvider.provider.warmCache === 'function') {
        this.logger.info(`Warming cache for provider: ${scheduledProvider.name}`);
        
        let providerSuccess = false;
        
        try {
          // For providers that are account-aware, warm cache per account
          if (scheduledProvider.provider.getProviderName() === 'multijsoncommand') {
            const providerConfig = getProviderConfigs().find(p => p.name === scheduledProvider.name);
            if (providerConfig && providerConfig.accounts) {
              let accountSuccesses = 0;
              let accountFailures = 0;
              
              for (const accountName of providerConfig.accounts) {
                try {
                  await scheduledProvider.provider.warmCache(accountName);
                  accountSuccesses++;
                  this.logger.debug(`Successfully warmed cache for provider "${scheduledProvider.name}" and account "${accountName}"`);
                } catch (error) {
                  accountFailures++;
                  this.logger.warn(`Failed to warm cache for provider "${scheduledProvider.name}" and account "${accountName}": ${(error as Error).message}`);
                  this.logger.debug(`Full error details for provider "${scheduledProvider.name}" and account "${accountName}":`, error);
                }
              }
              
              if (accountSuccesses > 0) {
                providerSuccess = true;
                this.logger.info(`Provider "${scheduledProvider.name}": ${accountSuccesses} accounts succeeded, ${accountFailures} accounts failed`);
              } else {
                this.logger.warn(`Provider "${scheduledProvider.name}": All ${accountFailures} accounts failed to warm cache`);
              }
            } else {
              this.logger.warn(`Provider "${scheduledProvider.name}": No accounts configured for cache warming`);
            }
          } else {
            // For other providers, call warmCache without account name
            try {
              await scheduledProvider.provider.warmCache();
              providerSuccess = true;
              this.logger.info(`Successfully warmed cache for provider "${scheduledProvider.name}"`);
            } catch (error) {
              this.logger.warn(`Failed to warm cache for provider "${scheduledProvider.name}": ${(error as Error).message}`);
              this.logger.debug(`Full error details for provider "${scheduledProvider.name}":`, error);
            }
          }
          
          if (providerSuccess) {
            successfulProviders++;
          } else {
            failedProviders++;
          }
        } catch (error) {
          failedProviders++;
          this.logger.error(`Unexpected error warming cache for provider "${scheduledProvider.name}":`, error);
        }
      } else {
        skippedProviders++;
        this.logger.debug(`Provider "${scheduledProvider.name}" does not support cache warming.`);
      }
    }
    
    this.logger.info(`Cache warming completed: ${successfulProviders} successful, ${failedProviders} failed, ${skippedProviders} skipped (${totalProviders} total providers)`);
    
    if (failedProviders > 0 && successfulProviders === 0) {
      this.logger.warn('All cache warming attempts failed, but this is not critical for operation');
    } else if (failedProviders > 0) {
      this.logger.warn(`Some providers failed cache warming, but ${successfulProviders} succeeded`);
    }
  }
}