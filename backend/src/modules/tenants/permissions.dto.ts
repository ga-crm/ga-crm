import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsEnum, ValidateNested } from 'class-validator';
import { DEFAULT_GRANTS, Permission } from '../../common/rbac.js';

const permissionList = (example: Permission[]) =>
  ApiProperty({
    enum: Permission,
    enumName: 'Permission',
    isArray: true,
    example,
  });

export class GrantsDto {
  @permissionList(DEFAULT_GRANTS.ADMIN)
  @IsArray()
  @IsEnum(Permission, { each: true })
  ADMIN: Permission[];

  @permissionList(DEFAULT_GRANTS.BM)
  @IsArray()
  @IsEnum(Permission, { each: true })
  BM: Permission[];

  @permissionList(DEFAULT_GRANTS.UM)
  @IsArray()
  @IsEnum(Permission, { each: true })
  UM: Permission[];

  @permissionList(DEFAULT_GRANTS.FC)
  @IsArray()
  @IsEnum(Permission, { each: true })
  FC: Permission[];
}

export class UpdatePermissionsDto {
  @ApiProperty({ type: GrantsDto })
  @IsDefined() // ValidateNested skips undefined, and an empty body would wipe every grant
  @ValidateNested()
  @Type(() => GrantsDto)
  grants: GrantsDto;
}
