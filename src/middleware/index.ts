/**
 * Middleware module — request/response interceptors for SDK extensibility.
 *
 * @module middleware
 */

export { createMiddleware } from './middleware.pipeline';
export type {
  Middleware,
  RequestMiddlewarePayload,
  ResponseMiddlewarePayload,
  ErrorMiddlewarePayload,
} from './middleware.types';
