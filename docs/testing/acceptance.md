# Canonical acceptance scenarios

Source: Brief §27. Every scenario is **not-run** against product behavior; documentation or scaffold checks do not count as passing it. Use independent authenticated accounts and a real disposable PostgreSQL database when the behavior is implemented. Record command, revision, environment, fixtures, assertions, artifacts and result when run. For races use real simultaneous commands and check durable state, not just HTTP responses. Simulation must be labeled and does not replace real-device acceptance.

## A01 — New account creates a character

- Status: **not-run**
- Owner: identity; phases: 2,5.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: new account creates a character.
- Then: It starts unawakened, receives an identity, and can use civilian services.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A02 — Same account requests another living character

- Status: **not-run**
- Owner: lifecycle; phases: 2.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: same account requests another living character.
- Then: The request fails without creating a duplicate. Include concurrent requests and an incapacitated existing character.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A03 — Unawakened player enters an eligible difficult gate

- Status: **not-run**
- Owner: encounters; phases: 6.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: unawakened player enters an eligible difficult gate.
- Then: Clear risk is shown; entry can proceed; normal consequences apply. Rank alone is not an entry ban.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A04 — Eligible awakening trigger is retried

- Status: **not-run**
- Owner: progression; phases: 7.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: eligible awakening trigger is retried.
- Then: One recorded outcome and one grant; no reroll, including a lost response.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A05 — Healer completes a role-specific assessment

- Status: **not-run**
- Owner: progression; phases: 7.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: healer completes a role-specific assessment.
- Then: Certification reflects the assessment, not a damage-only threshold.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A06 — QR card is scanned by another player

- Status: **not-run**
- Owner: identity; phases: 2.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: qR card is scanned by another player.
- Then: Only permitted public data and invitation actions are available; no automatic trade authorization.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A07 — Two buyers attempt to purchase one item

- Status: **not-run**
- Owner: economy; phases: 10,12.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: two buyers attempt to purchase one item.
- Then: At most one succeeds; the other receives a clear updated result; ledger and inventory reconcile.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A08 — A direct-trade offer changes after confirmation

- Status: **not-run**
- Owner: economy; phases: 10.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: a direct-trade offer changes after confirmation.
- Then: Prior acceptances clear; both players must confirm the new version.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A09 — Local shopper leaves the radius before settlement

- Status: **not-run**
- Owner: world/economy; phases: 10,12.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: local shopper leaves the radius before settlement.
- Then: The transaction does not bypass the physical proximity rule.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A10 — Virtual evacuation ends at a distant hub

- Status: **not-run**
- Owner: world; phases: 12,14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: virtual evacuation ends at a distant hub.
- Then: The character is sheltered but cannot browse that hub’s local inventory remotely.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A11 — World Exchange order completes while buyer is offline

- Status: **not-run**
- Owner: economy; phases: 12.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: world Exchange order completes while buyer is offline.
- Then: Goods arrive once in the intended storage without real-world collection travel.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A12 — Purchased shipment contains an acceleration item

- Status: **not-run**
- Owner: economy; phases: 12.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: purchased shipment contains an acceleration item.
- Then: That item cannot accelerate its own arrival before it is owned and usable.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A13 — Crafting completion is delivered twice

- Status: **not-run**
- Owner: economy; phases: 9.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: crafting completion is delivered twice.
- Then: Exactly one permitted output and one settlement occur.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A14 — Quest reward is worldwide unique and two players qualify

- Status: **not-run**
- Owner: progression; phases: 4,15.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: quest reward is worldwide unique and two players qualify.
- Then: The predeclared selection rule grants only the permitted supply, including simultaneous claims.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A15 — Innocent character is reported or given a user bounty

- Status: **not-run**
- Owner: society/encounters; phases: 11,14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: innocent character is reported or given a user bounty.
- Then: No automatic guilt, location reveal, or Blood Debt exemption follows.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A16 — A summon causes an attributable PK

- Status: **not-run**
- Owner: encounters; phases: 14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: a summon causes an attributable PK.
- Then: Responsibility follows the controlling character under the declared rules.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A17 — Defensive kill meets verified defense conditions

- Status: **not-run**
- Owner: encounters; phases: 14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: defensive kill meets verified defense conditions.
- Then: The appropriate reduced or zero Blood Debt result is recorded from reliable events.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A18 — Character crosses a fatal Blood Debt threshold

- Status: **not-run**
- Owner: encounters/lifecycle; phases: 14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: character crosses a fatal Blood Debt threshold.
- Then: The disclosed rule finalizes the correct death once, even on replay.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A19 — Character dies with a funded order and guild equipment

- Status: **not-run**
- Owner: lifecycle/economy; phases: 13.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: character dies with a funded order and guild equipment.
- Then: Estate settlement honors the order; collective ownership remains intact.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A20 — Dead character’s old post is opened

- Status: **not-run**
- Owner: society; phases: 13.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: dead character’s old post is opened.
- Then: Original permitted history remains; no new private dossier appears.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A21 — Player reinstalls or changes device time during cooldown

- Status: **not-run**
- Owner: lifecycle; phases: 13.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: player reinstalls or changes device time during cooldown.
- Then: Server eligibility remains unchanged for that account.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A22 — Offline civilian’s last location lies in a new invasion

- Status: **not-run**
- Owner: world/encounters; phases: 14.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: offline civilian’s last location lies in a new invasion.
- Then: No newly lethal exposure is created solely from that location.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A23 — Client loses a response after a successful trade

- Status: **not-run**
- Owner: economy; phases: 10.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: client loses a response after a successful trade.
- Then: Reconnect retrieves the same receipt without repeating the exchange.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A24 — A service-wide failure interrupts lethal resolution

- Status: **not-run**
- Owner: operations; phases: 8,14,17.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: a service-wide failure interrupts lethal resolution.
- Then: The documented freeze or audited recovery policy applies consistently; no lethal catch-up against unattended players.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A25 — Guild or market founder dies

- Status: **not-run**
- Owner: society/economy; phases: 11,13.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: guild or market founder dies.
- Then: Succession and custody rules execute without deleting collective work.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A26 — A news template processes an achievement twice

- Status: **not-run**
- Owner: society; phases: 11.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: a news template processes an achievement twice.
- Then: No duplicate bulletin or invented public fact is created.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A27 — Cooldown expires

- Status: **not-run**
- Owner: lifecycle; phases: 13.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: cooldown expires.
- Then: A new unawakened identity may be created; the previous one stays dead and carries no new authority.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

## A28 — A player officer requests operator-only data

- Status: **not-run**
- Owner: operations/society; phases: 17,21.
- Given: isolated fixtures satisfying the scenario’s eligibility and declared content/rule versions.
- When: a player officer requests operator-only data.
- Then: Permission is denied and the attempt is recorded appropriately.
- Evidence: none yet; preserve authoritative records and user-visible result on execution.

Exploratory release checks: sparse/inaccessible venues; real GPS uncertainty and denial/revocation; weak devices, text scaling, screen readers, sunlight, muted/reduced-motion use; honest reconnect and evasion; economic collusion; civilian-only journeys. Every death case also checks authority, estate, cooldown, collective property and history.
