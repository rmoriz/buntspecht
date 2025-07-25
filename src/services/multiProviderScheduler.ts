// Re-export the new modular multi-provider scheduler for backward compatibility
export { MultiProviderScheduler } from './scheduler';

// This file has been refactored into a modular structure.
// The original MultiProviderScheduler class is now split into multiple components:
// - MultiProviderScheduler: Main orchestrator (coordination between components)
// - ProviderManager: Provider lifecycle management (initialization, configuration)
// - CacheWarmer: Cache warming logic for providers
// - ExecutionEngine: Task execution, scheduling, and push provider handling
//
// All functionality remains the same, but the code is now better organized
// and more maintainable with clear separation of concerns.