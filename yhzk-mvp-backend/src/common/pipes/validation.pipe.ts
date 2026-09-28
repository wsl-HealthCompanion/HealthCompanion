import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCode } from '../filters/all-exceptions.filter';

/**
 * 全局校验管道
 * 基于 class-validator 的 DTO 自动校验
 * 在 main.ts 中全局注册后, 所有 @Body() / @Query() 自动校验
 */
@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const messages = errors.map((error) => {
        const constraints = error.constraints || {};
        return Object.values(constraints).join('; ');
      });

      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: messages.join('; '),
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
