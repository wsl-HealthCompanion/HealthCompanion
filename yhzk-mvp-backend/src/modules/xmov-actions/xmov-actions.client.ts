import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import {
  XMOV_KA_SUMMARY_PATH,
  buildXmovAuthHeaders,
} from './xmov-actions.signature';
import {
  XmovActionsClientError,
  type XmovKaSummaryRawResponse,
} from './xmov-actions.types';

const DEFAULT_XMOV_API_BASE_URL = 'https://nebula-agent.xingyun3d.com';

@Injectable()
export class XmovActionsClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>('XMOV_API_BASE_URL') ?? DEFAULT_XMOV_API_BASE_URL,
      timeout: 10_000,
    });
  }

  async fetchRawActions(): Promise<XmovKaSummaryRawResponse> {
    const appId = this.config.get<string>('XMOV_APP_ID') ?? '';
    const appSecret = this.config.get<string>('XMOV_APP_SECRET') ?? '';

    if (!appId) {
      throw new XmovActionsClientError('CONFIG', 'XMOV_APP_ID is required');
    }
    if (!appSecret) {
      throw new XmovActionsClientError('CONFIG', 'XMOV_APP_SECRET is required');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const data = {};

    try {
      const response = await this.http.request({
        method: 'GET',
        url: XMOV_KA_SUMMARY_PATH,
        data,
        headers: buildXmovAuthHeaders({
          appId,
          appSecret,
          method: 'GET',
          apiPath: XMOV_KA_SUMMARY_PATH,
          data,
          timestamp,
        }),
      });

      const body = response.data;
      if (!body || typeof body !== 'object' || typeof body.error_code !== 'number') {
        throw new XmovActionsClientError(
          'PROTOCOL',
          'Xmov KA API returned an invalid response body',
        );
      }

      if (body.error_code !== 0) {
        const reason =
          typeof body.error_reason === 'string' && body.error_reason
            ? body.error_reason
            : `error_code=${body.error_code}`;
        throw new XmovActionsClientError(
          'UPSTREAM',
          `Xmov KA API rejected the request: ${reason}`,
        );
      }

      return body as XmovKaSummaryRawResponse;
    } catch (error) {
      if (error instanceof XmovActionsClientError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new XmovActionsClientError(
            'TIMEOUT',
            'Xmov KA API request timed out',
          );
        }

        const status = error.response?.status;
        const suffix = status ? ` (HTTP ${status})` : '';
        throw new XmovActionsClientError(
          'UPSTREAM',
          `Xmov KA API request failed${suffix}`,
        );
      }

      throw error;
    }
  }
}
