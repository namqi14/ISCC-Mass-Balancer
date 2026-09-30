import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { AppError } from "../lib/errors";

/** Central error handler. Route handlers can just `throw` -- this turns
 * business-rule errors, validation errors, and Prisma errors into a
 * consistent JSON shape with a plain-English message, per the proposal's
 * "clear explanation whenever an entry is rejected" requirement. */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof MulterError) {
    // e.g. a logo upload (companies.routes.ts) over the size limit -- a
    // real rejected-input case, not a server fault, so this must not fall
    // through to the generic 500 below.
    return res.status(400).json({ error: err.message, code: `UPLOAD_${err.code}` });
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
    return res.status(400).json({ error: message, code: "VALIDATION_ERROR" });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A record with that unique value already exists.", code: "DUPLICATE" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found.", code: "NOT_FOUND" });
    }
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error.", code: "INTERNAL" });
}

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
