import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AdminAuditLog } from '../admin-audit/admin-audit-log.entity';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AdminPrincipal } from '../admin-auth/admin-auth.guard';
import { AdminRequestMeta } from '../admin-auth/admin-auth.service';
import { User, UserStatus } from '../auth/entities/user.entity';
import { AdminUserService } from './admin-user.service';

const IDS = {
  newest: '11111111-1111-4111-8111-111111111111',
  profiled: '22222222-2222-4222-8222-222222222222',
  guest: '33333333-3333-4333-8333-333333333333',
  deleted: '44444444-4444-4444-8444-444444444444',
};

const ADMIN: AdminPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  username: 'admin',
  roleCode: 'super_admin',
};

const META: AdminRequestMeta = {
  ip: '127.0.0.1',
  userAgent: 'jest-browser',
};

describe('AdminUserService', () => {
  let dataSource: DataSource;
  let users: Repository<User>;
  let audits: Repository<AdminAuditLog>;
  let audit: AdminAuditService;
  let service: AdminUserService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      dropSchema: true,
      entities: [User, AdminAuditLog],
    });
    await dataSource.initialize();
    users = dataSource.getRepository(User);
    audits = dataSource.getRepository(AdminAuditLog);
    audit = new AdminAuditService(audits);
    service = new AdminUserService(users, dataSource, audit);

    await users.save([
      users.create({
        id: IDS.profiled,
        phone: '13800000002',
        status: UserStatus.PROFILED,
        is_elderly: true,
        care_mode: true,
        created_at: new Date('2026-08-10T08:00:00.000Z'),
        updated_at: new Date('2026-08-10T08:00:00.000Z'),
        last_login_at: new Date('2026-08-11T08:00:00.000Z'),
      }),
      users.create({
        id: IDS.newest,
        phone: '13900000001',
        status: UserStatus.REGISTERED,
        is_elderly: false,
        care_mode: false,
        created_at: new Date('2026-08-12T08:00:00.000Z'),
        updated_at: new Date('2026-08-12T08:00:00.000Z'),
        last_login_at: null,
      }),
      users.create({
        id: IDS.guest,
        phone: null,
        status: UserStatus.GUEST,
        is_elderly: false,
        care_mode: false,
        created_at: new Date('2026-08-09T08:00:00.000Z'),
        updated_at: new Date('2026-08-09T08:00:00.000Z'),
        last_login_at: null,
      }),
      users.create({
        id: IDS.deleted,
        phone: '13700000009',
        status: UserStatus.ACTIVE,
        is_elderly: false,
        care_mode: false,
        created_at: new Date('2026-08-13T08:00:00.000Z'),
        updated_at: new Date('2026-08-13T08:00:00.000Z'),
        last_login_at: null,
        deleted_at: new Date('2026-08-13T09:00:00.000Z'),
      }),
    ]);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('returns undeleted users newest first with stable pagination metadata', async () => {
    const result = await service.listUsers({ page: 1, pageSize: 2 });

    expect(result).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(result.items.map((user) => user.id)).toEqual([IDS.newest, IDS.profiled]);
    expect(result.items[0]).toEqual({
      id: IDS.newest,
      phone: '13900000001',
      status: UserStatus.REGISTERED,
      isElderly: false,
      careMode: false,
      accountState: 'enabled',
      disabledAt: null,
      deletedAt: null,
      createdAt: '2026-08-12T08:00:00.000Z',
      lastLoginAt: null,
    });
  });

  it('filters by partial phone or user id together with account status', async () => {
    await expect(service.listUsers({ keyword: '00000002', status: UserStatus.PROFILED }))
      .resolves.toMatchObject({ total: 1, items: [{ id: IDS.profiled }] });

    await expect(service.listUsers({ keyword: IDS.newest.slice(0, 8) }))
      .resolves.toMatchObject({ total: 1, items: [{ id: IDS.newest }] });
  });

  it('casts UUID user ids to text before case-insensitive matching', async () => {
    const builder = users.createQueryBuilder('user');
    const andWhere = jest.spyOn(builder, 'andWhere');
    jest.spyOn(users, 'createQueryBuilder').mockReturnValue(builder);

    await service.listUsers({ keyword: IDS.newest.slice(0, 8) });

    expect(andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(CAST(user.id AS TEXT))'),
      expect.any(Object),
    );
  });

  it('normalizes unsafe page inputs at the service boundary', async () => {
    const result = await service.listUsers({ page: 0, pageSize: 500 });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
  });

  it('returns only safe account fields for a user detail', async () => {
    const result = await service.getUser(IDS.profiled);

    expect(result).toEqual({
      id: IDS.profiled,
      phone: '13800000002',
      status: UserStatus.PROFILED,
      isElderly: true,
      careMode: true,
      accountState: 'enabled',
      disabledAt: null,
      deletedAt: null,
      createdAt: '2026-08-10T08:00:00.000Z',
      lastLoginAt: '2026-08-11T08:00:00.000Z',
    });
    expect(result).not.toHaveProperty('openid');
    expect(result).not.toHaveProperty('unionid');
  });

  it('treats missing and soft-deleted users as not found', async () => {
    await expect(service.getUser(IDS.deleted)).rejects.toMatchObject({ status: 404 });
    await expect(service.getUser('99999999-9999-4999-8999-999999999999'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('creates a registered phone user with safe defaults and a success audit', async () => {
    const result = await service.createUser({ phone: '13600000001' }, ADMIN, META);

    expect(result).toMatchObject({
      phone: '13600000001',
      status: UserStatus.REGISTERED,
      isElderly: false,
      careMode: false,
      lastLoginAt: null,
    });
    expect(result).not.toHaveProperty('openid');
    expect(result).not.toHaveProperty('unionid');
    await expect(audits.findOneByOrFail({ action: 'USER_CREATE' })).resolves.toMatchObject({
      adminUserId: ADMIN.id,
      resourceId: result.id,
      resourceType: 'user',
      success: true,
      ipAddress: META.ip,
      userAgent: META.userAgent,
      afterData: {
        phone: '13600000001',
        status: UserStatus.REGISTERED,
        isElderly: false,
        careMode: false,
      },
    });
  });

  it('rejects a duplicate phone and audits only a masked phone number', async () => {
    await expect(
      service.createUser({ phone: '13900000001' }, ADMIN, META),
    ).rejects.toMatchObject({ status: 409 });

    const failure = await audits.findOneByOrFail({ action: 'USER_CREATE', success: false });
    expect(failure.afterData).toEqual({ phone: '139****0001' });
    expect(JSON.stringify(failure)).not.toContain('13900000001');
  });

  it('converts a PostgreSQL phone unique violation to a conflict', async () => {
    jest.spyOn(dataSource, 'transaction').mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT INTO users',
        [],
        Object.assign(new Error('duplicate phone'), {
          code: '23505',
          constraint: 'UQ_users_phone',
          detail: 'Key (phone) already exists',
        }),
      ),
    );

    await expect(
      service.createUser({ phone: '13600000004' }, ADMIN, META),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('does not misclassify an unrelated PostgreSQL unique violation as a phone conflict', async () => {
    const databaseError = new QueryFailedError(
      'INSERT INTO users',
      [],
      Object.assign(new Error('duplicate openid'), {
        code: '23505',
        constraint: 'UQ_users_openid',
        detail: 'Key (openid) already exists',
      }),
    );
    jest.spyOn(dataSource, 'transaction').mockRejectedValueOnce(databaseError);

    await expect(
      service.createUser({ phone: '13600000005' }, ADMIN, META),
    ).rejects.toBe(databaseError);
  });

  it('updates only provided fields and audits the before and after snapshots', async () => {
    const result = await service.updateUser(
      IDS.newest,
      { phone: '13600000002', careMode: true },
      ADMIN,
      META,
    );

    expect(result).toMatchObject({
      phone: '13600000002',
      careMode: true,
      isElderly: false,
      status: UserStatus.REGISTERED,
    });
    await expect(
      audits.findOneByOrFail({ action: 'USER_UPDATE', success: true }),
    ).resolves.toMatchObject({
      adminUserId: ADMIN.id,
      resourceId: IDS.newest,
      resourceType: 'user',
      beforeData: {
        phone: '13900000001',
        status: UserStatus.REGISTERED,
        isElderly: false,
        careMode: false,
      },
      afterData: {
        phone: '13600000002',
        status: UserStatus.REGISTERED,
        isElderly: false,
        careMode: true,
      },
      success: true,
    });
  });

  it('rejects an empty update and records the failed attempt', async () => {
    await expect(service.updateUser(IDS.newest, {}, ADMIN, META))
      .rejects.toMatchObject({ status: 400 });

    await expect(
      audits.findOneByOrFail({ action: 'USER_UPDATE', success: false }),
    ).resolves.toMatchObject({
      adminUserId: ADMIN.id,
      resourceId: IDS.newest,
      afterData: {},
      success: false,
    });
  });

  it('does not edit missing or soft-deleted users and records failed attempts', async () => {
    await expect(
      service.updateUser(IDS.deleted, { careMode: true }, ADMIN, META),
    ).rejects.toMatchObject({ status: 404 });

    expect((await users.findOneByOrFail({ id: IDS.deleted })).care_mode).toBe(false);
    await expect(
      audits.findOneByOrFail({ action: 'USER_UPDATE', resourceId: IDS.deleted }),
    ).resolves.toMatchObject({ success: false, afterData: { careMode: true } });
  });

  it('rejects an occupied phone during editing without changing the user', async () => {
    await expect(
      service.updateUser(IDS.newest, { phone: '13800000002' }, ADMIN, META),
    ).rejects.toMatchObject({ status: 409 });

    expect((await users.findOneByOrFail({ id: IDS.newest })).phone).toBe('13900000001');
    const failure = await audits.findOneByOrFail({ action: 'USER_UPDATE', success: false });
    expect(failure.afterData).toEqual({ phone: '138****0002' });
  });

  it('rolls back a user update when its success audit cannot be written', async () => {
    jest.spyOn(audit, 'record').mockImplementation(async (entry, manager) => {
      if (entry.success && manager) throw new Error('audit unavailable');
    });

    await expect(
      service.updateUser(IDS.newest, { careMode: true }, ADMIN, META),
    ).rejects.toThrow('audit unavailable');

    expect((await users.findOneByOrFail({ id: IDS.newest })).care_mode).toBe(false);
  });

  it('rolls back a newly created user when its success audit cannot be written', async () => {
    jest.spyOn(audit, 'record').mockImplementation(async (entry, manager) => {
      if (entry.success && manager) throw new Error('audit unavailable');
    });

    await expect(
      service.createUser({ phone: '13600000006' }, ADMIN, META),
    ).rejects.toThrow('audit unavailable');

    await expect(users.findOneBy({ phone: '13600000006' })).resolves.toBeNull();
  });

  it('preserves the original conflict when failure auditing is unavailable', async () => {
    jest.spyOn(audit, 'record').mockRejectedValue(new Error('audit unavailable'));

    await expect(
      service.createUser({ phone: '13900000001' }, ADMIN, META),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('removes the full requested phone from unexpected failure audit messages', async () => {
    jest.spyOn(dataSource, 'transaction').mockRejectedValueOnce(
      new Error('database rejected payload phone=13600000003'),
    );

    await expect(
      service.createUser({ phone: '13600000003' }, ADMIN, META),
    ).rejects.toThrow('database rejected payload phone=13600000003');

    const failure = await audits.findOneByOrFail({ action: 'USER_CREATE', success: false });
    expect(failure.errorMessage).toContain('136****0003');
    expect(failure.errorMessage).not.toContain('13600000003');
  });
});
