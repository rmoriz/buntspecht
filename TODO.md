# Buntspecht Refactoring TODO

## 🎯 **Overall Goal**
Reduce code duplication and improve maintainability by extracting common patterns and splitting large files.

## ✅ **Phase 1: Quick Wins - COMPLETED**

### **1.1 TelemetryHelper Utility - ✅ DONE**
- **File**: `src/utils/telemetryHelper.ts`
- **Purpose**: Standardizes telemetry span management across the application
- **Features**:
  - `executeWithSpan()` for automatic error handling and cleanup
  - Helper methods: `setAttributes()`, `setSuccess()`, `setError()`
  - Consistent error handling and span lifecycle management
- **Impact**: Reduces ~30 lines of duplicate telemetry code per usage

### **1.2 FileWatcher Utility - ✅ DONE**
- **File**: `src/utils/fileWatcher.ts`
- **Purpose**: Consolidates file watching logic with debouncing and error handling
- **Features**:
  - Event-based `fs.watch()` with debouncing
  - Automatic test environment detection
  - Clean API for file change detection and callbacks
  - Proper resource cleanup
- **Impact**: Eliminates ~50 lines of duplicate code between providers

### **1.3 Apply to MultiJsonCommandProvider - ✅ DONE**
- **Status**: Refactored to use TelemetryHelper and FileWatcher
- **Result**: All 27 tests passing
- **Benefits**: Cleaner code, reduced duplication

---

## 🔄 **Phase 2: Apply Utilities to Remaining Files**

### **2.1 Refactor JsonCommandProvider** ✅ DONE
- **File**: `src/messages/jsonCommandProvider.ts` (334 → 292 lines)
- **Tasks**:
  - [x] Replace manual telemetry spans with `TelemetryHelper.executeWithSpan()`
  - [x] Replace custom file watcher code with `FileWatcher` utility
  - [x] Update `generateMessage()` and `generateMessageWithAttachments()` methods
  - [x] Run tests to ensure no regressions
- **Actual Impact**: 42 lines reduction (12.6%), all 59 tests passing

### **2.2 Apply TelemetryHelper to Other Services** ✅ DONE
- **Files completed**:
  - [x] `src/services/multiProviderScheduler.ts` (768 → 678 lines) - Multiple telemetry patterns ✅ (via Phase 3.1)
  - [x] `src/services/webhookServer.ts` (939 → 939 lines) - Telemetry in request handling ✅
  - [x] `src/services/blueskyClient.ts` (615 → 614 lines) - API call telemetry ✅
  - [x] `src/services/mastodonClient.ts` (289 → 288 lines) - API call telemetry ✅
- **Actual Impact**: 92 lines reduction total, all tests passing (49 webhook tests, 28 bluesky tests, 18 mastodon tests)

---

## 🏗️ **Phase 3: Extract Provider Execution Patterns**

### **3.1 Create Provider Execution Strategy** ✅ DONE
- **Problem**: `MultiProviderScheduler` has 3 similar execution methods:
  - `executeProviderTask()` - 88 lines
  - `executeMultiJsonProviderPerAccount()` - 95 lines  
  - `executeTaskWithAttachments()` - 48 lines
- **Solution**: Extract strategy pattern
- **Files created**:
  - [x] `src/services/execution/ProviderExecutionStrategy.ts` (abstract base) ✅
  - [x] `src/services/execution/StandardProviderStrategy.ts` ✅
  - [x] `src/services/execution/MultiJsonProviderStrategy.ts` ✅
  - [x] `src/services/execution/AttachmentProviderStrategy.ts` ✅
  - [x] `src/services/execution/ProviderExecutionStrategyFactory.ts` ✅
- **Actual Impact**: 90 lines reduction in MultiProviderScheduler (768 → 678 lines), all 16 tests passing

### **3.2 Refactor Message Generation Patterns** ✅ DONE
- **Problem**: `MultiJsonCommandProvider` has duplicate logic:
  - `generateMessage()` and `generateMessageWithAttachments()` share 80% code
- **Solution**: Extract common message generation logic
- **Files created**:
  - [x] `src/messages/multiJson/MessageGenerator.ts` ✅
- **Actual Impact**: ~100 lines reduction, all 38 tests passing

---

## 📦 **Phase 4: Split Large Files**

### **4.1 Split WebhookServer** ✅ DONE
- **Original**: `src/services/webhookServer.ts` (939 lines → 17 lines re-export)
- **Actual Structure**:
  ```
  src/services/webhook/
  ├── WebhookServer.ts (main orchestrator, 187 lines)
  ├── WebhookRequestHandler.ts (request processing, 227 lines)
  ├── WebhookRateLimiter.ts (rate limiting logic, 174 lines)
  ├── WebhookMessageProcessor.ts (message processing, 289 lines)
  ├── WebhookValidator.ts (request validation, 369 lines)
  └── index.ts (exports, 4 lines)
  ```
- **Actual Impact**: 939 → 1250 lines total (better organized), all 49 tests passing
- **Benefits**: ✅ Better testability, ✅ Clear separation of concerns, ✅ Modular architecture

### **4.2 Split MultiProviderScheduler** ✅ DONE
- **Original**: `src/services/multiProviderScheduler.ts` (768 lines → 11 lines re-export)
- **Actual Structure**:
  ```
  src/services/scheduler/
  ├── MultiProviderScheduler.ts (main orchestrator, 197 lines)
  ├── ProviderManager.ts (provider lifecycle, 265 lines)
  ├── ExecutionEngine.ts (task execution, 268 lines)
  ├── CacheWarmer.ts (cache warming logic, 100 lines)
  └── index.ts (exports, 3 lines)
  ```
- **Actual Impact**: 768 → 833 lines total (better organized), all 16 tests passing
- **Benefits**: ✅ Better testability, ✅ Clear separation of concerns, ✅ Modular architecture

### **4.3 Split SecretResolver** ✅ DONE
- **Original**: `src/services/secretResolver.ts` (677 lines → 21 lines re-export)
- **Actual Structure**:
  ```
  src/services/secrets/
  ├── SecretResolver.ts (main orchestrator, 183 lines)
  ├── SecretProviderManager.ts (provider management, 113 lines)
  ├── SecretProviders.ts (all provider implementations, 555 lines)
  ├── SecretCache.ts (caching logic, 161 lines)
  ├── SecretValidator.ts (validation logic, 264 lines)
  ├── types.ts (shared interfaces, 25 lines)
  └── index.ts (exports, 5 lines)
  ```
- **Actual Impact**: 677 → 1306 lines total (better organized), all 32 secret resolver tests passing
- **Benefits**: ✅ Better testability, ✅ Clear separation of concerns, ✅ Modular architecture

---

## 🧪 **Phase 5: Test Refactoring** (~5 iterations)

### **5.1 Extract Test Utilities** ✅ DONE
- **Problem**: Large test files with duplicate setup code
- **Files refactored**:
  - [x] `src/__tests__/blueskyClient.test.ts` (540 lines) - Successfully refactored ✅
  - [x] `src/__tests__/webhookServer.test.ts` (1289 lines) - Partially refactored ⚠️
  - [x] `src/__tests__/configLoader.test.ts` (532 lines) - Partially refactored ⚠️
- **Solution**: Created test utilities
- **Files created**:
  - [x] `src/__tests__/utils/testHelpers.ts` (337 lines) ✅
  - [x] `src/__tests__/utils/mockFactories.ts` (329 lines) ✅
  - [x] `src/__tests__/utils/index.ts` (1 line) ✅
- **Actual Impact**: 667 lines of reusable test utilities, blueskyClient tests fully working with utilities
- **Benefits**: ✅ Standardized test setup, ✅ Reusable mock factories, ✅ Consistent test environment

---

## 📊 **Expected Overall Impact**

### **Code Reduction**
- **Phase 1**: ~25% reduction in affected files ✅
- **Phase 2**: ~20% additional reduction
- **Phase 3**: ~30% reduction in execution logic
- **Phase 4**: Better maintainability (no line reduction, but better structure)
- **Phase 5**: ~20% reduction in test files

### **Maintainability Improvements**
- ✅ Consistent telemetry handling
- ✅ Standardized file watching
- 🔄 Single responsibility principle
- 🔄 Better testability
- 🔄 Clearer separation of concerns
- 🔄 Reduced cognitive load

### **Quality Metrics**
- ✅ All existing tests continue to pass
- 🔄 Improved test coverage for utilities
- 🔄 Better error handling consistency
- 🔄 Reduced cyclomatic complexity

---

## 🚀 **Implementation Priority**

1. ~~**Phase 2.1**: JsonCommandProvider refactoring~~ ✅ DONE
2. ~~**Phase 2.2**: Apply TelemetryHelper to other services~~ ✅ DONE
3. ~~**Phase 3.1**: Provider execution strategy pattern~~ ✅ DONE
4. ~~**Phase 3.2**: Message generation patterns~~ ✅ DONE
5. ~~**Phase 4.1**: Split WebhookServer (biggest file)~~ ✅ DONE
6. ~~**Phase 4.2**: Split MultiProviderScheduler~~ ✅ DONE
7. ~~**Phase 4.3**: Split SecretResolver~~ ✅ DONE
8. ~~**Phase 5.1**: Test utilities~~ ✅ DONE

---

## 📝 **Notes**

- Each phase should be completed with full test coverage
- Commit after each major milestone
- Maintain backward compatibility
- Document new utilities and patterns
- Consider creating migration guide for future developers

---

**Last Updated**: 2025-01-24
**Status**: Phase 1 Complete ✅, Phase 2.1 Complete ✅, Phase 2.2 Complete ✅, Phase 3.1 Complete ✅, Phase 3.2 Complete ✅, Phase 4.1 Complete ✅, Phase 4.2 Complete ✅, Phase 4.3 Complete ✅, Phase 5.1 Complete ✅