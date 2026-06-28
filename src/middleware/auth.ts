// src/middleware/auth.ts
// Protect admin routes with API key

import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

dotenv.config();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid X-API-Key header",
    });
    return;
  }

  next();
}
