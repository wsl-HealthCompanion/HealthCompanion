import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { QueryFailedError } from 'typeorm';

// 全局错误码枚举 (参考 MVP-SPEC §3.2)
export enum ErrorCode {
  // 通用
  OK = 0,
  UNKNOWN = 10000,
  VALIDATION_ERROR = 10001,
  RATE_LIMITED = 10002,
  UNAUTHORIZED = 10003,
  FORBIDDEN = 10004,
  NOT_FOUND = 10005,

  // 认证 (20000)
  WECHAT_CODE_INVALID = 20001,
  PHONE_ALREADY_EXISTS = 20002,
  SMS_CODE_INVALID = 20003,
  SMS_CODE_EXPIRED = 20004,
  SMS_DAILY_LIMIT = 20005,
  SMS_RATE_LIMITED = 20006,
  TOKEN_EXPIRED = 20007,
  TOKEN_REVOKED = 20008,
  ACCOUNT_DISABLED = 20009,
  ACCOUNT_DELETED = 20010,

  // 建档 (30000)
  PROFILE_VALIDATION_ERROR = 30001,
  PROFILE_DRAFT_EXPIRED = 30002,
  PROFILE_ALREADY_SUBMITTED = 30003,

  // 对话 (40000)
  CHAT_SESSION_NOT_FOUND = 40001,
  CHAT_RATE_LIMITED = 40002,
  AI_TIMEOUT = 40003,
  AI_DOWNGRADED = 40004,

  // 顾问 (50000)
  ADVISOR_NOT_FOUND = 50001,
  ADVISOR_MATCH_FAILED = 50002,
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string || uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ErrorCode.UNKNOWN;
    let responseMetadata: Record<string, unknown> = {};
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        code = resp.code ?? this.statusToErrorCode(status);
        if (Array.isArray(resp.blockers)) {
          responseMetadata = { blockers: resp.blockers };
        }
        message = resp.message || exception.message;

        // class-validator 校验错误
        if (Array.isArray(resp.message)) {
          code = ErrorCode.VALIDATION_ERROR;
          message = resp.message.join('; ');
        }
      } else {
        code = this.statusToErrorCode(status);
        message = String(exceptionResponse);
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCode.UNKNOWN;
      message = process.env.NODE_ENV === 'development'
        ? exception.message
        : '数据处理异常';
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'development'
        ? exception.message
        : '服务器内部错误';
    }

    // 生产环境不暴露敏感详情
    const detail = process.env.NODE_ENV === 'development'
      ? (exception instanceof Error ? exception.stack : String(exception))
      : undefined;

    console.error(
      `[${requestId}] ${status} ${code} ${message}`,
      detail ? `\n${detail}` : '',
    );

    response.status(status).json({
      code,
      message,
      ...responseMetadata,
      detail,
      requestId,
    });
  }

  private statusToErrorCode(status: number): number {
    switch (status) {
      case 400: return ErrorCode.VALIDATION_ERROR;
      case 401: return ErrorCode.UNAUTHORIZED;
      case 403: return ErrorCode.FORBIDDEN;
      case 404: return ErrorCode.NOT_FOUND;
      case 429: return ErrorCode.RATE_LIMITED;
      default: return ErrorCode.UNKNOWN;
    }
  }
}
