# Security Documentation

This document details the security architecture of `@webalive/oauth-core`.

## Encryption

### Algorithm: AES-256-GCM

**Why GCM mode?**
- **Authenticated Encryption**: Provides both confidentiality and integrity
- **AEAD**: Authenticated Encryption with Associated Data
- **Industry Standard**: NIST approved, widely used in TLS 1.3

**Parameters:**
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 96 bits (12 bytes) - recommended for GCM
- **Auth Tag Size**: 128 bits (16 bytes)
- **Random IV**: Generated using `crypto.randomBytes()` for each encryption

### Key Management

#### Master Key

**Format**: 64 hexadecimal characters (32 bytes)

**Generation:**
```bash
openssl rand -hex 32
```

**Storage:**
- Environment variable: `LOCKBOX_MASTER_KEY`
- Never committed to git
- Stored in secure environment (e.g., AWS Secrets Manager, HashiCorp Vault)

**Key Rotation:**
The schema supports key rotation via `version` and `is_current` fields:

1. Generate new master key
2. Re-encrypt all secrets with new key, incrementing `version`
3. Mark new versions as `is_current = true`
4. Old versions remain for rollback

**Limitations:**
- Single master key for all tenants (simplified model)
- For enterprise: Consider per-tenant keys or key derivation

### Bytea Format

**Postgres Storage:**
Encrypted data stored as `BYTEA` type with hex encoding:

```
\x48656c6c6f  (represents "Hello")
```

**Why bytea?**
- Binary-safe storage
- No charset conversion issues
- Direct mapping to Buffer in Node.js

## Database Schema Security

### Row Level Security (RLS)

**Enabled on `lockbox.user_secrets`:**

```sql
-- Users can only read their own secrets (when using anon key)
CREATE POLICY "Users can read own secrets"
  ON lockbox.user_secrets FOR SELECT
  USING (clerk_id = auth.uid());
```

**Write Operations:**
- Require service key (bypasses RLS)
- Never expose service key to client
- All writes server-side only

### Foreign Key Constraints

```sql
clerk_id UUID REFERENCES iam.users(user_id) ON DELETE CASCADE
```

**Benefits:**
- Automatic cleanup when user deleted
- Data integrity enforced at DB level
- No orphaned secrets

### Check Constraints

```sql
-- Namespace validation
CHECK (namespace IN ('provider_config', 'oauth_tokens'))

-- IV size validation (12 bytes)
CHECK (octet_length(iv) = 12)

-- Auth tag size validation (16 bytes)
CHECK (octet_length(auth_tag) = 16)
```

**Benefits:**
- Schema-level validation
- Prevents invalid data insertion
- Catches bugs early

## Multi-Tenant Isolation

### Tenant Model

**Two types of secrets:**

1. **Provider Config** (`provider_config` namespace)
   - OAuth app credentials (client ID/secret)
   - Owned by tenant (organization owner)
   - Used for all users under that tenant

2. **User Tokens** (`oauth_tokens` namespace)
   - Access/refresh tokens
   - Owned by individual users
   - Isolated per user

### Access Control Matrix

| Operation | Namespace | Who Can Access | Key Required |
|-----------|-----------|----------------|--------------|
| Write provider config | `provider_config` | Tenant owner | Service key |
| Read provider config | `provider_config` | Tenant owner | Service key |
| Write user tokens | `oauth_tokens` | System (on behalf of user) | Service key |
| Read user tokens | `oauth_tokens` | Token owner | Anon key (RLS) or Service key |

## Threat Model

### Protected Against

✅ **SQL Injection**
- Parameterized queries via Supabase client
- No raw SQL concatenation

✅ **Data Breaches**
- All secrets encrypted at rest
- Attacker needs both DB access AND master key

✅ **Unauthorized Access**
- RLS policies enforce user isolation
- Service key required for writes

✅ **Tampering**
- GCM auth tag detects modifications
- Decryption fails if data altered

✅ **Replay Attacks**
- OAuth state parameter (CSRF protection)
- Short-lived authorization codes

### Not Protected Against

❌ **Compromised Master Key**
- If master key leaked, attacker can decrypt all secrets
- Mitigation: Secure key storage, key rotation

❌ **Compromised Service Key**
- Full database access (bypasses RLS)
- Mitigation: Restrict service key to backend only

❌ **Server-Side Code Execution**
- Attacker with RCE can read master key from environment
- Mitigation: Secure infrastructure, least privilege

❌ **Timing Attacks**
- Constant-time comparison not implemented
- Mitigation: Low risk in typical OAuth flows

## OAuth-Specific Security

### Authorization Code Flow

**CSRF Protection:**
```typescript
const state = crypto.randomBytes(16).toString('hex');
// Store state in session
const authUrl = await oauth.getAuthUrl(tenantId, 'github', 'repo', state);
// Redirect user
// On callback, verify state matches
```

### Token Storage

**Access Tokens:**
- Encrypted with AES-256-GCM
- Short-lived (typically 1-8 hours)
- Stored in `oauth_tokens` namespace

**Refresh Tokens:**
- Also encrypted
- Long-lived (months to years)
- Used to obtain new access tokens

**Best Practice:**
```typescript
// Always check token expiration
const expiresAt = await oauth.storage.get(userId, 'oauth_tokens', 'github_expires_at');
if (new Date(expiresAt) < new Date()) {
  // Refresh token
}
```

### Scope Management

**Principle of Least Privilege:**
```typescript
// ❌ Bad: Request all scopes
const authUrl = await oauth.getAuthUrl(tenantId, 'github', 'repo admin:org delete_repo', state);

// ✅ Good: Request minimal scopes
const authUrl = await oauth.getAuthUrl(tenantId, 'github', 'repo:status', state);
```

### Token Revocation

**On User Logout:**
```typescript
// Revoke with provider (if supported)
await oauth.revoke(tenantId, userId, 'github');

// Also disconnect locally
await oauth.disconnect(userId, 'github');
```

## Compliance Considerations

### GDPR (General Data Protection Regulation)

**Right to Erasure:**
```typescript
// Delete all user secrets (cascades via FK)
await supabase.from('iam.users').delete().eq('user_id', userId);
```

**Data Minimization:**
- Only store necessary OAuth tokens
- No logging of sensitive data

### PCI DSS (if handling payment data via OAuth)

- Encryption in transit (TLS)
- Encryption at rest (AES-256-GCM)
- Access control (RLS)
- Audit logging (via Supabase)

## Audit Logging

**Current Implementation:**
- Timestamps: `created_at`, `updated_at`
- Version tracking: `version`, `is_current`

**Recommended Additions:**
```sql
-- Audit log table (future enhancement)
CREATE TABLE lockbox.audit_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'encrypt', 'decrypt', 'delete'
  secret_name VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Incident Response

### Master Key Compromise

**Steps:**
1. Generate new master key
2. Run key rotation script (re-encrypt all secrets)
3. Update environment variables
4. Invalidate old key
5. Audit access logs

### Service Key Compromise

**Steps:**
1. Revoke compromised service key in Supabase
2. Generate new service key
3. Update all backend services
4. Review recent database activity
5. Notify affected users if data accessed

### Token Compromise

**Steps:**
1. Revoke token with OAuth provider
2. Delete from lockbox
3. Force user re-authentication
4. Review user activity logs

## Security Checklist

Before deploying to production:

- [ ] Master key generated with cryptographically secure RNG
- [ ] Master key stored in secure environment (not hardcoded)
- [ ] Service key never exposed to client
- [ ] HTTPS enforced for all API calls
- [ ] OAuth state parameter implemented (CSRF protection)
- [ ] RLS policies tested and verified
- [ ] Token expiration checks implemented
- [ ] Token refresh logic implemented
- [ ] Minimal OAuth scopes requested
- [ ] Error messages don't leak sensitive info
- [ ] Rate limiting on OAuth endpoints
- [ ] Audit logging enabled
- [ ] Incident response plan documented

## References

- [NIST SP 800-38D: GCM Mode](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

## Contact

For security issues, please report privately to the maintainers.
