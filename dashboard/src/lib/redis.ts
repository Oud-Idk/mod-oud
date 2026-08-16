import Redis from 'ioredis';

const redisClientSingleton = (): Redis => {
    return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
};

declare global {
    var redisGlobal: undefined | ReturnType<typeof redisClientSingleton>;
}

// Reuse the existing connection in development, or create a new one
const redis = globalThis.redisGlobal ?? redisClientSingleton();

export default redis;

if (process.env.NODE_ENV !== 'production') {
    globalThis.redisGlobal = redis;
}