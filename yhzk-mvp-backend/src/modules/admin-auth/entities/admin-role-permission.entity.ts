import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { portableDateColumnType } from '../../../common/database/column-types';

@Entity('admin_role_permissions')
export class AdminRolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;

  @CreateDateColumn({ name: 'created_at', type: portableDateColumnType })
  createdAt!: Date;
}
