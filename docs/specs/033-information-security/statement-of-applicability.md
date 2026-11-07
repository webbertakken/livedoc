# Statement of Applicability

Every control in Annex A of ISO/IEC 27001:2022, whether it applies to the [ISMS](isms.md), and how it is met.

## Statuses

- **Implemented** - in place, with the evidence named.
- **Partial** - in place in part; the gap is named and tracked by a risk in the [risk register](risk-register.md).
- **Planned** - applicable, not yet in place.
- **To confirm** - in place by intent; its evidence is first produced by the next review that checks it.
- **Excluded** - not applicable, with the reason.

## 5 Organisational controls

| Control | Title                                                                  | Status      | How it is met, or why it is excluded                                                                                                                         |
| ------- | ---------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1     | Policies for information security                                      | Implemented | [ISMS](isms.md#information-security-policy), reviewed yearly                                                                                                 |
| 5.2     | Information security roles and responsibilities                        | Implemented | [ISMS](isms.md#roles)                                                                                                                                        |
| 5.3     | Segregation of duties                                                  | Partial     | One person; compensated by required CI checks, CodeQL, agent review and logged bypasses (`R-15`)                                                             |
| 5.4     | Management responsibilities                                            | Implemented | Webber is top management and ISMS owner                                                                                                                      |
| 5.5     | Contact with authorities                                               | Implemented | The Dutch Data Protection Authority (Autoriteit Persoonsgegevens), named in [incident response](../../instructions/respond-to-a-security-incident.md#notify) |
| 5.6     | Contact with special interest groups                                   | Implemented | GitHub Security Advisories, Cloudflare and npm security notices                                                                                              |
| 5.7     | Threat intelligence                                                    | Implemented | Dependabot and CodeQL alerts; supplier security notices                                                                                                      |
| 5.8     | Information security in project management                             | Implemented | Specs first; every change's brief covers "Security and trust"; [gate by share role](../../instructions/gate-a-feature-by-share-role.md)                      |
| 5.9     | Inventory of information and other associated assets                   | Implemented | [Information assets](assets.md)                                                                                                                              |
| 5.10    | Acceptable use of information and other associated assets              | Implemented | Terms of Service for users; the [Secrets policy](../002-project-scope/secrets-policy.md) for operators                                                       |
| 5.11    | Return of assets                                                       | Excluded    | No staff or contractors hold LiveDoc assets                                                                                                                  |
| 5.12    | Classification of information                                          | Implemented | [Classification](assets.md#classification)                                                                                                                   |
| 5.13    | Labelling of information                                               | Implemented | Class follows from the store the data lives in ([assets](assets.md#classification))                                                                          |
| 5.14    | Information transfer                                                   | Implemented | HTTPS only (Always Use HTTPS); Drive traffic goes browser to Google directly                                                                                 |
| 5.15    | Access control                                                         | Implemented | Per-request checks in the api; share roles; team membership on verified account ids                                                                          |
| 5.16    | Identity management                                                    | Implemented | better-auth in the api; guest ids signed; [Auth + guest access](../014-identity/auth-and-guest-access.md)                                                    |
| 5.17    | Authentication information                                             | Implemented | Email codes or Google; no passwords stored; API tokens stored as hashes and expire in 6 months                                                               |
| 5.18    | Access rights                                                          | Implemented | Users: share roles and teams. Operators: [Review operator access](../../instructions/review-operator-access.md)                                              |
| 5.19    | Information security in supplier relationships                         | Implemented | [Suppliers](assets.md#suppliers); [Review suppliers](../../instructions/review-suppliers.md)                                                                 |
| 5.20    | Addressing information security within supplier agreements             | To confirm  | Each processor's data processing terms, filed by the next supplier review                                                                                    |
| 5.21    | Managing information security in the ICT supply chain                  | Partial     | Lockfile, Dependabot version and security updates, CodeQL; new dependencies not yet reviewed by a set routine (`R-04`)                                       |
| 5.22    | Monitoring, review and change management of supplier services          | Implemented | Yearly [supplier review](../../instructions/review-suppliers.md)                                                                                             |
| 5.23    | Information security for use of cloud services                         | Implemented | Cloudflare account scoped tokens, EU data location for D1 and R2, documented in [docs.nu deployment](../../operations/docs-nu.md)                            |
| 5.24    | Information security incident management planning and preparation      | Implemented | [Respond to a security incident](../../instructions/respond-to-a-security-incident.md)                                                                       |
| 5.25    | Assessment and decision on information security events                 | Implemented | Triage step of the incident procedure                                                                                                                        |
| 5.26    | Response to information security incidents                             | Implemented | Contain, eradicate, recover steps of the incident procedure                                                                                                  |
| 5.27    | Learning from information security incidents                           | Implemented | Post-incident review folded into specs and this register                                                                                                     |
| 5.28    | Collection of evidence                                                 | Implemented | Evidence step of the incident procedure, kept in the ISMS record store                                                                                       |
| 5.29    | Information security during disruption                                 | Implemented | Recovery runs through the same pipeline and checks; no control is skipped to restore service                                                                 |
| 5.30    | ICT readiness for business continuity                                  | Partial     | Restores tested; no second operator (`R-08`); no platform fail-over (`R-09`)                                                                                 |
| 5.31    | Legal, statutory, regulatory and contractual requirements              | Implemented | [Interested parties](isms.md#interested-parties-and-their-requirements); Privacy Policy; Terms                                                               |
| 5.32    | Intellectual property rights                                           | Implemented | MIT licence; [Third-party licences](../002-project-scope/third-party-licences.md)                                                                            |
| 5.33    | Protection of records                                                  | Implemented | ISMS record store, private, kept 3 years                                                                                                                     |
| 5.34    | Privacy and protection of PII                                          | Implemented | Privacy Policy; minimal data; self-service account deletion; anonymous telemetry                                                                             |
| 5.35    | Independent review of information security                             | Planned     | An external internal audit, only when [certification](isms.md#towards-certification) is pursued                                                              |
| 5.36    | Compliance with policies, rules and standards for information security | Implemented | [Run the ISMS review](../../instructions/run-the-isms-review.md)                                                                                             |
| 5.37    | Documented operating procedures                                        | Implemented | [Instruction sets](../../instructions/README.md); [docs.nu deployment](../../operations/docs-nu.md)                                                          |

## 6 People controls

| Control | Title                                                      | Status      | How it is met, or why it is excluded                                                                                    |
| ------- | ---------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| 6.1     | Screening                                                  | Excluded    | No employees or contractors                                                                                             |
| 6.2     | Terms and conditions of employment                         | Excluded    | No employees or contractors                                                                                             |
| 6.3     | Information security awareness, education and training     | Implemented | Each yearly ISMS review records what Webber learnt and changed                                                          |
| 6.4     | Disciplinary process                                       | Excluded    | No employees or contractors                                                                                             |
| 6.5     | Responsibilities after termination or change of employment | Excluded    | No employees or contractors                                                                                             |
| 6.6     | Confidentiality or non-disclosure agreements               | Excluded    | No one but Webber reaches Confidential data                                                                             |
| 6.7     | Remote working                                             | Implemented | All work is remote; covered by the endpoint controls 8.1 and 7.9                                                        |
| 6.8     | Information security event reporting                       | Implemented | Private vulnerability reporting on GitHub; [Vulnerability disclosure](../002-project-scope/vulnerability-disclosure.md) |

## 7 Physical controls

LiveDoc has no premises or servers of its own: data centres are Cloudflare's, covered by its certifications (5.19).

| Control | Title                                                 | Status      | How it is met, or why it is excluded                                                  |
| ------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| 7.1     | Physical security perimeters                          | Excluded    | No premises; hosting is Cloudflare's                                                  |
| 7.2     | Physical entry                                        | Excluded    | No premises                                                                           |
| 7.3     | Securing offices, rooms and facilities                | Excluded    | No premises                                                                           |
| 7.4     | Physical security monitoring                          | Excluded    | No premises                                                                           |
| 7.5     | Protecting against physical and environmental threats | Excluded    | No premises; hosting is Cloudflare's                                                  |
| 7.6     | Working in secure areas                               | Excluded    | No secure areas                                                                       |
| 7.7     | Clear desk and clear screen                           | To confirm  | Screen lock on operator devices, checked by the access review                         |
| 7.8     | Equipment siting and protection                       | Excluded    | No equipment beyond operator devices (7.9)                                            |
| 7.9     | Security of assets off-premises                       | To confirm  | Full-disk encryption on operator devices, checked by the access review                |
| 7.10    | Storage media                                         | Implemented | No Confidential data is copied to removable media; D1 exports stay on encrypted disks |
| 7.11    | Supporting utilities                                  | Excluded    | Hosting is Cloudflare's                                                               |
| 7.12    | Cabling security                                      | Excluded    | Hosting is Cloudflare's                                                               |
| 7.13    | Equipment maintenance                                 | Excluded    | Hosting is Cloudflare's                                                               |
| 7.14    | Secure disposal or re-use of equipment                | Implemented | An operator device is wiped before disposal or re-use                                 |

## 8 Technological controls

| Control | Title                                                       | Status      | How it is met, or why it is excluded                                                                                         |
| ------- | ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 8.1     | User endpoint devices                                       | To confirm  | Encryption, screen lock and updates on operator devices, checked by the access review                                        |
| 8.2     | Privileged access rights                                    | Implemented | Scoped deploy token; one admin; the `main` ruleset's admin bypass works only through a pull request (`R-15`)                 |
| 8.3     | Information access restriction                              | Implemented | Api access checks on every route; D1 only through the api worker                                                             |
| 8.4     | Access to source code                                       | Implemented | Public to read; writes only through pull requests into the `main` ruleset                                                    |
| 8.5     | Secure authentication                                       | Partial     | Users: email codes, Google, signed sessions. Operators: phishing-resistant MFA not yet everywhere (`R-01`)                   |
| 8.6     | Capacity management                                         | Implemented | Serverless scaling; per-owner image caps; rate limiters                                                                      |
| 8.7     | Protection against malware                                  | Implemented | Uploads accepted only as sniffed image types (`apps/api/src/image-sniff.ts`); operator devices updated                       |
| 8.8     | Management of technical vulnerabilities                     | Implemented | CodeQL gate; Dependabot alerts and security updates; private reporting                                                       |
| 8.9     | Configuration management                                    | Implemented | `wrangler.toml` and the hosted profile in code; `hosted-vars.mjs verify` after deploy                                        |
| 8.10    | Information deletion                                        | Implemented | Trash purge after 30 days; account deletion; retention in the Privacy Policy                                                 |
| 8.11    | Data masking                                                | Implemented | Telemetry is anonymous labels; IPs kept only as one-way hashes; tokens as hashes                                             |
| 8.12    | Data leakage prevention                                     | Implemented | Secret scanning with push protection; gitleaks as a required check; no content in logs or telemetry                          |
| 8.13    | Information backup                                          | Partial     | D1 Time Travel, 30 days, [tested](../../instructions/test-a-restore.md); no room restore hook (`R-06`); R2 has none (`R-07`) |
| 8.14    | Redundancy of information processing facilities             | Implemented | Cloudflare's own replication within the platform                                                                             |
| 8.15    | Logging                                                     | Implemented | Fingerprinted worker logs; Cloudflare request logs; GitHub security log                                                      |
| 8.16    | Monitoring activities                                       | Partial     | Red-main issues and the error-health telemetry; no alerting on error spikes (`R-13`)                                         |
| 8.17    | Clock synchronisation                                       | Implemented | Cloudflare and GitHub clocks                                                                                                 |
| 8.18    | Use of privileged utility programs                          | Implemented | `wrangler` against production only for recovery, logged in an incident record                                                |
| 8.19    | Installation of software on operational systems             | Implemented | Production only runs what CI built from `main`                                                                               |
| 8.20    | Networks security                                           | Implemented | Cloudflare edge; HTTPS only                                                                                                  |
| 8.21    | Security of network services                                | Implemented | Cloudflare edge; service bindings between workers, not public calls                                                          |
| 8.22    | Segregation of networks                                     | Implemented | Each preview has its own workers, D1 and R2                                                                                  |
| 8.23    | Web filtering                                               | Excluded    | No staff network to filter                                                                                                   |
| 8.24    | Use of cryptography                                         | Implemented | TLS; hashed tokens and IPs; encrypted Drive refresh tokens; signed sessions and guest ids                                    |
| 8.25    | Secure development life cycle                               | Implemented | Specs, briefs with a security category, tests, CI, CodeQL                                                                    |
| 8.26    | Application security requirements                           | Implemented | Each change brief's "Security and trust" category                                                                            |
| 8.27    | Secure system architecture and engineering principles       | Implemented | No secrets in source; D1 only behind the api; router holds no logic                                                          |
| 8.28    | Secure coding                                               | Implemented | oxlint, typechecks, Trusted Types, CodeQL                                                                                    |
| 8.29    | Security testing in development and acceptance              | Implemented | Share-role tests; E2E smoke; CodeQL gate                                                                                     |
| 8.30    | Outsourced development                                      | Implemented | Agents work only through pull requests under the same checks                                                                 |
| 8.31    | Separation of development, test and production environments | Implemented | Local dev, per-pull-request previews, production; separate data per preview                                                  |
| 8.32    | Change management                                           | Implemented | Pull requests, required checks, automatic deploy of green `main` only                                                        |
| 8.33    | Test information                                            | Implemented | Tests and previews use synthetic data; production data never copied to them                                                  |
| 8.34    | Protection of information systems during audit testing      | Implemented | Audits read records and configs; no testing against production data                                                          |
