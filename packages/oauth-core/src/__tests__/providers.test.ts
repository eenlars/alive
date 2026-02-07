import { describe, expect, it } from "vitest"
import { generatePKCEChallenge } from "../pkce"
import { GitHubProvider, GoogleProvider, LinearProvider } from "../providers"

describe("OAuth Providers", () => {
  describe("GoogleProvider", () => {
    const google = new GoogleProvider()

    describe("#getAuthUrl", () => {
      it("returns valid authorization URL", () => {
        const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email profile", "state123")

        expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth")
        expect(url).toContain("client_id=client123")
        expect(url).toContain("redirect_uri=")
        expect(url).toContain("scope=email+profile")
        expect(url).toContain("state=state123")
        expect(url).toContain("response_type=code")
      })

      it("includes access_type=offline for refresh tokens", () => {
        const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email")

        expect(url).toContain("access_type=offline")
      })

      it("includes PKCE challenge when provided", () => {
        const pkce = generatePKCEChallenge()

        const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email", "state123", pkce)

        expect(url).toContain(`code_challenge=${pkce.code_challenge}`)
        expect(url).toContain("code_challenge_method=S256")
      })

      it("includes prompt=consent when forceConsent is true", () => {
        const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email", undefined, undefined, {
          forceConsent: true,
        })

        expect(url).toContain("prompt=consent")
      })
    })

    describe("static scopes", () => {
      it("has full Gmail scopes defined", () => {
        expect(GoogleProvider.GMAIL_FULL_SCOPES).toContain("https://mail.google.com/")
      })

      it("has readonly Gmail scopes defined", () => {
        expect(GoogleProvider.GMAIL_READONLY_SCOPES).toContain("https://www.googleapis.com/auth/gmail.readonly")
      })
    })
  })

  describe("LinearProvider", () => {
    const linear = new LinearProvider()

    describe("#getAuthUrl", () => {
      it("returns valid authorization URL", () => {
        const url = linear.getAuthUrl("client123", "http://localhost:3000/callback", "read write", "state123")

        expect(url).toContain("https://linear.app/oauth/authorize")
        expect(url).toContain("client_id=client123")
        expect(url).toContain("scope=read+write")
        expect(url).toContain("response_type=code")
      })

      it("includes PKCE challenge when provided", () => {
        const pkce = generatePKCEChallenge()

        const url = linear.getAuthUrl("client123", "http://localhost:3000/callback", "read", "state123", pkce)

        expect(url).toContain(`code_challenge=${pkce.code_challenge}`)
        expect(url).toContain("code_challenge_method=S256")
      })
    })
  })

  describe("GitHubProvider", () => {
    const github = new GitHubProvider()

    describe("#getAuthUrl", () => {
      it("returns valid authorization URL", () => {
        const url = github.getAuthUrl("client123", "http://localhost:3000/callback", "repo user", "state123")

        expect(url).toContain("https://github.com/login/oauth/authorize")
        expect(url).toContain("client_id=client123")
        expect(url).toContain("scope=repo+user")
      })

      it("does not include PKCE (GitHub does not support it)", () => {
        const url = github.getAuthUrl("client123", "http://localhost:3000/callback", "repo")

        // GitHub doesn't support PKCE
        expect(url).not.toContain("code_challenge")
      })
    })
  })

  describe("URL Encoding", () => {
    const google = new GoogleProvider()

    it("properly encodes redirect_uri with special characters", () => {
      const url = google.getAuthUrl("client123", "http://localhost:3000/callback?foo=bar", "email")

      // URL should be encoded
      expect(url).toContain(encodeURIComponent("http://localhost:3000/callback?foo=bar"))
    })

    it("properly encodes scope with spaces", () => {
      const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email profile openid")

      // Spaces should be encoded as +
      expect(url).toContain("scope=email+profile+openid")
    })
  })

  describe("State Parameter", () => {
    const google = new GoogleProvider()

    it("includes state when provided", () => {
      const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email", "random-state-123")

      expect(url).toContain("state=random-state-123")
    })

    it("omits state when not provided", () => {
      const url = google.getAuthUrl("client123", "http://localhost:3000/callback", "email")

      expect(url).not.toContain("state=")
    })
  })
})
