---
name: threat-modeling-stride
description: Modelagem de ameaças STRIDE com fronteiras de confiança, ativos e mitigação priorizada.
---

# threat-modeling-stride

## Quando ativar
Quando iniciar funcionalidade sensível, revisar arquitetura ou antes de expor uma API pública.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina sistema, ativos (dados/dinheiro/identidade), atores, premissas, escopo e dependências externas.
2. Faça diagrama de fluxo de dados com processos, storage, entradas e trust boundaries reais.
3. Percorra STRIDE por fluxo e fronteira: spoofing, tampering, repudiation, disclosure, denial of service e privilege elevation.
4. Para cada ameaça, descreva pré-condição, caminho plausível, impacto, controles existentes e evidências; evite listas de CVEs irrelevantes.
5. Priorize por severidade real, exposição, probabilidade, detectabilidade e dificuldade de exploração.
6. Proponha defesa verificável: authz server-side, validação, idempotência, limites, auditoria, criptografia e observabilidade adequadas.
7. Revise DFD e risco residual após correções; ligue ameaças a testes e responsável.

## Verificações e critérios de aceitação
- Matriz STRIDE com cenário observável, controle, teste de ataque autorizado em staging ou teste unitário, risco residual.

## Entrega obrigatória
DFD enxuto, registro de ameaças, prioridades, controles e evidências de validação.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Proibida exploração em terceiros; não transformar hipótese em vulnerabilidade confirmada.

## Ferramentas/comandos candidatos (não executar automaticamente)
OWASP Threat Modeling e artefatos DFD disponíveis.

## Referência para consulta e checagem de versão
- https://owasp.org/www-community/Threat_Modeling

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Vulnerability Analysis Principles (Merged)
---
name: vulnerability-scanner
description: Advanced vulnerability analysis principles. OWASP 2025, Supply Chain Security, attack surface mapping, risk prioritization.
when_to_use: "When scanning for security vulnerabilities, checking OWASP 2025 compliance, or analyzing supply chain security."
allowed-tools: Read, Glob, Grep, Bash
version: 1.0.0
---

# Vulnerability Scanner

> Think like an attacker, defend like an expert. 2025 threat landscape awareness.

## 🔧 Runtime Scripts

**Execute for automated validation:**

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/security_scan.py` | Validate security principles applied | `python scripts/security_scan.py <project_path>` |

## 📋 Reference Files

| File | Purpose |
|------|---------|
| [checklists.md](checklists.md) | OWASP Top 10, Auth, API, Data protection checklists |

---

## 1. Security Expert Mindset

### Core Principles

| Principle | Application |
|-----------|-------------|
| **Assume Breach** | Design as if attacker already inside |
| **Zero Trust** | Never trust, always verify |
| **Defense in Depth** | Multiple layers, no single point |
| **Least Privilege** | Minimum required access only |
| **Fail Secure** | On error, deny access |

### Threat Modeling Questions

Before scanning, ask:
1. What are we protecting? (Assets)
2. Who would attack? (Threat actors)
3. How would they attack? (Attack vectors)
4. What's the impact? (Business risk)

---

## 2. OWASP Top 10:2025

### Risk Categories

| Rank | Category | Think About |
|------|----------|-------------|
| **A01** | Broken Access Control | Who can access what? IDOR, SSRF |
| **A02** | Security Misconfiguration | Defaults, headers, exposed services |
| **A03** | Software Supply Chain 🆕 | Dependencies, CI/CD, build integrity |
| **A04** | Cryptographic Failures | Weak crypto, exposed secrets |
| **A05** | Injection | User input → system commands |
| **A06** | Insecure Design | Flawed architecture |
| **A07** | Authentication Failures | Session, credential management |
| **A08** | Integrity Failures | Unsigned updates, tampered data |
| **A09** | Logging & Alerting | Blind spots, no monitoring |
| **A10** | Exceptional Conditions 🆕 | Error handling, fail-open states |

### 2025 Key Changes

```
2021 → 2025 Shifts:
├── SSRF merged into A01 (Access Control)
├── A02 elevated (Cloud/Container configs)
├── A03 NEW: Supply Chain (major focus)
├── A10 NEW: Exceptional Conditions
└── Focus shift: Root causes > Symptoms
```

---

## 3. Supply Chain Security (A03)

### Attack Surface

| Vector | Risk | Question to Ask |
|--------|------|-----------------|
| **Dependencies** | Malicious packages | Do we audit new deps? |
| **Lock files** | Integrity attacks | Are they committed? |
| **Build pipeline** | CI/CD compromise | Who can modify? |
| **Registry** | Typosquatting | Verified sources? |

### Defense Principles

- Verify package integrity (checksums)
- Pin versions, audit updates
- Use private registries for critical deps
- Sign and verify artifacts

---

## 4. Attack Surface Mapping

### What to Map

| Category | Elements |
|----------|----------|
| **Entry Points** | APIs, forms, file uploads |
| **Data Flows** | Input → Process → Output |
| **Trust Boundaries** | Where auth/authz checked |
| **Assets** | Secrets, PII, business data |

### Prioritization Matrix

```
Risk = Likelihood × Impact

High Impact + High Likelihood → CRITICAL
High Impact + Low Likelihood  → HIGH
Low Impact + High Likelihood  → MEDIUM
Low Impact + Low Likelihood   → LOW
```

---

## 5. Risk Prioritization

### CVSS + Context

| Factor | Weight | Question |
|--------|--------|----------|
| **CVSS Score** | Base severity | How severe is the vuln? |
| **EPSS Score** | Exploit likelihood | Is it being exploited? |
| **Asset Value** | Business context | What's at risk? |
| **Exposure** | Attack surface | Internet-facing? |

### Prioritization Decision Tree

```
Is it actively exploited (EPSS >0.5)?
├── YES → CRITICAL: Immediate action
└── NO → Check CVSS
         ├── CVSS ≥9.0 → HIGH
         ├── CVSS 7.0-8.9 → Consider asset value
         └── CVSS <7.0 → Schedule for later
```

---

## 6. Exceptional Conditions (A10 - New)

### Fail-Open vs Fail-Closed

| Scenario | Fail-Open (BAD) | Fail-Closed (GOOD) |
|----------|-----------------|---------------------|
| Auth error | Allow access | Deny access |
| Parsing fails | Accept input | Reject input |
| Timeout | Retry forever | Limit + abort |

### What to Check

- Exception handlers that catch-all and ignore
- Missing error handling on security operations
- Race conditions in auth/authz
- Resource exhaustion scenarios

---

## 7. Scanning Methodology

### Phase-Based Approach

```
1. RECONNAISSANCE
   └── Understand the target
       ├── Technology stack
       ├── Entry points
       └── Data flows

2. DISCOVERY
   └── Identify potential issues
       ├── Configuration review
       ├── Dependency analysis
       └── Code pattern search

3. ANALYSIS
   └── Validate and prioritize
       ├── False positive elimination
       ├── Risk scoring
       └── Attack chain mapping

4. REPORTING
   └── Actionable findings
       ├── Clear reproduction steps
       ├── Business impact
       └── Remediation guidance
```

---

## 8. Code Pattern Analysis

### High-Risk Patterns

| Pattern | Risk | Look For |
|---------|------|----------|
| **String concat in queries** | Injection | `"SELECT * FROM " + user_input` |
| **Dynamic code execution** | RCE | `eval()`, `exec()`, `Function()` |
| **Unsafe deserialization** | RCE | `pickle.loads()`, `unserialize()` |
| **Path manipulation** | Traversal | User input in file paths |
| **Disabled security** | Various | `verify=False`, `--insecure` |

### Secret Patterns

| Type | Indicators |
|------|-----------|
| API Keys | `api_key`, `apikey`, high entropy |
| Tokens | `token`, `bearer`, `jwt` |
| Credentials | `password`, `secret`, `key` |
| Cloud | `AWS_`, `AZURE_`, `GCP_` prefixes |

---

## 9. Cloud Security Considerations

### Shared Responsibility

| Layer | You Own | Provider Owns |
|-------|---------|---------------|
| Data | ✅ | ❌ |
| Application | ✅ | ❌ |
| OS/Runtime | Depends | Depends |
| Infrastructure | ❌ | ✅ |

### Cloud-Specific Checks

- IAM: Least privilege applied?
- Storage: Public buckets?
- Network: Security groups tightened?
- Secrets: Using secrets manager?

---

## 10. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Scan without understanding | Map attack surface first |
| Alert on every CVE | Prioritize by exploitability + asset |
| Ignore false positives | Maintain verified baseline |
| Fix symptoms only | Address root causes |
| Scan once before deploy | Continuous scanning |
| Trust third-party deps blindly | Verify integrity, audit code |

---

## 11. Reporting Principles

### Finding Structure

Each finding should answer:
1. **What?** - Clear vulnerability description
2. **Where?** - Exact location (file, line, endpoint)
3. **Why?** - Root cause explanation
4. **Impact?** - Business consequence
5. **How to fix?** - Specific remediation

### Severity Classification

| Severity | Criteria |
|----------|----------|
| **Critical** | RCE, auth bypass, mass data exposure |
| **High** | Data exposure, privilege escalation |
| **Medium** | Limited scope, requires conditions |
| **Low** | Informational, best practice |

---

> **Remember:** Vulnerability scanning finds issues. Expert thinking prioritizes what matters. Always ask: "What would an attacker do with this?"


## Red Team & MITRE ATT&CK Tactics (Merged)
---
name: red-team-tactics
description: Red team tactics principles based on MITRE ATT&CK. Attack phases, detection evasion, reporting.
when_to_use: "When performing penetration testing, red team exercises, or evaluating attack surfaces using MITRE ATT&CK framework."
allowed-tools: Read, Glob, Grep
version: 1.0.0
---

# Red Team Tactics

> Adversary simulation principles based on MITRE ATT&CK framework.

---

## 1. MITRE ATT&CK Phases

### Attack Lifecycle

```
RECONNAISSANCE → INITIAL ACCESS → EXECUTION → PERSISTENCE
       ↓              ↓              ↓            ↓
   PRIVILEGE ESC → DEFENSE EVASION → CRED ACCESS → DISCOVERY
       ↓              ↓              ↓            ↓
LATERAL MOVEMENT → COLLECTION → C2 → EXFILTRATION → IMPACT
```

### Phase Objectives

| Phase | Objective |
|-------|-----------|
| **Recon** | Map attack surface |
| **Initial Access** | Get first foothold |
| **Execution** | Run code on target |
| **Persistence** | Survive reboots |
| **Privilege Escalation** | Get admin/root |
| **Defense Evasion** | Avoid detection |
| **Credential Access** | Harvest credentials |
| **Discovery** | Map internal network |
| **Lateral Movement** | Spread to other systems |
| **Collection** | Gather target data |
| **C2** | Maintain command channel |
| **Exfiltration** | Extract data |

---

## 2. Reconnaissance Principles

### Passive vs Active

| Type | Trade-off |
|------|-----------|
| **Passive** | No target contact, limited info |
| **Active** | Direct contact, more detection risk |

### Information Targets

| Category | Value |
|----------|-------|
| Technology stack | Attack vector selection |
| Employee info | Social engineering |
| Network ranges | Scanning scope |
| Third parties | Supply chain attack |

---

## 3. Initial Access Vectors

### Selection Criteria

| Vector | When to Use |
|--------|-------------|
| **Phishing** | Human target, email access |
| **Public exploits** | Vulnerable services exposed |
| **Valid credentials** | Leaked or cracked |
| **Supply chain** | Third-party access |

---

## 4. Privilege Escalation Principles

### Windows Targets

| Check | Opportunity |
|-------|-------------|
| Unquoted service paths | Write to path |
| Weak service permissions | Modify service |
| Token privileges | Abuse SeDebug, etc. |
| Stored credentials | Harvest |

### Linux Targets

| Check | Opportunity |
|-------|-------------|
| SUID binaries | Execute as owner |
| Sudo misconfiguration | Command execution |
| Kernel vulnerabilities | Kernel exploits |
| Cron jobs | Writable scripts |

---

## 5. Defense Evasion Principles

### Key Techniques

| Technique | Purpose |
|-----------|---------|
| LOLBins | Use legitimate tools |
| Obfuscation | Hide malicious code |
| Timestomping | Hide file modifications |
| Log clearing | Remove evidence |

### Operational Security

- Work during business hours
- Mimic legitimate traffic patterns
- Use encrypted channels
- Blend with normal behavior

---

## 6. Lateral Movement Principles

### Credential Types

| Type | Use |
|------|-----|
| Password | Standard auth |
| Hash | Pass-the-hash |
| Ticket | Pass-the-ticket |
| Certificate | Certificate auth |

### Movement Paths

- Admin shares
- Remote services (RDP, SSH, WinRM)
- Exploitation of internal services

---

## 7. Active Directory Attacks

### Attack Categories

| Attack | Target |
|--------|--------|
| Kerberoasting | Service account passwords |
| AS-REP Roasting | Accounts without pre-auth |
| DCSync | Domain credentials |
| Golden Ticket | Persistent domain access |

---

## 8. Reporting Principles

### Attack Narrative

Document the full attack chain:
1. How initial access was gained
2. What techniques were used
3. What objectives were achieved
4. Where detection failed

### Detection Gaps

For each successful technique:
- What should have detected it?
- Why didn't detection work?
- How to improve detection

---

## 9. Ethical Boundaries

### Always

- Stay within scope
- Minimize impact
- Report immediately if real threat found
- Document all actions

### Never

- Destroy production data
- Cause denial of service (unless scoped)
- Access beyond proof of concept
- Retain sensitive data

---

## 10. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Rush to exploitation | Follow methodology |
| Cause damage | Minimize impact |
| Skip reporting | Document everything |
| Ignore scope | Stay within boundaries |

---

> **Remember:** Red team simulates attackers to improve defenses, not to cause harm.
