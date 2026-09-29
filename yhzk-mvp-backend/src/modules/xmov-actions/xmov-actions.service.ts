import { Injectable } from '@nestjs/common';
import { XmovActionsClient } from './xmov-actions.client';
import { normalizeXmovActions } from './xmov-actions.normalizer';
import type { XmovAction } from './xmov-actions.types';

@Injectable()
export class XmovActionsService {
  constructor(private readonly client: XmovActionsClient) {}

  async listActions(): Promise<{ actions: XmovAction[] }> {
    const raw = await this.client.fetchRawActions();
    return {
      actions: normalizeXmovActions(raw),
    };
  }
}
