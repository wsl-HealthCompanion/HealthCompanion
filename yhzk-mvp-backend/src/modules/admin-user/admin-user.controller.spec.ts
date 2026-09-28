import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminUserController } from './admin-user.controller';

describe('AdminUserController contract', () => {
  it('protects the admin user routes with the administrator guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminUserController) || [];
    expect(guards).toContain(AdminAuthGuard);
  });

  it('exposes only GET routes under admin/users', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminUserController)).toBe('admin/users');
    const methods = ['listUsers', 'getUser'] as const;
    for (const name of methods) {
      const handler = AdminUserController.prototype[name];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    }
    expect(Reflect.getMetadata(PATH_METADATA, AdminUserController.prototype.listUsers)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, AdminUserController.prototype.getUser)).toBe(':userId');
  });
});
