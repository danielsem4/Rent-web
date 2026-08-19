import type { Request, Response, NextFunction } from 'express';
import type { AccountService } from './account.service';
import { FORGOT_PASSWORD_MESSAGE } from './account.service';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type {
  AcceptInvitationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './account.schema';

export function createAccountController(service: AccountService) {
  return {
    async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { token, password } = req.body as AcceptInvitationDto;
        await service.acceptInvitation(token, password, buildAuditContext(req));
        res.json({ message: 'Password set. You can now log in.' });
      } catch (err) {
        next(err);
      }
    },

    async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { email } = req.body as ForgotPasswordDto;
        await service.requestPasswordReset(email, buildAuditContext(req));
        // Always the same 200 body — never reveal whether the account exists.
        res.json({ message: FORGOT_PASSWORD_MESSAGE });
      } catch (err) {
        next(err);
      }
    },

    async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { token, password } = req.body as ResetPasswordDto;
        await service.resetPassword(token, password, buildAuditContext(req));
        res.json({ message: 'Password updated. You can now log in.' });
      } catch (err) {
        next(err);
      }
    },
  };
}
