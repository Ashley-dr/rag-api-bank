import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import helmet from "helmet";

// Basic security headers
export const securityHeaders: RequestHandler = helmet();

// General rate limit for most endpoints
export const generalLimiter: RequestHandler = (rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Rate limit exceeded" },
}) as unknown) as RequestHandler;

// General slowdown to add delays after too many requests
export const slowDownMiddleware: RequestHandler = ((slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 80, // allow 80 requests then start adding delays
  delayMs: 500, // begin adding 500ms per request
}) as unknown) as RequestHandler);

// Stricter limits for chat endpoint (short window)
export const chatLimiter: RequestHandler = ((rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Chat rate limit exceeded" },
}) as unknown) as RequestHandler);

export const chatSlowDown: RequestHandler = ((slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 5, // after 5 requests start delaying
  delayMs: 500, // add 500ms delay per request
}) as unknown) as RequestHandler);

export default {};
