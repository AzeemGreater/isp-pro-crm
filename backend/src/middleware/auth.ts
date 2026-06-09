import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface JwtPayload {
  adminId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      admin?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.admin = payload;
    next();
  } catch (err) {
    logger.warn(`JWT verification failed: ${err}`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.admin.role)) {
      res.status(403).json({ error: `Access denied. Required roles: ${roles.join(', ')}` });
      return;
    }
    next();
  };
}

export function isAgentRequest(req: Request): boolean {
  return req.admin?.role === 'Agent';
}

export function getActorAdminId(req: Request): string {
  return req.admin?.adminId || '';
}
