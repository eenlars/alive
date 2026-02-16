# Single-Customer Hosting Decision (Hetzner vs Render vs Fly.io)

Decision memo for hosting one low-traffic customer site that needs a safe, isolated environment for AI interactions.

**Date**: 2026-02-16  
**Status**: Proposed default

## Requirements

- One customer, one site
- Low traffic / simple workload
- Clear "dedicated" story for isolation and safety
- Compliance-ready posture (at least GDPR + security controls)
- Keep implementation and operations simple

## Short Recommendation

Use **Hetzner Cloud `CCX13` (dedicated vCPU)** with **one VM per customer** as the default.

This gives the clearest isolation story for your use case while staying inexpensive and operationally familiar (SSH + Linux VM workflow, similar to bare metal).

## Option Comparison

| Option | Typical monthly floor | Isolation story | Compliance posture | Ops effort | Fit for this requirement |
|---|---:|---|---|---|---|
| Hetzner `CCX13` + IPv4 | ~`EUR 12.99` (`12.49 + 0.50`) | Strong: dedicated-vCPU VM per customer | ISO/IEC 27001 + DPA/TOMs; SOC 2 is not their focus | Medium | **Best default** |
| Hetzner `CX23` + IPv4 | ~`EUR 3.99` (`3.49 + 0.50`) | VM isolation, but shared CPU resources | Same as above | Medium | Budget option; weaker performance isolation |
| Render Web Service (`Starter`) | `USD 7` compute + workspace plan | PaaS isolation, not host-dedicated | SOC 2 Type 2 + ISO 27001; HIPAA-enabled workspaces | Low | Easiest PaaS, but weaker "dedicated box" story |
| Fly Machines (`shared-cpu-1x`) | ~`USD 1.94-2.47` (region-dependent) + storage/network | Strong app isolation (microVM model), shared infra | SOC2 Type2 report + BAA + DPA | Medium | Good fallback if you want platform automation + compliance docs |

## Compliance Notes

- **Hetzner**: Provides ISO/IEC 27001 certificate, DPA flow, TOMs documentation, and explicitly emphasizes ISO focus over SOC 2.
- **Render**: Documents SOC 2 Type 2 and ISO 27001, with HIPAA-enabled workspace support.
- **Fly.io**: Publishes SOC2 Type2 report availability and offers BAA and DPA flows.

## Why Hetzner `CCX13` Is the Default Here

- You already know bare-metal style operations; VM ops are almost identical in daily use.
- Per-customer VM is easy to explain to security/procurement: one workload boundary per customer.
- Cost is still low relative to dedicated hardware.
- You keep full control of hardening, logging, and incident response behavior.

## Minimal Safe Baseline (Hetzner)

1. One VM per customer (`CCX13`) in the required region.
2. SSH keys only, disable password login, no root SSH.
3. Deny-by-default firewall (`22`, `80`, `443`; optionally restrict `22` by source IP).
4. Auto security updates + routine patch window.
5. Containerize app and pin image versions.
6. TLS via Caddy or Nginx; enforce HTTPS.
7. Encrypted backups/snapshots with restore test cadence.
8. Centralized logs + alerting for auth failures and service health.
9. Separate secrets per customer; no shared credentials.

## Decision Guardrail

⚠️ Architecture smell: running multiple hosting platforms for one-site/one-customer setups adds options and ways to fail. Prefer one default path and execute it consistently.

## Sources (checked 2026-02-16)

- Hetzner Cloud pricing and plans: https://www.hetzner.com/cloud
- Hetzner primary IPv4 pricing (`EUR 0.50/mo`): https://docs.hetzner.com/cloud/servers/primary-ips/overview/
- Hetzner certificates (ISO focus, SOC 2 statement): https://docs.hetzner.com/general/company-and-policy/certificates/
- Hetzner data protection / DPA / TOMs context: https://docs.hetzner.com/general/others/data-protection/
- Render pricing (instance tiers): https://render.com/pricing
- Render compliance docs: https://render.com/docs/certifications-compliance
- Fly pricing (Machines + storage): https://fly.io/docs/about/pricing/
- Fly compliance page (SOC2/BAA/DPA): https://fly.io/compliance
