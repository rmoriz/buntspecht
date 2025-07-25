// Re-export the new modular webhook server for backward compatibility
export { 
  WebhookServer, 
  WebhookConfig, 
  WebhookRequest, 
  WebhookResponse 
} from './webhook';

// This file has been refactored into a modular structure.
// The original WebhookServer class is now split into multiple components:
// - WebhookServer: Main orchestrator (server lifecycle)
// - WebhookRequestHandler: HTTP request processing and routing
// - WebhookValidator: Request validation and authentication
// - WebhookMessageProcessor: Message processing and JSON workflow
// - WebhookRateLimiter: Rate limiting functionality
//
// All functionality remains the same, but the code is now better organized
// and more maintainable with clear separation of concerns.