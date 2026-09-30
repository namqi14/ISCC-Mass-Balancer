import { JwtPayload } from "../lib/authTokens";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
