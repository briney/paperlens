import IORedis from "bullmq/node_modules/ioredis";

const globalForRedis = globalThis as unknown as {
  redis: InstanceType<typeof IORedis> | undefined;
};

export const redis =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null, // required by BullMQ
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
