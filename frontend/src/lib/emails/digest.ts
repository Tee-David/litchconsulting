/** A request line in the weekly client digest (app/api/cron/digest renders it with the `digest` template). */
export type DigestRequest = { number: string; serviceName: string; status: string };
