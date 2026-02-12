# @webalive/redis

Redis client package for the monorepo. Uses native `redis-server` (systemd), no Docker.

## Usage

```typescript
import { createRedisClient } from '@webalive/redis';

const redis = createRedisClient();
await redis.set('key', 'value');
const value = await redis.get('key');
```

In production, pass the URL from `@webalive/env`:

```typescript
import { getRedisUrl } from '@webalive/env/server';
const redis = createRedisClient(getRedisUrl());
```

## Commands

```bash
bun --filter @webalive/redis setup     # Check redis-server is installed
bun --filter @webalive/redis start     # Start via systemd
bun --filter @webalive/redis stop      # Stop via systemd
bun --filter @webalive/redis status    # systemctl status
bun --filter @webalive/redis health    # Health check + stats
bun --filter @webalive/redis cli       # Open redis-cli
bun --filter @webalive/redis test      # Run test suite
```

## Connection

- URL: `redis://127.0.0.1:6379`
- No authentication (native install, bound to localhost)
