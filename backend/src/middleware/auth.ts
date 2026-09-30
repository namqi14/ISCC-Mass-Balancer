import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { verifyToken } from "../lib/authTokens";

/** Every route below /api except /api/auth/login requires a valid JWT. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }
  try {
    req.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

/** RBAC gate, roles per Database Schema.pdf's user_role enum: SUPER_ADMIN
 * and COMPANY_ADMIN and COMPANY_USER can all write; user management and
 * period close are COMPANY_ADMIN-only (see individual routes). Phase 1 is
 * single-tenant, so SUPER_ADMIN is treated as company-scoped for now too --
 * see the schema header comment for what's deferred to a multi-tenant phase. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `This action requires one of the following roles: ${roles.join(", ")}.` });
    }
    next();
  };
}
