# @webalive/images

Domain-based image storage package for alive platform.

## Overview

Simple, production-ready image storage that:
- Starts with filesystem (Day 1)
- Migrates cleanly to S3/Supabase (when needed)
- No URL changes, no downtime, no data loss

## Architecture

**Content-addressed storage:**
```
t/{tenantId}/o/{contentHash}/v/{variant}.webp
```

- `tenantId` - Stable identifier (NOT domain)
- `contentHash` - SHA-256 of original bytes (idempotency)
- `variant` - Image size (orig, w640, w1280, thumb)

**Storage backends:**
- ✅ Filesystem (implemented)
- ⏳ Supabase (planned)
- ⏳ S3 (planned)
- ⏳ Dual-write wrapper (planned)

## Installation

```bash
bun add @webalive/images
```

## Usage

### Basic Upload

```typescript
import { FilesystemStorage, uploadImage } from '@webalive/images'

// Initialize storage
const storage = new FilesystemStorage({
  basePath: '/srv/webalive/storage',
  signatureSecret: process.env.IMAGES_SIGNATURE_SECRET
})

// Upload image
const result = await uploadImage(
  storage,
  'tenant-uuid',
  imageBuffer,
  {
    variants: ['orig', 'w640', 'thumb'],
    compress: true,
    maxWidth: 1920
  }
)

if (result.data) {
  console.log('URLs:', result.data.urls)
  // {
  //   orig: '/_images/t/tenant-uuid/o/abc123.../v/orig.webp',
  //   w640: '/_images/t/tenant-uuid/o/abc123.../v/w640.webp',
  //   thumb: '/_images/t/tenant-uuid/o/abc123.../v/thumb.webp'
  // }
}
```

### API Route

```typescript
// apps/web/app/api/images/upload/route.ts
import { FilesystemStorage, uploadImage } from '@webalive/images'

export async function POST(request: NextRequest) {
  // 1. Auth check
  // 2. Get tenant ID from domain
  // 3. Parse file
  // 4. Upload
  const result = await uploadImage(storage, tenantId, buffer)

  return NextResponse.json(result)
}
```

## Features

### ✅ Content-Addressed Keys
Same file uploaded twice = same hash = automatic deduplication

### ✅ Magic Number Validation
Validates actual file type, not just extension. Prevents .php.jpg attacks.

### ✅ Binary Search Compression
Finds optimal quality/size tradeoff automatically using @napi-rs/image.

### ✅ Multiple Variants
Generate responsive sizes: original, 640px, 1280px, thumbnail.

### ✅ Signed URLs
Generate time-limited URLs for private images.

### ✅ Type-Safe Errors
HResponse pattern: `{ data: T, error: null }` or `{ data: null, error: E }`

## Storage Structure

```
/srv/webalive/storage/
└── t/
    └── {tenantId}/
        └── o/
            └── {contentHash}/
                └── v/
                    ├── orig.webp
                    ├── w640.webp
                    ├── w1280.webp
                    └── thumb.webp
```

## Configuration

### Environment Variables

```bash
# Storage path
IMAGES_STORAGE_PATH=/srv/webalive/storage

# Signature secret for private URLs
IMAGES_SIGNATURE_SECRET=your-secret-key
```

### Tenant ID Mapping

Tenant IDs are stored in Supabase `app.domains`:
```sql
SELECT tenant_id FROM app.domains WHERE hostname = 'demo.goalive.nl';
```

## Serving Images

**Via Caddy (recommended):**
```
demo.goalive.nl {
  route /_images/* {
    root * /srv/webalive/storage
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
}
```

**Why Caddy?** App servers bottleneck at ~10k users. Static serving scales to millions.

## Migration Path

Built-in support for zero-downtime migration:

```typescript
// Phase 0: Filesystem only
const storage = new FilesystemStorage({ basePath: '/srv/...' })

// Phase 1: Dual-write (testing)
const storage = new DualWriteStorage({
  primary: filesystem,
  secondary: supabase
})

// Phase 2: Supabase primary
const storage = new DualWriteStorage({
  primary: supabase,
  secondary: filesystem
})

// Phase 3: Supabase only
const storage = new SupabaseStorage({ ... })
```

## Tripwires

Migrate when ANY TWO trigger:
- 10M objects OR >100GB total
- p95 latency >150ms
- Egress >200GB/day OR >500 RPS
- Operational pain (on-call twice)

## Security

- ✅ Magic number validation (don't trust extensions)
- ✅ Size limits (10MB max)
- ✅ Content hashing (verify integrity)
- ✅ Path validation (no traversal)
- ✅ Signed URLs (time-limited private access)

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev
```

## Credits

Design inspired by:
- Patrick Collison's advice on scaling simple → complex
- Alive's multi-tenant storage patterns
- Huurmatcher's compression pipeline

## License

MIT
