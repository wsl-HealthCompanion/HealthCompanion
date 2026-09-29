export interface XmovKaSummaryRawResponse {
  error_code: number;
  error_reason?: string;
  data: unknown;
}

export type XmovActionsClientErrorCode =
  | 'CONFIG'
  | 'TIMEOUT'
  | 'UPSTREAM'
  | 'PROTOCOL';

export class XmovActionsClientError extends Error {
  constructor(
    public readonly code: XmovActionsClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'XmovActionsClientError';
  }
}
