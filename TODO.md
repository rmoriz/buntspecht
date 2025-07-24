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

### **2.1 Refactor JsonCommandProvider** (~5 iterations)
- **File**: `src/messages/jsonCommandProvider.ts` (334 lines)
- **Tasks**:
  - [ ] Replace manual telemetry spans with `TelemetryHelper.executeWithSpan()`
  - [ ] Replace custom file watcher code with `FileWatcher` utility
  - [ ] Update `generateMessage()` and `generateMessageWithAttachments()` methods
  - [ ] Run tests to ensure no regressions
- **Expected Impact**: ~50 lines reduction, consistent with MultiJsonCommandProvider

### **2.2 Apply TelemetryHelper to Other Services** (~3 iterations)
- **Files to update**:
  - [ ] `src/services/multiProviderScheduler.ts` (768 lines) - Multiple telemetry patterns
  - [ ] `src/services/webhookServer.ts` (939 lines) - Telemetry in request handling
  - [ ] `src/services/blueskyClient.ts` (615 lines) - API call telemetry
  - [ ] `src/services/mastodonClient.ts` - API call telemetry
- **Expected Impact**: ~20-30 lines reduction per file

---

## 🏗️ **Phase 3: Extract Provider Execution Patterns**

### **3.1 Create Provider Execution Strategy** (~7 iterations)
- **Problem**: `MultiProviderScheduler` has 3 similar execution methods:
  - `executeProviderTask()` - 88 lines
  - `executeMultiJsonProviderPerAccount()` - 95 lines  
  - `executeTaskWithAttachments()` - 48 lines
- **Solution**: Extract strategy pattern
- **Files to create**:
  - [ ] `src/services/execution/ProviderExecutionStrategy.ts` (abstract base)
  - [ ] `src/services/execution/StandardProviderStrategy.ts`
  - [ ] `src/services/execution/MultiJsonProviderStrategy.ts`
  - [ ] `src/services/execution/AttachmentProviderStrategy.ts`
- **Expected Impact**: ~150 lines reduction in MultiProviderScheduler

### **3.2 Refactor Message Generation Patterns** (~5 iterations)
- **Problem**: `MultiJsonCommandProvider` has duplicate logic:
  - `generateMessage()` and `generateMessageWithAttachments()` share 80% code
- **Solution**: Extract common message generation logic
- **Files to create**:
  - [ ] `src/messages/multiJson/MessageGenerator.ts`
- **Expected Impact**: ~100 lines reduction

---

## 📦 **Phase 4: Split Large Files**

### **4.1 Split WebhookServer** (~10 iterations)
- **Current**: `src/services/webhookServer.ts` (939 lines)
- **Target Structure**:
  ```
  src/services/webhook/
  ├── WebhookServer.ts (main orchestrator, ~200 lines)
  ├── WebhookRequestHandler.ts (request processing, ~300 lines)
  ├── WebhookRateLimiter.ts (rate limiting logic, ~150 lines)
  ├── WebhookMessageProcessor.ts (message processing, ~200 lines)
  └── WebhookValidator.ts (request validation, ~100 lines)
  ```
- **Benefits**: Better testability, clearer separation of concerns

### **4.2 Split MultiProviderScheduler** (~8 iterations)
- **Current**: `src/services/multiProviderScheduler.ts` (768 lines)
- **Target Structure**:
  ```
  src/services/scheduler/
  ├── MultiProviderScheduler.ts (main orchestrator, ~200 lines)
  ├── ProviderManager.ts (provider lifecycle, ~200 lines)
  ├── ExecutionEngine.ts (task execution, ~250 lines)
  └── CacheWarmer.ts (cache warming logic, ~150 lines)
  ```

### **4.3 Split SecretResolver** (~6 iterations)
- **Current**: `src/services/secretResolver.ts` (677 lines)
- **Target Structure**:
  ```
  src/services/secrets/
  ├── SecretResolver.ts (main resolver, ~200 lines)
  ├── SecretProviderManager.ts (provider management, ~200 lines)
  ├── SecretCache.ts (caching logic, ~150 lines)
  └── SecretValidator.ts (validation, ~100 lines)
  ```

---

## 🧪 **Phase 5: Test Refactoring** (~5 iterations)

### **5.1 Extract Test Utilities**
- **Problem**: Large test files with duplicate setup code
- **Files to refactor**:
  - [ ] `src/__tests__/webhookServer.test.ts` (1316 lines)
  - [ ] `src/__tests__/blueskyClient.test.ts` (598 lines)
  - [ ] `src/__tests__/configLoader.test.ts` (554 lines)
- **Solution**: Create test utilities
- **Files to create**:
  - [ ] `src/__tests__/utils/testHelpers.ts`
  - [ ] `src/__tests__/utils/mockFactories.ts`

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

1. **Phase 2.1**: JsonCommandProvider refactoring (immediate impact)
2. **Phase 2.2**: Apply TelemetryHelper to other services
3. **Phase 3.1**: Provider execution strategy pattern
4. **Phase 4.1**: Split WebhookServer (biggest file)
5. **Phase 3.2**: Message generation patterns
6. **Phase 4.2**: Split MultiProviderScheduler
7. **Phase 4.3**: Split SecretResolver
8. **Phase 5.1**: Test utilities

---

## 📝 **Notes**

- Each phase should be completed with full test coverage
- Commit after each major milestone
- Maintain backward compatibility
- Document new utilities and patterns
- Consider creating migration guide for future developers

---

**Last Updated**: 2025-01-24
**Status**: Phase 1 Complete ✅, Phase 2.1 Ready to Start 🚀