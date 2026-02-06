import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "backend-common/config";

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  userId: string;
}

/**
 * Extracts token from Authorization header (Bearer <token>) or from cookie.
 */
function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === "string") {
    const match = cookieHeader.match(/\btoken=([^;]*)/);
    const value = match?.[1];
    if (value) return value.trim() || null;
  }
  return null;
}

export default function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ message: "Missing or invalid token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as AuthRequest).userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}
