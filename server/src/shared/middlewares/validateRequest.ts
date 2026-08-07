import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validateRequest(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(', ');
      res.status(400).json({ message: messages });
      return;
    }
    req.body = result.data;
    next();
  };
}
