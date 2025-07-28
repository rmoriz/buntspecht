export { MessageMiddlewareManager } from './MessageMiddlewareManager';
export { DefaultMessageMiddlewareFactory } from './MessageMiddlewareFactory';
export { 
  MessageMiddleware, 
  MessageMiddlewareContext, 
  MessageMiddlewareFunction,
  MessageMiddlewareConfig,
  MessageMiddlewareResult,
  MessageMiddlewareFactory
} from './types';

// Built-in middleware exports
export { TextTransformMiddleware, TextTransformConfig } from './builtin/TextTransformMiddleware';
export { FilterMiddleware, FilterConfig } from './builtin/FilterMiddleware';
export { CommandMiddleware, CommandConfig } from './builtin/CommandMiddleware';