# Hunter World: complete roadmap and first playable-prototype goal

Planning baseline: 2026-09-21; progress evidence updated 2026-09-27. This document summarizes the approved blueprint and records the active goal boundary and human handoffs. Task completion requires the evidence in the ledger.

Authoritative implementation detail remains in the [master blueprint](master-blueprint.md), [173-task ledger](../tasks/ledger.md), original brief referenced by [brief-source](../product/brief-source.md), and current [verification evidence](../testing/foundation-verification.md). Latest explicit owner decisions take precedence. Preserve stable task IDs and update evidence as execution progresses.

## 1. What we have accomplished

**Completed phases: 0 and 1. Tasks 2.1 and 2.2 complete; current work: Phase 2, Task 2.3.** The ledger contains **173 tasks: 14 complete, 159 planned**. Task counts are not an estimate of percentage effort completed.

| Area                              | Implemented or established                                                                                                                                                                                                                                                                      | Verification and remaining limits                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product and architecture, Phase 0 | Original requirements recorded; 32 requirement sections, 28 acceptance scenarios, 12 invariants, architecture decisions, content budget, lifecycle/privacy/ownership policies and roadmap.                                                                                                      | Planning baseline complete. The 28 product acceptance cases are still recorded as not-run; planning them is not passing them.                                                                                                                                    |
| Engineering foundation, Phase 1   | pnpm/TypeScript workspace; React player and separate operator apps; Fastify API; worker; public contracts; strict types, lint, builds, import boundaries, CI, SQL migrations, environment validation and seed tooling.                                                                          | Foundation and CI checks passed. No gameplay exists yet.                                                                                                                                                                                                         |
| Durable operations                | Transaction/outbox/worker skeleton, request IDs, structured logs, health/readiness, feature controls, retry-safe demonstration job.                                                                                                                                                             | Real PostgreSQL tests cover rollback and restart/retry without duplicate business effects. Worker startup was tested; continuously hosted worker operation remains to be established.                                                                            |
| Managed development               | Private GitHub repository; Supabase in Paris; restricted runtime database connection over TLS; eight canonical migrations; Mailjet email; one maintained main Vercel frontend; Render API.                                                                                                      | The main Vercel site is READY at `91c5d74`; the old standalone project is absent and its URL returns 404. The prior frontend/API revision match at `5c1bc5c` remains historical evidence; the API has not changed. Paris hosting does not select the pilot city. |
| Player accounts, part of Task 2.1 | Registration, verification, password sign-in, refresh and recovery; enrolled-account TOTP step-up; restricted recovery/OTP access; session-bound mutations and cross-tab protection; explicit sign-in after password replacement.                                                               | Reviewed code is deployed and automated checks pass. Owner-reported enrolled recovery passed on 2026-09-24; both enrolled and unenrolled mailbox recovery are now owner-reported passed.                                                                         |
| Operator access, part of Task 2.1 | Audited owner assignment/suspension by email; main-site automatic routing to the embedded `/_system/console/` application; verified email, password/TOTP AAL2 and current database assignment required for access.                                                                              | The designated operator passed real enrollment, the standalone and earlier main-site round trips, and the revised main-site password/TOTP round trip on 2026-09-27. Administrative mutation routes remain closed.                                                |
| Player presentation               | Portrait mobile-first shell, centered on desktop, bottom navigation, safe-area spacing, accessible touch targets and internal scrolling.                                                                                                                                                        | Browser layouts were tested, including narrow/short screens. This does not establish native packaging, actual keyboard behavior or physical-device readiness.                                                                                                    |
| Development-agent environment     | Quality-first instructions; fifteen supported agent profiles; Astra High orchestration, GPT-6 Sol implementation/review, GPT-5.6 Sol frontend/design, Luna bounded routine work, evidence-based delegated Astra escalation; conditional Context7 policy; explicit Ultra authorization boundary. | Configuration/native-path checks and 13 guard regression tests are recorded. The guard covers supported launch paths, not every conceivable runtime path. This setup adds no game features.                                                                      |

Latest code checks: **184 unit/API tests and 25 real PostgreSQL integration tests**, plus types, lint, formatting, boundaries, credential checks and builds. [CI run 36323339786](https://github.com/Dwinyyy/project-gate/actions/runs/36323339786) passed at `f0432f9`, including browser regression tests. The reviewed Task 2.2 migration is applied to managed development with a matching canonical SHA receipt; it adds no character creation API or UI. The owner-reported account and operator journeys remain the Task 2.1 evidence.

Current previews:

- [Player](https://project-gate-player.vercel.app): account-enabled foundation shell.
- [Main-site operator entry](https://project-gate-player.vercel.app/_system/console/): restricted console sharing the main-site login.
- The retired standalone operator address returns 404 after the owner removed its Vercel project on 2026-09-27.

**Character persistence is implemented in the private database, but character creation, UI and gameplay are unavailable. Inventory, quests, geography, combat, multiplayer, economy and native packages are not implemented.** The previews remain account-enabled foundation shells. Current environment and deployment evidence is recorded in [development services](../runbooks/development-services.md).

## 2. First /goal: complete the playable prototype through Phase 6

Owner-selected boundary: finish the remaining work in **Phases 2–6**, with **Android as the first physical-device target**. The initial 37 unfinished tasks are now **35**, after Tasks 2.1 and 2.2 completion. Do not quietly expand this goal into multiplayer, store release or all later phases. Keep prototype gameplay and initial death experiments limited to designated development test accounts.

The intended experience is: create one persistent unawakened character; use the System and private/public identity views; find a reviewed hub; interact with an NPC; finish useful civilian work; receive an actual inventory/wallet reward; enter an eligible solo Gate; make tactical decisions; extract or receive a recorded consequence; reconnect to the same authoritative state.

### Phase 2 — Finish accounts, characters, System and ID: 2.1–2.7

1. **2.1 complete:** Matching frontend/API deployment, recovery TOTP implementation, denial/failure tests, both owner-reported recovery journeys and revised main-site password/TOTP round trip are verified. The mobile operator, private main-site entry, compact account check and registration confirmation are deployed and tested. The old standalone Vercel project is removed and its URL returns 404. Manual gates **H1–H2** have owner evidence.
2. **2.2 complete:** Durable private game account and character tables, separate initial lifecycle/visibility columns, noncascading history and a PostgreSQL index enforcing one living slot, including incapacitated characters. The reviewed migration is applied to managed development with the character feature flag disabled. **2.3–2.4 next:** Implement verified login linkage, transactional creation, cooldown eligibility and operation-specific authority for active, incapacitated, restricted, dead and observer states. Standing remains a later relation.
3. **2.5–2.7:** Build appearance/alias onboarding, System panel, body status, loading/error states, privacy-controlled profiles, fullscreen ID, scoped invitation QR and own-record/observer views. Dead characters cannot post, trade or earn rewards.

**Exit:** A real account creates exactly one persistent unawakened character with MP shown as Dormant; concurrent second creation fails safely; privacy and current authority hold. Verify A01, A02 and A06 with appropriate real integration evidence.

### Phase 3 — Property, inventory, currency and reliable commands: 3.1–3.7

1. **3.1–3.2:** Implement ownership principals, custody/containers, item definitions/instances, stack lots, equipment, movement history and balanced integer currency journals with explicit sources/sinks.
2. **3.3–3.4:** Add operation receipts, stable retry identity, request digests, status lookup, lock ordering, and expiring reservations for items, quantities, money and destination capacity.
3. **3.5–3.7:** Implement acquire/move/split/merge/equip/unequip/consume/discard; inventory/equipment/details/wallet/storage screens; reconciliation and operator inspection.

**Exit:** Conflicting actions cannot duplicate or spend the same property; journals reconcile; recovering a lost response returns the original result. No normally required human handoff.

### Phase 4 — Content, quests, achievements and rewards: 4.1–4.7

1. **4.1–4.3:** Implement private versioned content, validated publication, bounded conditions from authoritative facts, transactional reward grants, provenance, supply budgets and replay protection.
2. **4.4–4.6:** Add quest acceptance/objectives/chains/expiry/failure/completion, civilian/support achievements, journal, approved hints and reward receipts.
3. **4.7:** Add operator content preview, private diagnostics, publication, retirement and rollback. Establish continuously running durable work before accepting hosted time-dependent behavior; inspect existing hosting first (**H0**, only if access or paid capacity is missing).

**Exit:** A supported new quest can be published as content without changing the client; repeated completion/events issue one reward; hidden rules remain private.

### Phase 5 — Map, civilian life, NPCs, board and early Android proof: 5.1–5.8

1. **5.1–5.4:** Add reviewed regions/venues, opening hours, PostGIS, real location ingestion, freshness/accuracy decisions, approximate opt-in presence, shelter transitions, map filters and useful permission/error states. Keep any deterministic movement simulator isolated, visibly labeled and unavailable to production authority.
2. **5.5–5.7:** Implement NPC appearances/dialogue/services; a useful civilian contract; initial Association Board, help and reporting; complete hub → NPC → work → reward → journal → next objective.
3. **5.8:** Package an early Capacitor Android build and verify real login, map, GPS permissions, API access, suspend/resume and deep links. This is an early feasibility test; full mobile release remains Phase 16.

**Human gates:** **H3** for real venues/tester access, **H4** if map credentials/account setup are needed, **H5** for the phone. Prepare software before requesting those actions. Missing public pilot venues must not be bypassed with fabricated real-world evidence.

**Exit:** A civilian has a useful saved session. Location denial leaves appropriate remote/social functions usable. The selected Android phone passes the early device matrix.

### Phase 6 — Solo Gate and tactical combat: 6.1–6.8

1. **6.1–6.2:** Separate Gate spawns from encounter instances; implement disclosed risks, preparation, entry checks, readiness, commitment and pinned rule/content versions.
2. **6.3–6.4:** Implement deterministic attack, guard, skill, item, first aid and withdrawal actions; resources, injuries, poison/bleeding, buffs, incapacitation and rescue deadlines. Class progression is still Phase 7; an action type existing does not grant a civilian class skills.
3. **6.5–6.6:** Implement extraction, objectives, personal entitlements, inventory settlement, private-test death finalization, authority revocation, cooldown and basic estate anchoring.
4. **6.7–6.8:** Build target selection/action previews/logs/retreat explanation/reconnect restoration, plus replay with injected clocks and recorded randomness.

**Exit and goal completion:** A real persisted character completes the civilian loop and a solo encounter; retries/reconnect cannot add actions or rewards; invalid actions fail safely; outcomes persist across API/worker restart; Android evidence and independent review are complete. Supply the current working browser preview, device build/instructions and honest limitations. **Public lethal play remains disabled** until full estates, service-failure protection and later operational acceptance exist.

Prototype content is the minimum complete content needed for one civilian loop and one solo encounter. The full launch content budget below is a later milestone, not an excuse to postpone a playable prototype.

## 3. Everything after the prototype

These phases remain planned. Their exact numbered tasks, security requirements and acceptance criteria remain in blueprint §11 and the ledger. Later phases may start only after their listed prerequisites pass; independent crafting work can begin after Phases 3–5 when it does not distract from the first goal.

| Phase / tasks                                      | Complete intended result                                                                                                                                                                                                                                                                                                                                 | Prerequisite / checkpoint                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **7: Awakening and progression, 7.1–7.7**          | Six dependable hidden awakening routes; replay-safe awakening; Warrior, Mage, Ranger, Assassin, Guardian and Healer; three active skills and a passive per archetype; XP, training, equipment interactions/resets; support-aware E–S assessments; class/skill/disclosure UI; professional credentials and seasonal standing kept separate.               | 4, 6. **Internal vertical slice.**                                                                          |
| **8: Cooperative play, 8.1–8.8**                   | Authenticated realtime snapshots/revisions; parties/invitations/leadership; readiness and loot rules; frozen committed membership; bounded rounds; reconnect/grace/guard/withdrawal; support-aware rewards; party UI/text; service-failure freeze epoch.                                                                                                 | 6, 7. Real cooperative outcomes, not client-only multiplayer.                                               |
| **9: Professions, 9.1–9.8**                        | Qualifications, recipes and facilities; material/tool quotes and reservations; durable crafts, quality and cancellation/failure; funded commissions, custody/deadlines/settlement; usable crafting/commission screens; eight initial medicine/smithing/alchemy recipes and civilian paths.                                                               | 3–5. Can run independently once dependencies pass.                                                          |
| **10: Trade and stalls, 10.1–10.7**                | Mutual invitations/QR without automatic acceptance; revisioned offers; exact reservations; edits invalidate confirmation; atomic life/permission/proximity/property checks; timeout/death cleanup and receipt recovery; session-bound personal stalls; negotiation and comparison screens.                                                               | 3, 5, 8. Both sides settle together or neither does.                                                        |
| **11: Guilds and community, 11.1–11.9**            | Civilian and hunter founding; scoped roles/recruitment/expeditions/projects; collective treasury/vault/loans and approvals; public/restricted/guild forums and search permissions; friends/blocks/messaging; typed evidence reports; event-backed news; inbox/preferences/moderation; succession/inactivity policy.                                      | 3, 5, 8. Social status never grants operator authority.                                                     |
| **12: Markets and delivery, 12.1–12.10**           | Merchant licensing; venue/capacity/registration; vendor contracts/deposits/hours/commission; remote previews versus nearby access; offline-vendor local sales; deliberate World Exchange listings; funded delivery custody/capacity/ETA/payment/refund; legitimate modifiers and paired barter; complete buyer/vendor/owner screens and closure/returns. | 9–11. **Multiplayer MVP**, with controlled lifecycle boundaries.                                            |
| **13: Full permanent death, 13.1–13.9**            | Final death transaction; frozen estates; cancellation or settlement of obligations; salvage and guild-loan returns; guild/market succession; privacy-preserving archives; server cooldown and distinct replacement life; death UI and attributable reconciliation.                                                                                       | 6, 9–12. No resurrection, inherited authority or arbitrary balance edits.                                   |
| **14: Hostility and disasters, 14.1–14.9**         | Warded/risk contexts; causal aggression, defense and assist attribution; Blood Debt/fatal fracture; deterministic simultaneous outcomes; invasions/evacuation/rescue; physical re-entry rules; explanations/evidence; lethal outage freeze and recovery.                                                                                                 | 8, 13. Public irreversible play remains gated on operational readiness.                                     |
| **15: Discovery and launch content, 15.1–15.8**    | Finite/scoped claims with first-valid-commit allocation and enforced budgets; NPC forum activity, archived departures, alternate completion and explicit killability; unstable/hidden Gates and a small boss raid; specializations; complete launch dependency graph; discovery/news provenance; sparse-area material alternatives.                      | 7, 9, 11, 14. Finish the bounded launch catalog.                                                            |
| **16: Full mobile delivery, 16.1–16.8**            | Signed Android/iOS builds; links, GPS, lifecycle, secure credentials, haptics/audio/push; permission revocation/token rotation; touch/keyboard/safe areas; authenticated links; accessibility, battery/network and physical-device matrix.                                                                                                               | Early Android spike at 5.8; complete after 12–15. **H6** for Mac/iPhone/signing/accounts.                   |
| **17: Hardening, 17.1–17.9**                       | Authorization/concurrency/property/fault/freeze tests; load, locks, pools and realtime; economic simulation; abuse/moderation/retention/operator permissions; backup/restore; accessibility/performance/onboarding/risk review; evidence pack, dashboards, actionable alerts, runbooks and known-limitations register.                                   | 9–16. No known critical authority, duplication, privacy or irreversible-outcome failures.                   |
| **18: Closed alpha, 18.1–18.7**                    | Concentrated real testers at accessible venues; observed civilian/crafter/merchant/combat roles; party/trade/markets/remote orders/return journeys; disclosed loss/cooldown/recovery; economy/GPS/moderation/support evidence; classify defects versus tuning versus rule changes; repair and pass alpha exit.                                           | 17. **H7**: actual people and field participation.                                                          |
| **19: Regional beta and production, 19.1–19.8**    | Legal/privacy/age/store/license/support/name decisions; separate production services, secrets, backups/domains/monitoring/quotas; controlled migration/flags/smokes; cohort rollout and covered lethal operations; two operating-cycle reviews; restore/upgrade/rollback proof; signed releases/regions; support rota and content calendar.              | 18. **H8**: ownership, budget, legal decisions and explicit release authorization.                          |
| **20: Expansion, 20.1–20.8**                       | Advanced professions/tools/classes and rare/mythic content/events; buy orders/fairs/auctions; bounded guild competition without exclusive control of essential progression; cosmetics with verified billing/refunds; new regions supported by evidence; measured infrastructure scaling; explicitly disclosed risky transport/estate sales.              | Stable 19. **H9** for commerce/territories; no speculative scaling.                                         |
| **21: Institutions and world campaign, 21.1–21.9** | National associations/home chapters and a singleton WHA; charters, offices, cases/appeals; elections/terms/conflicts/removal/succession; chapter transfer; bounded policies/disaster/recognition/sanctions; governance permissions; vacancy/death without inherited office; authored world history/campaign; optional NPC AI with no outcome authority.  | 20 plus a real eligible population. **H10**: population and community prerequisites cannot be manufactured. |

**Later launch-content budget:** one region, three reviewed hubs, three standard Gates (two solo, one party), eight enemies, six archetypes with three active skills and one passive each, 24 items, eight recipes, six ordinary NPCs plus one finite rare encounter, 12 quests, six ordinary awakening routes, one registered fixed-price market with remote listings, one guild project and both guild-founding routes. Additional planned Gate varieties are implemented in their own later phase; this initial catalog is a scope control, not an exhaustive expansion limit.

Milestones: **prototype 6 → internal vertical slice 7 → multiplayer MVP 12 → complete pre-alpha systems/hardening 17 → closed alpha 18 → regional beta/production 19 → expansion 20 → mature institutions 21**. Phase numbers alone never establish release permission.

## 4. Exactly where human action is required

At a gate, finish all independent authorized preparation first. Report the blocked task, what is ready, why only the owner/tester can act, the exact current URL and control labels, expected result and how to resume. Keep dependent work pending and continue useful independent work. Do not mark a task complete, replace real evidence with a mock, repeatedly retry a human-only action, or automatically change a goal to paused without the user's instruction.

The steps below use inspected application labels and current vendor documentation. Future product screens do not exist yet; their exact labels must be verified on the actual build before a handoff. Phone/account-specific variations are identified rather than invented. Keep passwords, authenticator seeds, recovery links and private credentials out of chat and evidence files.

### H0 — Conditional service access, deployment or new spending

**When:** Before the fresh deployed auth test, and before any new durable worker/paid map/production service. Existing Supabase, Vercel, Render, Mailjet and GitHub setup must not be repeated unnecessarily.

**Codex first:** Inspect existing grants and services; prepare the exact changes, migration/deployment artifact, projected cost if any and rollback. Use existing authorized access. Confirm the Render API revision and whether a worker is persistently hosted. A health response alone is insufficient.

**You, only if actually blocked:** Open the specific provider login/project URL supplied at that time → sign in → complete the provider's MFA/verification prompt → return to this task and say `Service access ready`. If a paid plan or broader grant is needed, review the prepared amount/scope and authorize or decline it; Codex supplies the currently verified provider controls instead of asking you to find them. No blanket new spending or public release is included in the first goal. Git commits/pushes follow existing project authorization; if absent, prepare the reviewable change before requesting the missing authorization.

**Resume evidence:** Authenticated service access and a verified deployment revision/worker execution, not merely a login assertion. A provider-specific exact click sequence is supplied only if this conditional gate is reached, because the missing provider/action is not yet established.

### H1 — Real player email and password recovery: Task 2.1

**Current status (2026-09-24):** The owner reported **Enrolled recovery passed**. The owner subsequently reported **Unenrolled recovery passed**; both recovery journeys now have owner-observed acceptance.

**Codex first:** Repair enrolled-account recovery MFA, pass automated checks, confirm matching deployed API/player versions and prepare designated test accounts. Never ask you to test an unprepared reset fix.

**You:**

1. Open [Create account](https://project-gate-player.vercel.app/account/register).
2. Enter a test **Email address** you control and a **Password** of at least 12 characters; click **Create account**. Expect **Check your email to verify this account.** Skip creating another account when the designated existing account already covers this test.
3. Open that mailbox, open the verification message and click its verification link. Do not paste the link into chat.
4. Open [Sign in](https://project-gate-player.vercel.app/account/sign-in), enter **Email address** and **Password**, then click **Sign in**. Refresh once and confirm the session remains usable; then **Sign out**.
5. Click **Forgot your password?**, enter **Email address**, and click **Send recovery link**. Expect **If the account exists, a recovery link is on its way.**
6. Open the newest recovery email and its reset link. Confirm ordinary signed-in actions are unavailable during recovery.
7. Enter **New password** and **Confirm new password**, then click **Update password**.
8. Expect the sign-in screen and **Your password has been updated. Sign in with your new password.** Confirm the old password no longer signs in, then sign in explicitly with the new password. Codex checks the accompanying server/session evidence without collecting either password.
9. Repeat recovery for the designated MFA-enrolled account after H2 and confirmation that the reviewed recovery patch is deployed. Expect **Authenticator verification required.** Enter its current code in **Authenticator code**, then click **Verify authenticator**. Expect **Choose a new password.** Complete steps 7–8. An incorrect or expired code must leave password replacement unavailable; enter all codes only in the app. If the initial security check fails, use **Try security check again**.
10. Return here with `H1 completed` or the exact non-secret error and failed step.

**Resume evidence:** Mail delivered, complete recovery journey passed on matching code, enrolled and unenrolled behavior covered, ordinary authority denied during recovery, explicit sign-in after completion. Email compromise and provider token-revocation limits must not be represented as eliminated.

### H2 — Real operator identity and authenticator: Task 2.1

**Passed 2026-09-24:** the owner confirmed the main-site password/TOTP round trip on reviewed deployment 5c1bc5c. Keep these instructions for future designated operators; do not repeat completed provisioning.

**Codex first:** Confirm matching deployed frontend/API revisions and the email-assignment migration. The designated operator is already assigned and previously passed the standalone authenticator round trip; preserve that evidence and do not repeat provisioning. For additional operators, follow the reviewed [assignment-by-email runbook](../runbooks/operator-access.md). ADR 0010 permits owner assignment before enrollment, while actual operator access requires verified TOTP and AAL2. The owner enters passwords and codes privately. Merely signing up must never grant operator access.

**You:**

1. After Codex confirms deployment, close or reload older player/operator tabs so all tabs use the current session coordination code. Open [main-site sign-in](https://project-gate-player.vercel.app/account/sign-in).
2. Enter **Email address** and **Password**; click **Sign in**. Expect automatic navigation to `/_system/console/` on the same site, without entering the password again.
3. An already enrolled account should show the authenticator challenge. For first enrollment on a newly assigned account, click **Set up authenticator**.
4. On your authenticator app, choose its add-account/scan-QR action and scan the displayed QR. Use **Manual setup key** only if QR scanning is unavailable. Codex gives app-specific taps if needed; different authenticators use different labels.
5. Enter the current **Six-digit code** in the operator page; click **Verify authenticator**.
6. Expect **AAL2 · Authorized** and **Operator session authorized.** Assignment alone must not open authorized content before authenticator verification.
7. Reload the page and confirm the authorized session remains usable.
8. Click **Sign out**. Return to main-site sign-in, sign in again and complete the authenticator challenge. Codex checks wrong/expired codes and missing/suspended grants in appropriate test accounts.
9. Return here with `H2 completed`. Never send the QR, setup key, password or code in chat.

**Resume evidence:** Main-site automatic operator routing, successful authenticator challenge plus current database grant, sign-out and reauthentication on the revised deployed code. The earlier standalone and main-site round trips passed on the previous checkpoint; the revised main-site round trip also passed on 2026-09-27. Both recovery journeys passed. The mobile operator/private-entry and password-confirmation work is deployed and automatically checked; the old hosting project was removed on 2026-09-27.

### H3 — Real geography and accessible venues: before Phase 5 acceptance

EU-first recruitment, English and Paris hosting are chosen. **A pilot city is not chosen.** Geography cannot be inferred from your timezone or the database region.

**Codex first:** Prepare a short venue checklist and candidate comparison once recruitment reach is known; implement the venue model and isolated development fixtures. Prepare one reviewed accessible test hub for the prototype; the full initial launch catalog requires three hubs later.

**You:**

1. Reply in this task with a city/area where you or a willing tester can physically test, and whether that person is available. You do not need to share your home or live location.
2. Supply candidate public venue names or public map links, access/opening restrictions and known accessibility issues.
3. Review Codex's proposed boundaries and visit/test plan. Confirm the venue is publicly accessible and suitable, or reject it with the reason.
4. The tester visits only during permitted access, opens the prepared build, grants location for the test and completes the supplied proximity scenario.
5. Report the named test result without posting precise location trails.

**Resume evidence:** Reviewed venue and real physical test. A labeled simulator can support development but cannot satisfy real proximity acceptance. If the eventual EU launch city differs from the accessible development test area, keep those configurations separate and repeat pilot review before alpha.

### H4 — Map provider account/key, only if missing: Phase 5

**Codex first:** Confirm whether a suitable MapTiler account/key already exists; determine installed integration versions and the exact web/native protection settings; prepare ignored configuration or the secret-entry interface. Do not add paid subscriptions without authorization.

**You, if needed:** Sign in to [MapTiler Cloud](https://cloud.maptiler.com/) → **API keys** → **Edit** beside the intended key, or **New key** → apply the exact restrictions Codex prepared → save/confirm creation → enter the key into the prepared local/provider field → return with `Map key configured`. Codex verifies actual tiles, attribution, permitted origins and native behavior. A web origin restriction is not assumed to solve native-app protection. These labels come from [MapTiler's key instructions](https://docs.maptiler.com/cloud/api/authentication-key/).

**Resume evidence:** Real authorized map requests work in the intended builds, with appropriate attribution, restrictions and quota handling.

### H5 — Your Android phone: Task 5.8 and final prototype verification

**Codex first:** Install/configure available development tooling, prepare the native project and debug build, resolve drivers where possible, and give you a named device-test checklist. You do not need to buy a store account to begin the direct connected-device debug test.

**You:**

1. On a Pixel/common Android layout: **Settings → About phone → Build number**. On Samsung: **Settings → About phone → Software information → Build number**.
2. Tap **Build number** seven times and enter the phone PIN if prompted.
3. Return to **Settings** and open **Developer options** (on some phones under **System**); enable **USB debugging**.
4. Connect the unlocked phone to this computer with a USB data cable. Accept the phone's USB debugging authorization prompt for this computer.
5. Tell Codex `Android connected`. Codex verifies the device and installs/launches the prepared build; if an OS install confirmation appears, confirm that named debug build.
6. Sign in inside the app. Exercise the supplied map screen; first deny location, then use **Settings → Apps → [installed app name] → Permissions → Location** to allow location while using the app. Where offered, test approximate and precise permission separately. Exact settings vary; Codex adapts these taps to your phone model before the gate.
7. Open the keyboard, background and resume the app, open the prepared deep link, briefly disconnect/reconnect networking, and confirm the expected saved state. Physical venue testing belongs to H3; do not walk around to debug an unfinished build.
8. After Phase 6, repeat the civilian and Gate journeys on that phone; report the step and non-secret visible error for any failure. Turn USB debugging off after testing if you do not need it.

The activation paths and manufacturer differences are documented by [Android Developer options](https://developer.android.com/studio/debug/dev-options); connected-device build execution is documented in [Run apps on a hardware device](https://developer.android.com/studio/run/device).

**Resume evidence:** Device model/OS, build revision and actual pass/fail results for login, keyboard/layout, map/location, lifecycle, deep link and saved-state recovery. An emulator or responsive screenshot cannot replace this gate.

### H6 — iOS hardware, signing and distribution: Phase 16, not this first goal

**Codex first:** Complete portable implementation and prepare signing requirements, bundle identifiers, builds and a cost/account checklist. Identify actual Mac build access and iPhone availability; do not assume this Windows machine can sign iOS locally.

**You:** Provide access to the chosen Mac/iPhone or authorize the prepared alternative; sign in to the Apple account and personally complete required agreements/identity/payment steps. Once a build and app record are ready, the owner-test route is **App Store Connect → Apps → [app] → TestFlight → + beside Internal Testing → name group → Create → Add Builds → choose build → Next → enter What to Test → Add**. Choose **Invite Testers** for eligible existing App Store Connect users, select the owner/tester and **Add**. On the iPhone, open the invitation with TestFlight and install the build. Use external testing and its required review for public volunteers; do not grant them console roles merely to use internal testing. [Apple's internal testing instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/) supply the current labels.

**Resume evidence:** Signed install plus actual iOS device matrix. Exact account enrollment, signing and external-review steps are prepared against the selected account when this phase is reached; they are not represented as completed now.

### H7 — Real testers and field alpha: Phase 18

**Codex first:** Finish Phase 17, prepare invitation text, test builds, privacy/risk explanation, role scenarios, feedback capture and support. The owner decides the recipients and authorizes sending invitations; Codex must not independently message people.

**You:** Recruit available adults for the approved pilot and schedule the field sessions. For the Android closed-test route, after Codex prepares the app/release: **Play Console → [app] → Test and release → Testing → Closed testing → Manage track → Testers → Create email list** → add list name and participating Google-account emails → **Save changes → Create**. Select the list, supply the prepared feedback contact and save; copy the shareable opt-in link and send it to the agreed testers. Each tester opens the link with the listed Google account, joins and installs the build. Existing internal tests are suitable for a smaller development group; do not confuse that track's capacity with the project's later 200-account cohort. Revalidate any current production-access prerequisites against the actual developer account. [Google's testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en) supply the current console path.

**Resume evidence:** Real observed civilian/combat/crafting/commerce/return sessions and resolved alpha findings. Recruiting people and allowing time for return behavior cannot be replaced with automated load tests.

### H8 — Ownership, paid production and public release: Phase 19

**Codex first:** Prepare a reviewable production bill of materials/cost ceiling, account inventory, selected commercial hosting, privacy/data-flow information, retention/deletion implementation, store forms/assets, draft user documents, support contacts, restore evidence, migration/rollback and proposed cohort/territories. Existing Vercel development hosting does not establish commercial hosting authorization.

**You:** Review the supplied decision sheet; enter the actual owner/entity/contact details; obtain any needed legal advice; approve the budget, regions and operating responsibilities. Personally complete account-owner identity, tax, agreements and billing flows using the verified links and labels supplied then. Review the exact candidate build and rollout, and explicitly authorize release before Codex performs publishing actions. A final authorized submission may then be automated where supported; you need not repeat every technical deployment click.

**Resume evidence:** Required ownership/service/store/legal decisions resolved, covered incident/support operation, release tests accepted and explicit rollout authorization. No exact tax/identity click sequence is promised before the owner type, jurisdiction and account state are known; Codex must provide that specific sequence at the gate, not ask you to discover it.

### H9–H10 — Later commerce and living-world prerequisites: Phases 20–21

**H9:** Before paid cosmetics or new territories, Codex prepares the processor/store configuration, verified entitlement/refund tests, regional operating requirements and reviewable costs. You complete account-owner payment/tax/identity steps and approve launch of the named products/regions. Cosmetic purchases must never grant gameplay power.

**H10:** Institutions wait for a real eligible population and functioning moderation/appeals. You confirm rollout readiness and operational ownership from the prepared evidence. Players perform their own membership/election actions through the implemented screens. Codex neither invents participants nor appoints itself/player officials as operators. Exact owner actions are supplied with the actual build and governance proposal.

## 5. Execution, verification and completion rules

- **Preserve the game:** civilian participation; one living character; hidden earned awakening; real proximity; permanent death; private history/location; collective ownership; cosmetic-only monetization. Life, awakening, presence, visibility and standing remain separate. Ordinary offline characters are sheltered; committed danger persists through disconnect. No offline mutation replay.
- **Preserve architecture:** React/TypeScript player and separate operator; Fastify domain services shared by API and worker; PostgreSQL with one canonical migration history; versioned public REST/contracts. Add character/profile, inventory/wallet/receipts, quests, geography/NPC/board and encounter interfaces as their phases require. Public clients import only contracts/client/UI. Hidden rules and exact location never enter public assets, logs or contracts. No extra migration runner or speculative framework.
- **Authorize at commit:** recheck current actor/life/permissions/ownership/quantity/location/version in the committing transaction. Maintain receipts, provenance, rule versions and idempotent consumers. Integer currency journals and item conservation are required. No client-controlled damage, rewards, deadlines or proximity authority.
- **Quality workflow:** understand original intent → inspect comparable code → derive observable criteria → route/design → implement → self-review → behavioral verification → independent Sol review against the original request → repair substantive findings → rerun relevant checks. GPT-6 Luna handles bounded evidence/routine work; GPT-5.6 Sol handles focused frontend/design work; GPT-6 Sol handles product integration and difficult interpretation; the Astra High parent delegates deeper reasoning with evidence. Never invoke Ultra automatically. After two materially different failed fixes, investigate/escalate instead of guessing.
- **Documentation:** use Context7 when installed-version external API behavior materially affects correctness; determine versions first, resolve the library then query a precise question, reuse retrieved documentation, and use official primary documentation if no matching source exists. No redundant lookups for internal logic or repository exploration.
- **Task closure:** record implemented, tested, simulated and unavailable behavior separately in the ledger and evidence. Report immediately when an entire phase passes, and report completed phases/current task/next steps at every stopping point. Preserve unrelated changes. Shared contracts and migrations have one integration owner; parallel tasks must not compete for them.
- **Git and services:** use existing authorized branch/deployment scope; preserve user changes and prepare concrete artifacts before requesting genuinely missing authority. No new paid spend, public release, destructive reset, history rewrite or blanket approval from this planning document alone.

First-goal checks include real accounts and recovery/MFA; concurrent living-character creation; privacy/observer denial; inventory and journal conservation; reservation expiry/rollback; duplicate quest/reward handling; stale/noisy/denied location; exclusion of production simulator authority; legal/illegal tactical actions; rescue/death cutoff; lost-response recovery; disconnect/restart and persisted outcomes. Use real PostgreSQL concurrency, not two sequential mocked requests. Verify server bundles, public bundles and operator boundaries.

Run focused checks first, then the applicable integration/browser suites, `pnpm verify` and formatting checks. Compilation alone never proves authentication, saved property, proximity or gameplay. Provide fresh evidence for affected behavior; no need to rerun unrelated expensive checks after a documentation-only correction.

Later release hardening owns the full applicable acceptance matrix, fault/restore/abuse/mobile tests and measured targets: up to 200 invited accounts and 100 concurrent users; ordinary API p95 below 500 ms excluding external providers; consequential commands p95 below 1 s excluding documented contention; realtime delivery p95 below 1 s after commit; reconnect below 5 s; 99% of nonlethal jobs within 30 s of due time under normal operation; tactical deadlines p99 within 2 s; zero unexplained economic discrepancy; restore within 2 h; planned recovery-point objective 5 min; 99.5% monthly availability. These are targets, not present achievements or promises for the prototype. A28's full elected-office behavior belongs to Phase 21; pre-institution releases must still prove that all existing player/guild roles lack operator authority, and must label unreleased coverage accurately.

## 6. Ready-to-use /goal

Click this project's task composer, enter `/goal`, and submit the following objective using the command UI. Keep the detailed instructions in this document rather than pasting the entire roadmap. The goal should be started in execution mode; this document by itself does not start it. The official [Goal mode guide](https://learn.chatgpt.com/docs/long-running-work) describes goal text as the task's outcome/completion criteria and provides pause/resume/edit/clear controls in the progress row.

```text
Complete Hunter World's first playable prototype through Phase 6 in C:/Users/aldwi/Documents/ChatGPT/Project Gate.

Read docs/plans/project-roadmap-and-goal.md, AGENTS.md, the canonical brief, master blueprint, task ledger and current verification evidence. Finish all 37 unfinished tasks in Phases 2–6 in dependency order, beginning with Task 2.1. Preserve completed Phases 0–1 and unrelated user changes. Do not advance character work before recovery MFA, the fresh deployed recovery journey and the real operator TOTP journey pass.

Deliver one persistent unawakened character, System/ID/privacy, reliable inventory and integer-journal currency, quests/achievements/rewards, reviewed geography/NPC/civilian onboarding/board, Android physical-device proof, and a complete persisted solo Gate encounter with reconnect, extraction and private-test consequences. Meet each phase's acceptance criteria; keep public lethal play disabled. Do not expand into Phases 7–21.

Implement, behaviorally verify, obtain independent Sol review against the original request, repair substantive findings and rerun relevant checks. Follow configured model routing and the conditional Context7 policy. Never invoke Ultra automatically. Use existing authorized development access; follow the project's git/deployment authorization and request only genuinely missing authority after preparing the reviewable changes. Do not initiate new spending or public release.

At manual gates H0–H5, finish independent preparation, state the exact blocked task, give the current URL and click-by-click steps, expected result and resume instruction, then await the required human action without fabricating evidence or marking completion. Keep credentials private. Continue independent work where dependencies allow.

Maintain the numbered ledger, verification evidence and continuity notes. Report every fully accepted phase and every stopping point. Finish only when the civilian loop and solo encounter work against real persisted state, Android and affected automated checks pass, substantive review findings are repaired, and a working browser preview plus device instructions and honest remaining limitations are delivered.
```

Goal mode cannot supply missing people, private inbox access, hardware, provider approvals or unlimited runtime. Keep the workspace available; if interrupted, resume this task using the saved ledger/evidence rather than restarting completed work. Later milestones should receive their own bounded goals after this prototype is accepted.
