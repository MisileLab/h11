export type GraphQLResponse<T> = {
  data: T;
  errors?: Array<{ message: string }>;
};

export class GQLDBClient {
  private endpoint: string;
  private timeoutMs: number;

  constructor(endpoint: string, timeoutMs = 10000) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<GraphQLResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const body = await response.json();
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<boolean> {
    const response = await this.query<{ health: string }>("query { health }");
    return !response.errors && response.data?.health === "ok";
  }
}
