# @webalive/redis

Redis infrastructure package for the monorepo.

## Installation

From monorepo root:

```bash
bun --filter @webalive/redis install
```

Or install dependencies for the client:

```bash
cd packages/redis && bun install
```

## Usage

### Using the Redis Client in Your Application

This package exports a pre-configured Redis client that you can use in your applications:

```typescript
import { createRedisClient, type RedisClient } from '@webalive/redis';

// Create a client (uses REDIS_URL env var or default connection)
const redis = createRedisClient();

// Use the client
await redis.set('key', 'value');
const value = await redis.get('key');

// Custom connection URL
const redisCustom = createRedisClient('redis://:password@localhost:6379');
```

**Features:**
- Automatic connection with retry logic
- Built-in error handling and logging
- Supports environment variable configuration (`REDIS_URL`)
- TypeScript types included
- Handles authentication automatically

**Environment Setup:**

Add to your app's `.env`:
```bash
REDIS_URL=redis://:dev_password_only@127.0.0.1:6379
```

### Start Redis

```bash
bun --filter @webalive/redis start
```

### Stop Redis

```bash
bun --filter @webalive/redis stop
```

### Check Status

```bash
bun --filter @webalive/redis status
bun --filter @webalive/redis health
```

### Test Redis

Run comprehensive behavioral tests to verify Redis configuration and operations:

```bash
bun --filter @webalive/redis test
```

This test suite verifies:
1. **Configuration** - redis.conf loaded (256MB memory, LRU eviction)
2. **TTL & Expiration** - Keys expire correctly with timeout
3. **Data Types** - Lists, Sets, Hashes, Sorted Sets work properly
4. **Large Values** - 100KB+ data storage and retrieval
5. **Atomic Operations** - INCR with concurrent requests (race conditions)
6. **Persistence** - RDB snapshots configured and working
7. **Edge Cases** - Unicode, special characters, spaces handled
8. **Pattern Matching** - KEYS/SCAN wildcard queries
9. **Transactions** - MULTI/EXEC atomic operations
10. **Concurrent Connections** - Multiple simultaneous clients
11. **Memory Tracking** - Memory usage statistics

Tests are designed to catch real problems, not just check if Redis responds.

### View Logs

```bash
bun --filter @webalive/redis logs
```

### Access Redis CLI

```bash
bun --filter @webalive/redis cli
```

## Connection String

**With authentication (recommended):**
- From host: `redis://:dev_password_only@127.0.0.1:6379`
- From Docker: `redis://:dev_password_only@redis:6379`

**For production:** Replace `dev_password_only` with a strong password in both `config/redis.conf` and connection strings.

## For New Developers

1. Install: `bun --filter @webalive/redis install`
2. Start: `bun --filter @webalive/redis start`
3. Verify: `bun --filter @webalive/redis health`

That's it! Your app can now connect to Redis.

## Quick Commands

From the monorepo root, you can also use the convenience scripts:

```bash
bun run redis:setup     # Setup Redis (requires Docker)
bun run redis:start     # Start Redis
bun run redis:stop      # Stop Redis
bun run redis:status    # Check status
bun run redis:health    # Health check
bun run redis:test      # Run tests
bun run redis:logs      # View logs
bun run redis:cli       # Access Redis CLI
```

## Troubleshooting

### Redis won't start

Check if port 6379 is already in use:
```bash
lsof -i :6379
```

### View detailed logs

```bash
bun --filter @webalive/redis logs
```

### Clean everything and restart

```bash
bun --filter @webalive/redis clean
bun --filter @webalive/redis install
bun --filter @webalive/redis start
```

## Configuration

The Redis configuration is located at `config/redis.conf`. Key settings:

- **Port**: 6379
- **Authentication**: Password-protected (`requirepass dev_password_only`)
- **Max Memory**: 256MB
- **Eviction Policy**: allkeys-lru
- **Persistence**: Enabled (RDB snapshots in `./.data/dump.rdb`)

**Security Note:** The default password `dev_password_only` is for development only. For production deployments:
1. Change `requirepass` in `config/redis.conf`
2. Update `REDIS_URL` in your application's `.env`
3. Restart Redis: `bun --filter @webalive/redis stop && bun --filter @webalive/redis start`

Modify the configuration file and restart Redis to apply changes.

## Development

### Building the Client

The package includes a TypeScript client that can be imported into other packages:

```bash
# Build the client once
bun --filter @webalive/redis build

# Watch mode for development
bun --filter @webalive/redis dev
```

Build output goes to `dist/` and includes:
- `dist/index.js` - ESM and CJS bundles
- `dist/index.d.ts` - TypeScript type definitions

### Package Structure

```
packages/redis/
├── src/
│   └── index.ts          # TypeScript client source
├── dist/                 # Build output (gitignored)
├── .data/                # Redis data files (gitignored)
├── config/
│   └── redis.conf        # Redis configuration
├── scripts/              # Management scripts
└── docker-compose.yml    # Docker setup
```
