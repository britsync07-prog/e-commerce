import type { FastifyReply, FastifyRequest } from "fastify";

type RouteMetric = {
  method: string;
  route: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  status: Record<string, number>;
};

const startedAt = new Date();
const starts = new WeakMap<FastifyRequest, bigint>();
const routes = new Map<string, RouteMetric>();

export async function metricsOnRequest(request: FastifyRequest) {
  starts.set(request, process.hrtime.bigint());
}

export async function metricsOnResponse(request: FastifyRequest, reply: FastifyReply) {
  const start = starts.get(request);
  const latencyMs = start ? Number(process.hrtime.bigint() - start) / 1_000_000 : 0;
  const route = request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown";
  const key = `${request.method} ${route}`;
  const current = routes.get(key) ?? {
    method: request.method,
    route,
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    status: {}
  };

  current.count += 1;
  current.totalMs += latencyMs;
  current.maxMs = Math.max(current.maxMs, latencyMs);
  if (reply.statusCode >= 500) current.errorCount += 1;
  const status = String(reply.statusCode);
  current.status[status] = (current.status[status] ?? 0) + 1;
  routes.set(key, current);
}

export function metricsSnapshot() {
  const routeMetrics = [...routes.values()].map((metric) => ({
    method: metric.method,
    route: metric.route,
    count: metric.count,
    errorCount: metric.errorCount,
    avgMs: metric.count ? Math.round((metric.totalMs / metric.count) * 100) / 100 : 0,
    maxMs: Math.round(metric.maxMs * 100) / 100,
    status: metric.status
  }));

  return {
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    totalRequests: routeMetrics.reduce((sum, metric) => sum + metric.count, 0),
    totalErrors: routeMetrics.reduce((sum, metric) => sum + metric.errorCount, 0),
    routes: routeMetrics.sort((a, b) => b.count - a.count)
  };
}
