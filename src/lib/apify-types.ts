/** Apify webhook payload (ACTOR.RUN.SUCCEEDED) */
export interface ApifyWebhookPayload {
  userId?: string;
  createdAt?: string;
  eventType?: string;
  eventData?: {
    actorId?: string;
    actorRunId?: string;
  };
  resource?: {
    id?: string;
    actId?: string;
    defaultDatasetId?: string;
    status?: string;
  };
}

export interface ApifyRunStartResponse {
  data?: {
    id?: string;
    defaultDatasetId?: string;
    status?: string;
  };
}

export interface ApifyWebhookConfig {
  eventTypes: string[];
  requestUrl: string;
  payloadTemplate?: string;
  headersTemplate?: string;
}
