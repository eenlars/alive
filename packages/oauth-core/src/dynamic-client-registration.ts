/**
 * Dynamic Client Registration (RFC 7591)
 *
 * Enables automatic OAuth client registration with providers that support it.
 * Learned from n8n's oauth.service.ts implementation.
 *
 * https://www.rfc-editor.org/rfc/rfc7591.html
 */

import { z } from "zod"

/**
 * OAuth 2.0 Authorization Server Metadata
 * https://www.rfc-editor.org/rfc/rfc8414.html
 */
export const AuthorizationServerMetadataSchema = z.object({
  // Required endpoints
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  registration_endpoint: z.string().url(),

  // Optional capability discovery
  grant_types_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  scopes_supported: z.array(z.string()).optional(),
  response_types_supported: z.array(z.string()).optional(),

  // Additional metadata
  issuer: z.string().optional(),
  jwks_uri: z.string().url().optional(),
  revocation_endpoint: z.string().url().optional(),
  introspection_endpoint: z.string().url().optional(),
})

export type AuthorizationServerMetadata = z.infer<typeof AuthorizationServerMetadataSchema>

/**
 * Dynamic Client Registration Response
 */
export const ClientRegistrationResponseSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  client_secret_expires_at: z.number().optional(),
  registration_access_token: z.string().optional(),
  registration_client_uri: z.string().url().optional(),
})

export type ClientRegistrationResponse = z.infer<typeof ClientRegistrationResponseSchema>

/**
 * OAuth2 Grant Types
 */
export type OAuth2GrantType = "authorization_code" | "client_credentials" | "refresh_token" | "pkce"

/**
 * Token endpoint authentication methods
 */
export type TokenEndpointAuthMethod = "client_secret_basic" | "client_secret_post" | "none"

/**
 * Discovers OAuth server metadata from well-known endpoint
 *
 * @param serverUrl - Base URL of the OAuth server
 * @returns Authorization server metadata
 */
export async function discoverAuthorizationServer(serverUrl: string): Promise<AuthorizationServerMetadata> {
  const url = new URL(serverUrl)
  const metadataUrl = `${url.origin}/.well-known/oauth-authorization-server`

  const response = await fetch(metadataUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const result = AuthorizationServerMetadataSchema.safeParse(data)

  if (!result.success) {
    throw new Error(`Invalid OAuth server metadata: ${result.error.issues.map(e => e.message).join(", ")}`)
  }

  return result.data
}

/**
 * Registers a new OAuth client dynamically
 *
 * @param registrationEndpoint - Registration endpoint URL
 * @param options - Client registration options
 * @returns Registered client credentials
 */
export async function registerClient(
  registrationEndpoint: string,
  options: {
    redirect_uris: string[]
    client_name?: string
    client_uri?: string
    scope?: string
    grant_types?: string[]
    response_types?: string[]
    token_endpoint_auth_method?: TokenEndpointAuthMethod
  },
): Promise<ClientRegistrationResponse> {
  const payload = {
    redirect_uris: options.redirect_uris,
    client_name: options.client_name || "WebAlive",
    client_uri: options.client_uri || "https://goalive.nl/",
    scope: options.scope,
    grant_types: options.grant_types || ["authorization_code", "refresh_token"],
    response_types: options.response_types || ["code"],
    token_endpoint_auth_method: options.token_endpoint_auth_method || "client_secret_basic",
  }

  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Client registration failed: ${response.status} ${error}`)
  }

  const data = await response.json()
  const result = ClientRegistrationResponseSchema.safeParse(data)

  if (!result.success) {
    throw new Error(`Invalid registration response: ${result.error.issues.map(e => e.message).join(", ")}`)
  }

  return result.data
}

/**
 * Selects the best grant type and auth method based on server capabilities
 * (Learned from n8n's selectGrantTypeAndAuthenticationMethod)
 */
export function selectBestAuthMethod(
  grantTypes: string[],
  tokenAuthMethods: string[],
  codeChallengeMethods: string[],
): { grantType: OAuth2GrantType; authMethod?: TokenEndpointAuthMethod } {
  // Prefer PKCE if supported
  if (grantTypes.includes("authorization_code") && codeChallengeMethods.includes("S256")) {
    return { grantType: "pkce", authMethod: "none" }
  }

  // Fallback to authorization_code with refresh
  if (grantTypes.includes("authorization_code") && grantTypes.includes("refresh_token")) {
    if (tokenAuthMethods.includes("client_secret_basic")) {
      return { grantType: "authorization_code", authMethod: "client_secret_basic" }
    }
    if (tokenAuthMethods.includes("client_secret_post")) {
      return { grantType: "authorization_code", authMethod: "client_secret_post" }
    }
  }

  // Client credentials flow
  if (grantTypes.includes("client_credentials")) {
    if (tokenAuthMethods.includes("client_secret_basic")) {
      return { grantType: "client_credentials", authMethod: "client_secret_basic" }
    }
    if (tokenAuthMethods.includes("client_secret_post")) {
      return { grantType: "client_credentials", authMethod: "client_secret_post" }
    }
  }

  throw new Error("No supported grant type and authentication method found")
}
