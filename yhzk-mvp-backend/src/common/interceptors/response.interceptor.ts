import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

/**
 * 统一响应格式包装拦截器
 * 将 controller 返回的数据包装为:
 * { code: 0, message: 'ok', data: T, requestId: string }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] || uuidv4();

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) {
          return data;
        }
        // 如果已经是标准格式则透传
        if (data && typeof data === 'object' && 'code' in data && 'requestId' in data) {
          return data;
        }

        return {
          code: 0,
          message: 'ok',
          data: data ?? null,
          requestId,
        };
      }),
    );
  }
}
