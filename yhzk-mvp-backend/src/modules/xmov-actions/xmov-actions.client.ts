import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import {
  XMOV_KA_SUMMARY_PATH,
  buildXmovAuthHeaders,
} from './xmov-actions.signature';
import type { XmovKaSummaryRawResponse } from './xmov-actions.types';

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
    const timestamp = Math.floor(Date.now() / 1000);
    const data = {};

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

    return response.data as XmovKaSummaryRawResponse;
  }
}
