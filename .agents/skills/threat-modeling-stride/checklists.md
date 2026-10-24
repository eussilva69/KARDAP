# STRIDE Threat Modeling Checklists

Security verification checklists for application threat modeling across the STRIDE taxonomy, OWASP Top 10, Authentication, API Security, and Data Protection.

---

## 1. STRIDE Core Matrix Checklist

| Threat | Definition | Primary Controls to Verify |
|--------|------------|----------------------------|
| **S - Spoofing** | Pretending to be someone/something else | Multi-factor authentication, cryptographic signatures, mutual TLS, HMAC on webhooks, SPF/DKIM/DMARC |
| **T - Tampering** | Modifying data or code unauthorized | TLS in-transit, parameterized SQL queries, signed JWTs with asymmetric keys (RS256), cryptographic hashes, immutable audit logs |
| **R - Repudiation** | Denying an action took place | Centralized audit logging (who, what, when, IP), write-once log storage (append-only), NTP time synchronization |
| **I - Information Disclosure** | Exposing data to unauthorized parties | Encryption at rest (AES-256), strict CORS policy, secrets management (never in code/git), stripped error stack traces in production |
| **D - Denial of Service** | Absorbing resources to deny legitimate use | Rate limiting (IP/User/Token bucket), pagination limits (`max_limit=100`), payload size limits, CDN caching, auto-scaling |
| **E - Elevation of Privilege** | Gaining unauthorized access/rights | Principle of Least Privilege, Role-Based Access Control (RBAC), Object-Level Access Control (BOLA/IDOR prevention), strict tenancy isolation |

---

## 2. Authentication & Session Checklist

- [ ] Passwords hashed with Argon2id or bcrypt (cost factor >= 12).
- [ ] Session tokens or JWTs stored in `HttpOnly`, `Secure`, `SameSite=Strict/Lax` cookies.
- [ ] Access tokens have short lifespans (15-60 min) with refresh token rotation and family revocation.
- [ ] Brute-force protection enabled: account lockout or progressive exponential delay after 5 failed attempts.
- [ ] MFA enforced for administrative routes and sensitive actions (password change, email update, payments).
- [ ] Password reset tokens expire in <= 15 minutes and invalidate immediately upon single use.

---

## 3. OWASP API Security Top 10 Checklist

- [ ] **API1 (BOLA / IDOR):** Every data access query validates that `current_user.id === resource.owner_id` or tenant.
- [ ] **API2 (Broken Auth):** Tokens validated cryptographically on every non-public request; no fallback to `none` algorithm.
- [ ] **API3 (BOPFL - Broken Object Property Level):** DTOs / Schemas strictly filter fields during updates (prevent mass assignment of `is_admin`, `balance`, etc.).
- [ ] **API4 (Unrestricted Resource Consumption):** Global rate limits (e.g. 100 req/min), query execution timeouts (e.g. 5000ms), and pagination caps enforced.
- [ ] **API5 (BFLA - Broken Function Level Auth):** Administrative endpoints explicitly verify user role in middleware / route handlers.
- [ ] **API6 (Server-Side Request Forgery - SSRF):** User-supplied URLs validated against strict allowlist; internal IPs (`127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`) strictly blocked.
- [ ] **API7 (Security Misconfiguration):** Debug modes, stack traces, and default credentials disabled in production environments.
- [ ] **API8 (Lack of Protection from Automated Threats):** CAPTCHA or proof-of-work on public submission/registration endpoints.
- [ ] **API9 (Improper Inventory Management):** Deprecated API versions (`/v1`) retired or patched; staging environments not exposed to public internet.
- [ ] **API10 (Unsafe Consumption of Third-Party APIs):** All external API inputs sanitized, validated, and wrapped in timeouts.
