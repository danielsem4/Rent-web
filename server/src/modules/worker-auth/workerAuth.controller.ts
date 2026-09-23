import type { Request, Response, NextFunction } from 'express';
import { buildAuditContext } from '../../shared/audit/auditLogger';
import type { LoginIdentifier, WorkerAuthService } from './workerAuth.service';
import type {
  QrStartDto,
  PhoneStartDto,
  VerifyDto,
  ResendDto,
  RefreshDto,
} from './workerAuth.schema';

/** Generic body for start/resend/logout — reveals nothing about account existence. */
const OK = { ok: true } as const;

/** Build the qr-XOR-phone identifier from a validated verify/resend body. */
function identifierFrom(body: { qrToken?: string; phone?: string }): LoginIdentifier {
  return body.qrToken != null ? { qrToken: body.qrToken } : { phone: body.phone as string };
}

export function createWorkerAuthController(service: WorkerAuthService) {
  return {
    async qrStart(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { qrToken } = req.body as QrStartDto;
        await service.startWithQr(qrToken, buildAuditContext(req));
        res.json(OK);
      } catch (err) {
        next(err);
      }
    },

    async phoneStart(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { phone } = req.body as PhoneStartDto;
        await service.startWithPhone(phone, buildAuditContext(req));
        res.json(OK);
      } catch (err) {
        next(err);
      }
    },

    async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as VerifyDto;
        const result = await service.verify(identifierFrom(body), body.code, buildAuditContext(req));
        // Bearer transport: tokens are returned in the body for the native app to
        // store in secure storage (Keychain/Keystore). No cookies are set.
        res.json({
          worker: result.worker,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
        });
      } catch (err) {
        next(err);
      }
    },

    async resend(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as ResendDto;
        await service.resend(identifierFrom(body), buildAuditContext(req));
        res.json(OK);
      } catch (err) {
        next(err);
      }
    },

    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { refreshToken } = req.body as RefreshDto;
        const tokens = await service.refresh(refreshToken, buildAuditContext(req));
        res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      } catch (err) {
        next(err);
      }
    },

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { refreshToken } = req.body as RefreshDto;
        await service.logout(refreshToken, buildAuditContext(req));
        res.json(OK);
      } catch (err) {
        next(err);
      }
    },
  };
}
