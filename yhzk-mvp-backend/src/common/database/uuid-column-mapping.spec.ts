import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { AdminAuditLog } from '../../modules/admin-audit/admin-audit-log.entity';
import { AdminPermission } from '../../modules/admin-auth/entities/admin-permission.entity';
import { AdminRolePermission } from '../../modules/admin-auth/entities/admin-role-permission.entity';
import { AdminRole } from '../../modules/admin-auth/entities/admin-role.entity';
import { AdminUser } from '../../modules/admin-auth/entities/admin-user.entity';
import { AvatarGenerationTask } from '../../modules/avatar-admin/entities/avatar-generation-task.entity';
import { DigitalHumanAvatar } from '../../modules/avatar-admin/entities/digital-human-avatar.entity';
import { UserAvatarAssignment } from '../../modules/avatar-admin/entities/user-avatar-assignment.entity';

const entities = [
  AdminAuditLog,
  AdminPermission,
  AdminRolePermission,
  AdminRole,
  AdminUser,
  AvatarGenerationTask,
  DigitalHumanAvatar,
  UserAvatarAssignment,
];

const migratedUuidColumns: Array<{
  entity: EntityTarget<ObjectLiteral>;
  property: string;
}> = [
  { entity: AdminUser, property: 'roleId' },
  { entity: AdminRolePermission, property: 'roleId' },
  { entity: AdminRolePermission, property: 'permissionId' },
  { entity: AdminAuditLog, property: 'adminUserId' },
  { entity: AvatarGenerationTask, property: 'taskId' },
  { entity: AvatarGenerationTask, property: 'createdBy' },
  { entity: DigitalHumanAvatar, property: 'createdBy' },
  { entity: UserAvatarAssignment, property: 'userId' },
  { entity: UserAvatarAssignment, property: 'assignedBy' },
];

describe('migrated UUID column mappings', () => {
  it('builds valid metadata for the configured database driver', async () => {
    const lightweight =
      process.env.DB_LIGHTWEIGHT === 'true' || process.env.NODE_ENV === 'test';
    const dataSource = new DataSource(
      lightweight
        ? {
            type: 'sqlite',
            database: ':memory:',
            entities,
          }
        : {
            type: 'postgres',
            database: 'metadata_validation_only',
            entities,
          },
    );

    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    for (const { entity, property } of migratedUuidColumns) {
      const column = dataSource
        .getMetadata(entity)
        .columns.find((candidate) => candidate.propertyName === property);

      expect(column).toBeDefined();
      expect(column?.type).toBe('uuid');
      expect(column?.length).toBe('');
    }
  });
});
