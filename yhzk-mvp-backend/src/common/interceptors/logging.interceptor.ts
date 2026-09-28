import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

/**
 * 请求日志拦截器
 * 记录每个请求的 method, url, 响应状态, 耗时
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const requestId = request.headers['x-request-id'] || uuidv4();
    const now = Date.now();

    // 注入 requestId 到请求对象
    request.requestId = requestId;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const ms = Date.now() - now;
          this.logger.log(
            `[${requestId}] ${method} ${url} ${response.statusCode} ${ms}ms`,
          );
        },
        error: (error) => {
          const ms = Date.now() - now;
          this.logger.error(
            `[${requestId}] ${method} ${url} ${error.status || 500} ${ms}ms - ${error.message}`,
          );
        },
      }),
    );
  }
}
