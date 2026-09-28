import { Request } from 'express';
import { AdminPrincipal } from './admin-auth.guard';
import { AdminRequestMeta } from './admin-auth.service';

export interface AdminAuthDtoRequest extends Request {
  admin: AdminPrincipal;
}

export function requestMeta(request: Request): AdminRequestMeta {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return {
    ip: forwardedIp?.trim() || request.ip || request.socket?.remoteAddress || null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}
