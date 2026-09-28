import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AdminAuditLog } from './admin-audit-log.entity';

export interface AdminAuditEntry {
  adminUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  success: boolean;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repository: Repository<AdminAuditLog>,
  ) {}

  async record(entry: AdminAuditEntry, manager?: EntityManager): Promise<void> {
    const repository = manager
      ? manager.getRepository(AdminAuditLog)
      : this.repository;
    const audit = repository.create({
      adminUserId: entry.adminUserId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
    await repository.save(audit);
  }

  async listRecent(limit = 20, resourceType?: string): Promise<AdminAuditLog[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.repository.find({
      where: resourceType ? { resourceType } : {},
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
  }
}
