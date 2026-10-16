// Distributed platform limiter, applied before requests reach Next.js.
export default async (_request, context) => context.next();
export const config = {
  path: "/api/access/session",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
