# Internal canonical brief transcription

Source: `C:/Users/aldwi/Downloads/Hunter-World-Final-App-Concept-and-Development-Brief.pdf`, consolidated edition 1.0, 11 September 2026, 40 pages. Extracted text is an internal reference; PDF tables may wrap. The PDF remains canonical. This document and hidden-rule material must not be bundled or published to player clients.

SECTION 01
How to use this brief
Authority and scope
The owner's latest instructions take precedence. This document consolidates them into one
internally connected baseline. Earlier suggestions that conflict with later requirements have been
reconciled explicitly: character creation no longer assigns a combat class; the one-character rule
means one living character at a time; remote commerce complements proximity markets; and a
dead character cannot return as an active participant after the cooldown.
Core rules are product commitments to preserve during planning. Planning defaults make a
prototype concrete and may be adjusted with evidence. Content examples demonstrate the
intended experience and do not constitute a completed class, item, or story catalog. Later
features are part of the final vision but must not be represented as functioning in an earlier
release.
The initial project is a multiplayer game with ongoing operations, rather than a static profile app.
A browser build is a useful first development surface. The mobile release must be tested on real
devices for GPS, permissions, reconnects, notifications, battery use, and proximity interactions.
What Astra should do next
Read the complete brief, derive a requirements backlog, and map dependencies before
implementing game systems. Preserve a versioned game bible and decision log so development
does not depend on remembering a long chat. Choose the stack and launch region during
technical planning, using the decision defaults in Section 30. Implement a small complete
experience, verify it with separate accounts, and expand through the release gates in Section 28.
Astra may resolve routine implementation choices within this baseline. Changes to permanent
death, proximity access, hidden awakening, player freedom, ownership, or monetization must be
called out as product changes. Keep developer-only rules and secret content out of public clients,
public documentation, and forum templates.

SECTION 02
Product identity and player experience
The world people enter
The app overlays a fictional modern hunter society on real geography. Gates, guild locations,
markets, NPC encounters, public gathering places, and eligible nearby players appear on the
map. Gate combat opens a separate illustrated game environment. No camera view or
augmented reality is required.
The player has a personal System panel, a recognizable character identity, and a history that
other players can encounter through legitimate in-world records. The emotional goals are
wonder, anticipation, recognition, danger, pride, cooperation, and the possibility of becoming
exceptional. Everyday participation must still be rewarding for people who never lead a
leaderboard.
The setting uses original lore, names, imagery, sounds, and characters. Solo Leveling and similar
LitRPG stories describe the desired feeling of awakening and recognition; they are references for
experience, not a supplied license or an instruction to reproduce an existing franchise.
Design principles

- A lasting life: one active identity accumulates achievements, relationships, discoveries, and
  consequences.
- Civilian belonging: unawakened people can earn, contribute, organize, and take risks from
  the beginning.
- Earned distinction: rank, rare paths, and significant titles reflect recorded accomplishments.

- Geography with purpose: exploration, encounters, local trade, and gatherings make places
  meaningful.
- Agency with understandable consequences: players can make dangerous decisions,
  including hostile ones, within explicit game rules.
- A world with evidence: public knowledge comes from records, reports, observation, and
  shared discoveries.
- Reliable ownership: combat, trades, rewards, and death follow server rules that can be
  audited and tested.
- Manageable participation: ordinary offline characters are sheltered; daily attendance is not
  required to avoid spontaneous death.
  Ordinary and extraordinary players
  Local recognition, guild service, rescue work, valuable reports, craftsmanship, and commercial
  reliability offer alternatives to raw combat power. Exceptional hunters can become famous
  without making everyone else irrelevant. New arrivals need attainable opportunities even after
  the first generation has accumulated wealth and discoveries.

SECTION 03
Core loops and first-session journey
Interlocking loops
Loop
Actions
Meaningful return
Hunter
Prepare, scout, enter a gate, fight, extract,
improve a build
Loot, mastery, assessment
eligibility, discoveries
Civilian
Gather information, complete work, supply
others, report events
Income, professional growth,
community relevance
Craftsperson
Acquire materials, learn recipes, fulfill
commissions, refine techniques
Demand for distinctive work and
access to advanced production
Merchant
Source goods, open a stall, fulfill orders,
operate a market
Commercial standing and
relationships
Guild
Recruit, prepare expeditions, share resources,
complete projects
Collective identity, capability, and
recorded achievements
Explorer
Investigate rumors, compare reports, find
NPCs or unusual gates
Knowledge, hidden quests, rare
opportunities
First session
The player creates an unawakened character, receives a civilian identity view, and learns the
System panel. A short orientation introduces a reliable public hub, an ordinary NPC, public
forums, available work, and map controls. The player can complete a low-risk information or
supply task and receive a useful item or earned currency.
The first gate offers a clear danger assessment, preparation options, and a retreat explanation.
Entering is a deliberate choice. A player may remain outside, join a willing party, or attempt entry
with available tools. The introduction must demonstrate civilian participation even when the
player does not awaken immediately.
A controlled awakening route is available through early play, but its internal requirements are not
shown as a formula. The experience should suggest that unusual possibilities exist without
promising a rare class. The first session should end with an understandable next objective and a
reason to encounter another player.
Session lengths
Planning targets are roughly 2-5 minutes for a compact solo encounter and 10-15 minutes for a
substantial party expedition. These are tuning targets, not guaranteed lengths. Traders, crafters,
and forum participants must also have useful short sessions. A gate's estimated duration and
ongoing exposure rules are shown before commitment.

SECTION 04
Identity, account, and character lifecycle
One living character
An account can have one living character at a time. A character has a stable internal ID, a public
alias, an appearance, an origin date, recorded achievements, and configurable public
information. Accounts and characters are separate records: the account manages access and
purchases; the character owns its in-world life and standing.
The intended rule is one living character per real player. Account enforcement and anti-evasion
measures support that rule, but no claim of perfect person identification should be made.
Ordinary character death is not a reason to lock unrelated functions of a player's device.
Independent states
Dimension
States or values
Consequence
Life
Alive, incapacitated, permanently
dead
Determines whether that character can
act or be rescued
Awakening
Unawakened, awakened, later
transformations
Determines access to innate mana and
class capabilities
Presence
Sheltered, active field, committed
encounter, disconnect recovery
Determines current exposure and
permitted interactions
Account entry
Eligible, active-character
occupied, death cooldown
Controls creation of a new living character
Public standing
Rank, professional credentials,
titles, leaderboard position
Communicates different earned aspects of
the character
Do not collapse these dimensions into one status. An unawakened craftsperson can be
influential, an S-rank hunter can be incapacitated, and a dead character can retain an archived
title without retaining authority to act.
Character continuity
Build experimentation and skill resets are permitted within defined progression rules. Rare
transformations require their own content and eligibility. A reset cannot manufacture an
awakening, remove Blood Debt, erase a death, or turn the character into an unrelated second
identity. Account cosmetics may survive death; character power and wealth do not automatically
transfer to the next life.

SECTION 05
Civilian life and access rules
What unawakened characters can do
Unawakened players can use public markets and forums, take civilian contracts, trade, study,
gather eligible materials, craft within their training and equipment limits, and publish gate or
event reports. They can perform reconnaissance, carry supplies, provide ordinary first aid, and
accompany a party that accepts them.
They may join guilds according to guild policy. A non-combat founding route lets qualified
organizers or merchants establish guilds. Hunter-exclusive contracts, channels, offices, or
equipment still enforce their own stated requirements. Profession-specific access can be earned
without hunter status.
Dangerous entry
Hunter rank is generally a recommendation and certification, not a universal gate-entry
prohibition. A low-powered or unawakened character can attempt a dangerous gate if its actual
entry conditions are satisfied. Keys, capacity, special seals, or an event's explicit rules can still
restrict access. A guild's refusal to admit someone to its expedition does not become a universal
ban on that person exploring independently.
The entry view describes known threats, estimated power demands, party composition, time
commitment, and death exposure. Unknown properties remain unknown. Consuming a charged
item may allow an unawakened character to use a stored effect; it does not silently grant an
awakened mana pool.
Information as contribution
Reports identify the author's observations, time, approximate in-world location, and any attached
evidence. An unverified report remains a claim. System-confirmed encounter facts can be
attached without revealing secret algorithms or another player's private data. Useful reporting
can earn contract rewards and professional standing when verified, with controls against
repetitive low-value submissions and collusive reward farming.

SECTION 06
The System panel and fullscreen identity
Primary screens
Surface
Essential content
Main actions
System
Character, current condition, active objectives,
build, recent changes
Inspect status, manage
equipment, open quests
Map
Gates, hubs, markets, eligible NPCs and opted-in
presence
Inspect, travel safely,
enter, assemble, evacuate
Activity
Encounter state, preparation, combat, extraction,
rescue
Act, use items, cooperate,
withdraw
Community
Public boards, guild spaces, recruitment, reports,
news
Read, post, recruit, submit
evidence
Inventory and
commerce
Owned items, orders, crafting jobs, stall controls
Equip, craft, trade, sell,
receive
Use a persistent quick-access control for the body-status panel and the ID card. The exact
navigation layout can be refined through usability testing, but these functions must not be buried
behind several menus.
Identity card
Before awakening, the card shows the character's registered identity and relevant civilian or
professional credentials. After awakening it can display hunter rank, class visibility, guild crest,
selected title, and verified highlights. The owner chooses whether to disclose subclass,
equipment details, exact statistics, or a broader achievement history.
Fullscreen mode is readable at arm's length, with a distinctive rank presentation and a QR code
for a limited public profile, friend request, party invitation, or trade invitation. QR possession does
not authorize a trade or disclose private data. A saved image is a snapshot; current eligibility and
transaction authority require a fresh server check.
Character body status
Display current and maximum HP, usable MP or Dormant, stamina, injuries, poison, bleeding,
impairments, temporary buffs, and relevant encounter or evacuation states. These are fictional
character conditions. Color is reinforced by labels and icons. Critical information remains
readable with animation reduced and sound disabled.
Promotions and major awakenings receive a short visual, audio, and haptic presentation. Routine
notifications remain restrained so significant moments retain impact.

SECTION 07
Map, presence, and geography
Discoverable places
The map supports gates, public hubs, markets, guild gathering locations, event zones, and
eligible NPC encounters. Filters distinguish risk, content type, access requirements, and
availability. The map should remain usable in areas with fewer players, with a minimum supply of
appropriate encounters and access to useful solo or remote activities.
Public gathering places and commercial locations must be suitable for intended access. Reported
inaccessible or inappropriate locations can be reviewed, moved, or disabled. Opening hours and
access boundaries matter. A market or guild marker does not grant permission to enter private
property.
Player visibility
Public presence is off by default. Players choose to appear for assembling, social discovery, or an
active personal stall. Broader discovery uses approximate areas; encounter membership can
expose the character identities needed for the game. The app must not offer an unrestricted
history of another person's exact movements.
Trade presence and hostile encounter eligibility are separate permissions. Showing a stall does
not make its warded trading area a combat arena. A public alias in a raid or a PK report is not
permission to reveal that player's real address or travel trail.
Proximity and virtual movement
Physical proximity determines access to local catalogs and transactions. A planning default is
approximately 100 meters for a direct trade and 150 meters for a local market, adjusted after
GPS and access testing. Exact values are configuration, not fixed lore. Significant uncertainty in a
location fix should produce an explanation and retry path rather than an accusation of cheating.
The character's virtual encounter position is distinct from the phone's physical location.
Emergency evacuation and combat movement occur inside game rules. Virtual arrival at a hub
never grants physical browsing or collection rights there. After shelter, returning to active field
play uses the current validated physical area and a defined entry state.

SECTION 08
Gates, encounters, and combat
Gate families
Family
Experience
Key requirements
Standard
Solo or small-party dungeon with a
clear objective
Preparation, tactical choices, reliable
extraction rules
Unstable
Changing conditions, alternative
routes, optional risks
Communicated instability and recorded state
changes
Raid
Coordinated multi-role expedition
and boss phases
Party readiness, contribution credit,
reconnect handling
Invasion
Shared defense and evacuation
after a break
Regional objectives, civilian actions, bounded
exposure
Hidden
Rare access or discovery tied to
eligible conditions
Secret content protected by server eligibility
A gate moves through announced or discovered, open, active, resolved or expired, and possibly
breach states. Party instances and regional event state are separate: completing one instance
must not accidentally resolve the world event for everyone unless that event is designed for a
single shared outcome.
Combat baseline
The recommended first implementation is tactical turn-based combat with illustrated enemies,
clear ability effects, and cinematic presentation for major actions. Players choose targets, skills,
items, defensive actions, and withdrawal attempts. Party play uses bounded decision rounds,
with an explicit fallback action for an absent participant.
Roles contribute through damage, healing, protection, interruption, control, resource
management, and information. Boss phases should create decisions, not merely larger health
totals. Expected action timing, round deadlines, damage curves, and resource costs are tuning
work for the combat prototype.
Equipment and consumables allow preparation to matter. Do not equate buying a high-rank
weapon with automatically mastering it. Encounter rewards credit useful support and eligible
objectives, not just the final hit. Reward and loot rules are visible before joining; personal drops
and explicitly declared shared objectives avoid an uncontrolled last-hit economy.
Commitment and extraction
Players receive a preparation and readiness stage. A committed dangerous encounter cannot be
abandoned instantly by closing the app. Retreat is a game action with known conditions and
possible costs. Critical state changes, rewards, extraction, injuries, and deaths are finalized once
by the server and remain consistent after reconnecting.

SECTION 09
Awakening, classes, and advancement
Separate kinds of progress
Progression
Meaning
Level
Ongoing experience and growth within the progression model
Hunter rank, E through S
initially
Certification earned through role-appropriate assessments
Class and subclass
How the character channels power and contributes
Class rarity
Unusual capabilities and difficulty of accessing a path
Professional credentials
Crafting, trading, research, or organizational qualifications
Ranker standing
Seasonal position in local, regional, or global competition
A common path can develop into an exceptional character. Permanent rank belongs to that living
character, while seasonal leaderboards can reset without erasing its life history. Assessments
must recognize protection, healing, and control as well as damage. Above-S categories should
only be added when content and balance justify them.
Hidden awakening engine
Awakening is evaluated by server-side rules using recorded quests, achievements, acquired
items, qualifying actions, and world conditions. Each route has prerequisites, a trigger, eligibility
exclusions, an outcome definition, and a version. Some eligible routes are deterministic; others
use a recorded random outcome. Repeat requests cannot reroll the same event.
The exact formula remains developer-only. Players encounter clues and can infer patterns
through experience and community research. Secret requirements must remain consistent
enough that discovery is meaningful. Store the rule version and qualifying evidence privately so a
result can be investigated without publishing its recipe.
Ordinary awakening has multiple dependable internal routes. Rare or mythic opportunities can
demand much more unusual combinations. A bought catalyst can satisfy acquisition criteria, but
cannot replace separate personal requirements. No premium purchase directly grants an
awakening or improves a rare awakening lottery.
Class content strategy
The initial awakened archetypes are Warrior, Mage, Ranger, Assassin, Guardian, and Healer. A
modest number of distinct specializations establishes real variety before the catalog expands.
Content examples include Guardian to Runebastion, emphasizing protective formations and
redirected attacks, and Mage to Starcaller, using delayed celestial attacks and gravity effects.
Professional awakening paths, including advanced smithing, alchemy, and artificing, expand the
catalog later. Every class definition needs a purpose, usable actions, resource model, strengths,
limitations, growth route, and party contribution. Legendary and mythic labels require distinctive
play, rather than only stronger numbers.
Rare one-time discoveries can award unique titles, appearances, artifacts, or limited paths.
Essential roles and basic progression remain obtainable through other routes. Build resets cannot
bypass class eligibility or manufacture completed hidden quests.

SECTION 10
Items, crafting, and professions
Item structure
Each item has a stable definition for rank, rarity, effects, eligibility, trade policy, condition, and
provenance. Individual items have instance IDs; stacks have auditable quantities. Unique
artifacts have explicit supply limits.
Rank measures power or handling demands. Rarity measures scarcity and unusual function. A
D-rank legendary tool can offer a distinctive benefit without being stronger in every respect than
A-rank ordinary equipment. Detailed balance must prevent rarity labels from becoming
misleading decoration.
Equipping, consuming, listing, shipping, crafting with, lending, and dropping an item are
controlled transitions. The same instance or units cannot occupy incompatible states at once. A
charged artifact can provide an effect to an unawakened user when its definition allows it; the
artifact supplies the energy.
Professional families
Profession
Products and services
Advanced possibilities
Medicine and healer
craft
First aid, antidotes, restorative
preparations
Recovery support, protective
preparations, specialized stabilizers
Blacksmithing
Weapons, armor, repairs,
modifications
Advanced forging,
enchantment-compatible equipment
Alchemy
Refined monster materials, reagents,
consumables
Catalysts and unusual effects
Artificing
Charged tools, detectors, specialist
equipment
Spatial devices and sophisticated
utility gear
Scribing and
research
Scrolls, seals, maps, verified records
Rare diagrams, research discoveries,
high-value intelligence
Professions can begin before awakening. Advanced effects depend on training, recipes,
materials, tools, facilities, and sometimes compatible classes. A character can retain its combat
identity while developing a commercial or crafting career.
Crafting and commissions
A recipe specifies ingredients, qualifications, duration, outputs, possible quality variations, and
any disclosed failure risk. Starting a job reserves or consumes ingredients according to the
recipe; retrying a request cannot create another output. The player can inspect completion and
delivery status after reconnecting.
Commissions specify the exact product, allowed quality range, supplied materials, fee, deadline,
and cancellation rules. Escrow holds payment and materials. An output must meet the agreed
specification before payment is released. Vague text promises are insufficient for automatic
settlement.
Crafting consumes materials. Consumables, repairs, and specialization sustain demand. Item
histories can credit crafters and verified origins without revealing private location trails or hidden
quest conditions.

SECTION 11
Direct trading and personal stalls
Direct exchange
Two living, eligible characters establish a nearby trade session. A Hunter ID QR scan can initiate
the invitation, but both parties accept independently. Offers may contain eligible items, earned
currency, or both. The interface shows names, quantities, ranks, conditions, restrictions, and the
complete exchange before confirmation.
Any edit clears prior confirmations. Final settlement rechecks ownership, eligibility, proximity,
balances, and the unchanged offer version. Both sides transfer together or neither does. A
timeout, death, cancellation, or failed eligibility check releases reservations without duplicating
or destroying goods.
The server supplies a receipt to both players. Avoid item-dropping as the standard trade method.
Historical price information can inform a decision, but the game does not guarantee that every
negotiated price is objectively fair.
Temporary solo stall
A player explicitly opens a stall in an eligible area. They select inventory, fixed prices, accepted
barter interests, and a brief description. Nearby users can inspect the permitted catalog while the
seller remains in the trading session. The stall closes when the seller ends it, leaves the allowed
area, or becomes ineligible.
Fixed-price purchases can settle automatically from reserved inventory. Barter requires an
accepted final offer. Public stall presence exposes only the information needed to find and
interact with that stall. It does not publish the seller's movements after the stall closes.
Safeguards and edge cases
Reserve a chosen listing briefly during checkout and return it when checkout expires. Revalidate
location at settlement, with sensible handling of GPS uncertainty. Previously seen screenshots
cannot be made secret again; proximity controls govern fresh access and transaction eligibility. A
report about a trade opens an evidence process and does not let the reporter seize property.

SECTION 12
Registered local markets
Founding and operation
A qualified player or guild can establish a named market at a suitable public location. A solo
owner may operate it and may invite other vendors. The founding route includes a Merchant
License quest, completed commercial contracts, an earned-currency registration cost, an eligible
location, and active stock. Size and capacity increase through commercial achievements and
maintained activity.
Market eligibility is independent of being a powerful hunter. The owner can choose branding,
specialties, operating hours, vendor admission, and a bounded commission schedule. Material
fees and policies are displayed before a vendor deposits goods. Owner changes cannot
retroactively rewrite a transaction that has already been accepted.
From outside the interaction area, users see the name, crest, opening times, vendor count, and
broad specialties. Full local listings, current prices, purchasing, and barter unlock nearby. Remote
search cannot silently reveal the complete local catalog.
Deposited inventory
Vendors deposit listed goods into market custody. Fixed-price sales can occur while the vendor is
offline; the buyer must still be physically present. Barter proposals wait for the seller's response,
and the buyer must be eligible and nearby at final settlement. Proposed goods remain
unavailable for conflicting uses while reserved.
Listings can be withdrawn only when no accepted order or active reservation prevents it. A
market owner cannot confiscate vendor goods as an administrative action. Closure, suspension,
or owner death returns uncommitted stock through a defined storage channel, while settled
obligations remain intact.
Why players visit
Local markets offer immediate access, direct negotiation, local specialties, crafting services, buy
orders, and a social gathering point. Guild procurement contracts can attract suppliers before a
raid. Scheduled fairs and later auctions are expansion content after ordinary trading is reliable.
Auction bidding and collection must retain the access rules advertised for that event.
Markets use warded trading areas. An invasion can suspend access or close a venue, but cannot
create an unannounced duplication, confiscation, or destruction of goods already held in secure
custody.

SECTION 13
World Exchange and delivery
Remote commerce
The World Exchange is an in-world online shop that can be used without visiting a place. A seller
intentionally lists an item there. The buyer sees the exact product, total price, fees, destination,
expected delivery time, and applicable modifiers before accepting. Remote and local listings
share the same ownership ledger; an item cannot be sold through both simultaneously.
The fiction is a courier network connecting storage and commercial hubs. A delivery destination
is fixed at purchase, such as the buyer's registered storage inbox. Moving the phone does not
endlessly reroute the parcel or shorten its agreed trip. Successful delivery makes the item usable
without a required real-world collection journey.
Delivery state and modifiers
Orders move through reserved, paid or funded, in transit, delivered, cancelled or failed under
explicit policies. Funds remain held until the applicable settlement point. Delivery timing can
depend on a virtual route, item handling needs, and known event conditions. Display revised
estimates and a bounded resolution path for service delays.
Earned items or statuses can reduce or bypass transit: charged Spatial Anchors, Courier Pacts, or
earned delivery privileges are examples. Conditions, charges, and cooldowns are explicit.
Eligibility is checked against already owned, usable resources. A bypass item inside the new
shipment cannot be consumed before arrival to accelerate itself.
Instant delivery does not bypass equipment requirements, death, storage capacity rules, or
encounter restrictions on accessing outside supplies. The purchase screen must explain
restrictions that affect immediate usability. Delivery privileges are earned gameplay benefits, not
a premium shortcut to combat power.
Remote barter and exceptional outcomes
Remote barter holds both offers, verifies the unchanged agreement, and creates the paired
delivery obligations together. A partial service failure cannot leave one player with both sides.
Cancellation and compensation use the recorded order state.
If a character dies, incoming goods and held funds follow Section 20. An offline buyer may
receive an ordinary completed order into storage. NPC or player courier fiction must not make
settled player goods disappear through an arbitrary narrative decision. Risky transport, if
introduced later, must be a separately disclosed contract with its own loss and compensation
rules.

SECTION 14
Economic balance and monetization
Earned currency and circulation
Purchases between characters use earned in-game currency. Barter is supported. The baseline
excludes cash-out, real-money player item sales, and purchasable hunter power. Developer
planning must account for currency sources such as contracts and rewards, sinks such as
appropriate service and registration fees, and material consumption through crafting and use.
Market-owner commissions redistribute money and are not automatically a currency sink.
Distinguish transfers from actual removal from circulation. Monitor duplicate rewards, circular
contracts, collusive trades, and NPC buy/sell combinations that create unlimited value without
meaningful cost.
Essential NPC services provide a dependable baseline, particularly in sparse areas. Their prices,
stock rules, and purchasing limits must not erase player specialization or support an unlimited
arbitrage exploit. Avoid forcing geography-exclusive materials to become permanent barriers to
basic progression; use remote trade and alternative sources where appropriate.
Valuable scarcity
Rare artifacts, unusual recipes, exceptional craftsmanship, and verified provenance can carry
prestige. Basic playable roles remain accessible. Acquiring expensive equipment does not
automatically confer a hunter rank or a hidden class. Personal awakenings, certifications, and
character titles are not tradable inventory.
Revenue principles
Acceptable starting products include character appearances, ID themes, guild and market
decorations, and optional System voice or presentation packs. Paid items stay at the account
level where appropriate, so a character death does not erase the customer's unrelated cosmetic
purchase.
Do not sell death-cooldown removal, Blood Debt cleansing, guaranteed rare awakenings, rank
certifications, stronger combat equipment, or paid location advantages. Any future subscription
must be checked against these commitments. Monetization design must be evaluated together
with the economy rather than added after progression is tuned.
Measures to watch
Track currency creation and removal, prices by item family, time to fill orders, local versus
remote trade, failed deliveries, wealth concentration, crafting demand, and new-player
purchasing ability. Interpret price movements against actual game events. Do not mistake
transaction count or manufactured trade volume for a healthy economy.

SECTION 15
Guilds and collective ownership
Founding paths
Guild creation requires an earned charter, a sufficient founding group, and completion of an
organizational challenge. The earlier C-rank hunter plus five founders proposal remains a useful
hunter-route planning default. A parallel civilian route uses professional standing, completed
contracts, and demonstrated organization instead of hunter rank. Exact thresholds are tuning
configuration.
Each guild controls admission within the platform's basic conduct rules. It can welcome
unawakened members, specialize in trade or research, or set requirements for particular
expeditions. Guild membership does not automatically enroll a player in lethal PvP.
Functions
Guilds provide recruitment, role permissions, scheduled expeditions, a private forum, shared
projects, treasury and vault records, optional public headquarters, and an achievement history.
Useful roles include scout, supplier, healer, defender, craftsperson, organizer, and expedition
leader. Members should earn recognition for actual contributions.
Role permissions distinguish inviting, spending, withdrawing, changing policy, declaring an
event, and managing reports. High-value withdrawals and leadership transfers need an explicit,
recorded process. Membership alone is not unrestricted access to shared property.
Competition and continuity
Guild prestige grows through collective accomplishments. Competition must not let the largest
guild permanently lock a region's essential gates or ordinary progression. Contested projects and
later territory features use bounded windows and accessible alternatives.
A public guild marker identifies a suitable meeting location, not a member's home. Guild property
belongs to the organization. Borrowed equipment records ownership and return rules. Founder
death or prolonged absence invokes a configured succession process. A dead founder cannot
continue commanding through archived credentials.
Guilds may investigate accusations and take permitted in-world action. A guild decision does not
authorize account access, private-data disclosure, currency fabrication, or bypassing the game's
PK laws.

SECTION 16
Forums, reporting, news, and sound
Community structure
The Association Board is the thematic public forum surface even before player-run associations
exist. Its early operation is a system-maintained registry and communication service. It must not
imply that a WHA or national government already exists in the launch build.
Boards support general discussion, public reports, recruitment, strategy, commerce notices,
research, and appropriate credential-restricted spaces. Guild forums have their own access
permissions. In-world conversation is encouraged, with clearly accessible out-of-character help
and account support.
Evidence and knowledge
A post can contain observation, opinion, allegation, or attached system evidence. Label those
distinctions. A gate report can include facts the reporter actually encountered. Secret eligibility
and another character's private build are not attached automatically. Archived threads retain
normal visibility and moderation rules after their authors die.
Reports of misconduct create cases for eligible reviewers. They do not automatically punish the
accused, lower the accused's protection under Blood Debt, or authorize a public location reveal.
Player justice and operator moderation use different tools and permissions.
Achievement-driven news
Generate bulletins from recorded qualifying events using controlled templates. Personal
milestones go to friends or guildmates; substantial achievements reach a locality; exceptional
events can reach regional or global audiences. Significant support, rescues, first discoveries, and
civilian contributions count as possible news subjects.
The template references a real event and its eligible participants. It must not invent a victory,
publicize a secret, or describe a player as famous without evidence. Major rank recognition, guild
milestones, market fairs, and gate crises can receive distinctive presentation. Routine posts
should not flood every user's screen.
Notifications
Offer category controls, sound choices, vibration preferences, quiet hours, and a digest option.
Critical fictional status is also visible in-app. Sounds identify the game and must not imitate a real
emergency authority. Push delivery is not a guaranteed survival mechanism; no unattended
character should die merely because a notification was delayed or muted.

SECTION 17
NPCs, hidden quests, and discoveries
NPC roles and placement
NPCs range from ordinary information sources, suppliers, and service providers to rare travelers,
investigators, patrons, and one-time questgivers. They can appear on the map, in an encounter,
or through authored forum posts and replies. An ordinary request can connect to a much larger
opportunity through consistent clues.
Essential services have dependable access and appropriate protection. Killability, disappearance,
and replacement are explicit content properties. If an NPC can permanently die, its quests and
essential functions need a defined consequence or alternative; content must not accidentally
strand every later arrival.
Finite encounters
Each limited NPC or quest declares its scope: once per character, once per group, once per
regional event, or once worldwide. Global uniqueness is a real server constraint, with a recorded
grant. Simultaneous claim attempts must not duplicate a unique reward. The rule governing who
can claim must be determined before the event opens.
Content definitions include spawn conditions, eligible audience, duration, discovery clues,
acceptance conditions, objectives, failure conditions, reward limits, completion channel, and
archival behavior. If a questgiver departs after accepting a commission, the definition states
whether the quest fails, continues through another channel, or uses an escrowed reward.
Mystery without arbitrary outcomes
Players can compare sightings, investigate forum traces, share hypotheses, and miss genuine
opportunities. Hidden quests may grant rare items or classes, while ordinary advancement
remains available through other content. An expired NPC account can stop responding while its
old posts remain as history.
AI-assisted dialogue, if added, is constrained by approved NPC facts and quest state. A language
model cannot invent a tradable item, grant a class, change a probability, or finalize death.
Authoritative game services decide outcomes; authored narrative and optional dialogue describe
them.

SECTION 18
PK, evidence, and the Blood Debt law
Lethal freedom and exposure
Player killing is permitted in declared active risk areas and eligible encounters. Entering those
conditions communicates exposure; the system need not request consent again for every
individual hostile attack. Protected hubs, initial registration spaces, and registered trading areas
use wards that prevent ordinary hostile combat. A guild membership or a forum argument does
not remove those protections.
Ordinary offline or cooldown observers cannot be newly targeted. A committed encounter follows
its published disconnect rules. Hostile targeting uses game encounter presence rather than an
unrestricted tracker of a person's real movements.
The proposed world law
Every human carries a life seal, including the unawakened. Awakening opens the seal to channel
mana. Human seals are linked by an ancient protective covenant. Initiating hostility forms a
connection through which a destroyed human seal can send destructive residue back to the
responsible aggressors. That residue is Blood Debt.
An aggressor temporarily exposes their own protection to the attacked party and legitimate
defenders. This explains why genuine defensive action can produce little or no debt. The
covenant damages a seal; it does not publish accusations, issue bounties, or enforce a country's
changing political rules.

Burden rather than a universal kill count
Factor
Design effect
Unprovoked attributable death
Creates a baseline burden
Large power disparity
Increases the cost of preying on much weaker characters
Repetition within a short period
Increases accumulated strain and slows recovery
Existing seal damage
Reduces remaining capacity
Genuine self-defense or verified
defense
Greatly reduces or removes the burden for that incident
Summons, traps, decisive hostile
assists
Attribute responsibility to the controlling or contributing
character
Player-filed bounty or accusation
Does not itself remove the target's magical protection
Mutually accepted lethal event
Uses separately disclosed participant rules and bounded
modifiers
The initial aggressor and defensive relationships are computed from reliable game events. Intent
is not inferred from a chat accusation. Deliberate hostile assistance can share responsibility; an
unrelated heal or a mere nearby presence must not automatically establish guilt. Disputed cases
require retained evidence. War modifiers cannot turn uninvolved civilians into unrestricted
targets.
Consequences
Accumulating debt impairs recovery, reduces usable mana, and destabilizes abilities. Near the
limit, the character sees a Seal Fracture warning. Crossing the lethal threshold through further
qualifying action can cause permanent death. Strong characters do not receive an effectively
unlimited allowance to kill weaker ones.
Healers can stabilize damage; recovery takes time and appropriate effort. A repeatable cheap
item or premium purchase cannot erase the system. The exact thresholds are balance
configuration, but a player must understand when another qualifying killing action risks fatal
fracture.
Blood Debt is primarily a private condition. Specialized detection or legitimate evidence can
expose relevant information. Witness reports, guild pursuit, bounties, and later association cases
create public consequences only when people act. Operator intervention for exploits and real
harassment remains separate from lawful in-game hostility.

SECTION 19
Gate breaks, invasions, and rescue
Event lifecycle
A regional event can progress through warning, emergence, active threat, containment, and
recovery. The map displays the affected game area, available shelters, known routes, and
objectives appropriate to what participants can know. Event scale accounts for available players,
with useful low-population contributions and recovery paths.
Active unawakened people can be exposed and can contribute. They may report movements,
carry supplies, escort another character, operate a defense device, or attempt dangerous
reconnaissance. Poor decisions, failed rescues, and genuine gate accidents can result in death.
Evacuation as gameplay
Hide, take an evacuation route, request an escort, use a protective item, or defend a position are
game actions. Timed resolution can consider injuries, supplies, companions, pursuers, and route
conditions. Survival must not require physically sprinting, crossing unsafe ground, or chasing
another person.
Successful virtual evacuation places the character in shelter. It does not validate physical
presence at a remote market or permit attacks from invulnerability. Re-entering active play has a
defined transition, current location validation, and any necessary restrictions on immediate
re-engagement.
Offline and service conditions
Ordinary offline characters are sheltered and do not receive a newly lethal event solely because
their last location is inside its radius. A character already committed to danger has a disclosed
reconnect grace and fallback behavior. A planning default is a brief grace period followed by a
server-controlled defensive or withdrawal attempt; exact timing must be tested alongside
combat rules.
Detected service-wide failures pause lethal progression or invoke an audited recovery process. A
client losing connection is not automatically proof of cheating and is not automatically an escape.
The app explains its current state and the result on reconnect.
Aftermath
Verified rescues, losses, discoveries, and participating groups can affect appropriate public
records. Failed containment can produce bounded virtual disruption and new recovery objectives.
Event outcomes must not arbitrarily destroy protected escrow inventory or create permanent
basic-progression dead ends.

SECTION 20
Permanent death, archives, and
succession
Death finality
At zero HP or another specified condition, the character may become incapacitated with a
disclosed rescue window. Healers, items, and companions can act during that window. Explicitly
described lethal mechanics may have different outcomes. Once permanent death is finalized,
normal healing and cooldown expiry cannot restore that character.
Record the cause, authoritative event, time, rule versions, affected assets, and resulting account
eligibility. Finalization is idempotent: a repeated event cannot create multiple estates, extend the
penalty repeatedly, or charge the same losses twice.
Cooldown and re-entry
The planning baseline is a three-day minimum, with longer waits for more established lives.
Prototype examples are approximately seven days for established characters and up to fourteen
for exceptional standing. These are testable defaults, not established retention findings. A
disclosed cap prevents indefinite growth.
The calculation uses recorded progression, achievements, and defined standing, not raw mention
counts that other users could manipulate. The current estimate is visible before lethal
commitment. Lore explains the delay as the stronger imprint of an influential life taking longer to
be followed by a new one.
The cooldown uses server time and account state. Reinstalling, changing the device clock, or
replaying an old request cannot make that account eligible. Platform integrity and other signals
support anti-evasion efforts, with a review path for false positives and shared-device cases.
Absolute prevention of alternate people, accounts, or devices is not promised.

Archives and observation
Existing public information remains at its prior visibility and can show the character as deceased.
Hidden achievements, private builds, and personal identity details remain private. There is no
automatic obituary or public dossier for an unknown person. Other players may publish
memories, allegations, or reports through normal forum rules.
During cooldown the account may inspect its records and read public content in observer mode.
It cannot transact, earn in-world rewards, command a guild, vote, or post as the dead character.
Out-of-character account support remains available. A new character receives a distinct identity
and starts unawakened; it is not automatically linked publicly to the previous life.
Asset policy
Asset or obligation
Default outcome
Guild-owned property
Remains with the organization, including recorded loans
Carried personal items
Follow the encounter's disclosed salvage, loss, or destruction policy
Secure personal storage
Moves into a frozen estate record
Uncommitted listings and
crafting inputs
Removed from active sale or work and settled to the estate under
their state rules
Completed sales
Remain completed; proceeds belong to the deceased character's
estate
Funded delivery or accepted
commission
Completes to estate storage or follows the predeclared
failure/refund rule
Account cosmetics
Remain available to the account
Rank, class, personal titles,
combat power
Remain historical attributes of the dead character
The initial release has no automatic inheritance to the replacement character. Estates exist for
accurate settlement, recovery investigation, and history; they are not an active ghost account.
Complex wills or auctions of estates are future features requiring their own anti-evasion design.
Guilds and markets must already have leadership succession and return-of-custody rules.

SECTION 21
Later national associations and WHA
Prerequisites
Player-run associations arrive after reliable multiplayer, meaningful regional communities, a
functioning economy, and functioning guild society. The launch registry can provide certification
interfaces and records, but it does not claim to be a player-elected national authority.
The mature model contains one recognized hunter association for each supported country and
one World Hunter Association. Established real players hold offices. The WHA coordinates the
national bodies and cross-border hunter affairs rather than acting as a second unrelated
organization in every country.
Powers and boundaries
National bodies can recognize guilds, organize disaster response, administer permitted
professional standards, investigate in-world complaints, and apply the sanctions authorized by
their charter. The WHA coordinates international standards, disputes, major emergencies, and
relations between associations.
Charters define eligibility, selection or elections, terms, conflicts of interest, removal, appeals,
evidence access, succession after death, and the scope of sanctions. Membership and jurisdiction
use explicit home-chapter and transfer rules; temporarily traveling does not silently rewrite
citizenship or voting rights.
Association officers cannot change hidden awakening rules, generate items or currency, read
private account data, bypass Blood Debt, or exercise operator-level account moderation. A player
government can make imperfect or controversial in-world decisions within its charter. The game
still retains a reliable appeal and operator-security boundary.
Political continuity
Office is attached to an eligible living character. Death, disqualification, or prolonged absence
invokes succession. Public offices retain their records independently of officeholders. No
replacement character automatically inherits an elected office, guild leadership, or accumulated
votes from a former life.
Do not launch these institutions without enough active participants to make representation
meaningful. Their data foundations can be prepared early, but visible authority follows actual
rollout and adoption.

SECTION 22
Later story shaped by players
Narrative foundation
The launch may contain original lore, authored starter quests, recurring NPCs, and isolated
mysteries. The later update adds a sustained world story whose direction responds to player
actions. This avoids promising a living global campaign before its systems and community exist.
Record discoveries, preserved or lost NPCs, resolved or unresolved invasions, significant rescues,
guild conflicts, and verified changes in trade or supplies. These records become inputs to
authored branches, event conditions, and persistent world state.
Authored possibilities, emergent outcomes
Developers supply factions, motives, possible events, and coherent rules. Players influence which
opportunities open, which actors survive, what regions need help, and what is remembered.
Important choices can have consequences without allowing an unconstrained text generator to
rewrite inventory or permanently destroy the game economy.
A scheduled event includes preconditions, participant scope, possible outcomes, affected
systems, recovery routes, and required evidence. A unique world event must account for
different regions and reasonable participation opportunities. It should not require an unsafe
real-world rush or constant attendance to remain relevant to the game.
History and fairness
World history distinguishes canonical system events from player interpretations. News can report
verified outcomes while forums debate motives. Late arrivals can discover evidence of earlier
lives and events and still access meaningful new opportunities. Past heroes may remain famous;
every useful future role must not already be occupied forever.

SECTION 23
Visual, audio, and interaction direction
Presentation target
The app should feel like a sophisticated personal System used by people inside its world. Use a
restrained dark interface, luminous accents, clear typography, readable maps, and carefully
staged moments of spectacle. Original identity, consistent icons, and responsive interactions
matter more than filling every screen with glowing decoration.
Rank color, frame treatment, and sound can convey progression. Maintain readable text and an
accessible high-contrast option. Detailed numbers remain available without crowding routine
decisions. Use motion to explain a change, acknowledge a significant event, or dramatize an
ability; routine browsing should remain calm.
Information hierarchy
Critical HP, incapacitation, current exposure, and pending trade terms are always clear. Map
markers separate gate risk, access, and availability. An item detail view distinguishes rank, rarity,
usability, ownership, delivery state, and actual effects. A quest hint does not masquerade as a
guaranteed rare reward.
The ID must work in fullscreen display and ordinary phone use. Forums favor readable long-form
discussion, linked reports, and clear authorship. Market cards support quick comparison, with
exact terms at confirmation. Announcements queue without stacking over essential actions.
Accessibility and polish
Support scalable text, screen-reader labels, comfortable touch targets, reduced motion, subtitles
for meaningful voice content, mute controls, and color-independent status. Offer a low-effects
mode for weaker devices. Notifications respect user settings and quiet hours.
Test new-player comprehension, sunlight readability, one-handed navigation, loading and empty
states, interrupted sessions, and failure recovery. Temporary artwork is acceptable in an early
build if clearly tracked; a polished preview must not conceal simulated multiplayer or
disconnected actions.

SECTION 24
System architecture and trust boundaries
Architecture requirements
Component
Responsibility
Client application
Render screens and encounters; collect input; request permitted actions;
show confirmed state
Identity and character
service
Accounts, one-living-character rule, credentials, lifecycle, cooldowns
World and encounter
service
Geographic discovery, instances, combat, gates, invasions, presence
Progression and content
service
Quests, hidden rules, assessments, classes, items, NPC eligibility
Economy service
Inventory ownership, currency ledger, escrow, markets, crafting, deliveries,
estates
Community service
Forums, guilds, reports, news, later institutions
Scheduled work and
event processing
Timed deliveries, jobs, expirations, recovery, event transitions
Operator tools and
observability
Content publishing, investigations, migrations, metrics, controlled recovery
These are logical boundaries, not a requirement for eight independently deployed services. A
well-structured modular application can implement the first release. The planner should avoid
distributed complexity without a demonstrated need.
Authoritative decisions
The server decides ownership, currency, damage, eligibility, rewards, rank, Blood Debt, death,
and cooldown expiry. A client can predict presentation but cannot declare a successful trade or a
legitimate awakening. Push messages and animations describe confirmed state; they are not the
canonical ledger.
Use transactional storage for critical mutations, durable scheduled work, immutable or
append-only event evidence where appropriate, and idempotency for retried actions. Geospatial
discovery should separate public map data from precise location evidence. Secret content is
delivered only when the player is eligible to see it.
Implementation selection
The planning default is a responsive browser prototype with a real backend and a deterministic
development map simulator, followed by a cross-platform mobile client or equivalent mobile
build once the core loop is verified. Prototype simulation must be explicitly marked and
unavailable as a production GPS override.
Choose framework, database, queue, mapping provider, and hosting through a short technical
decision record. Validate current platform requirements at that time. This brief intentionally does
not claim a vendor account, a map license, a native build pipeline, or a production deployment
already exists.

SECTION 25
Data model and non-negotiable invariants
Core records
Domain
Required records
Identity
Account, character, public profile, credential, account cosmetic entitlement
Character state
Life state, awakening state, condition, build, progression, cooldown
World
Geographic area, hub, map entity, gate, instance, encounter membership, event
Content
Versioned class, skill, item, recipe, NPC, quest, awakening rule, reward grant
Economy
Item instance or quantity, wallet ledger entry, reservation, offer, order, shipment,
crafting job, estate
Society
Guild, role, membership, treasury permission, market, vendor agreement, forum,
post, report
Evidence
Combat event, responsibility attribution, assessment, death finalization, audit
action, news source
Later governance
Country chapter, association, office, mandate, case, appeal, election or selection
record

Invariants to preserve

1. One account has at most one living character, and no new one during its active death
   cooldown.
2. A permanently dead character cannot act, trade, vote, earn new active rewards, or regain its
   old authority.
3. An item instance has one current custodian and one consistent ownership state; stacked
   quantities cannot become negative.
4. Reserved, escrowed, shipped, equipped, consumed, or crafting-committed goods cannot be
   used in incompatible operations.
5. A settled exchange transfers its agreed sides exactly once or compensates through a recorded
   recovery action.
6. A unique reward has only the grants permitted by its scope, including under simultaneous
   requests.
7. A retry, reconnect, clock change, or replay does not reroll an awakening, duplicate a reward, or
   bypass a cooldown.
8. Physical proximity is required for fresh local catalog access and settlement, regardless of a
   character's virtual shelter location.
9. Public records never acquire previously private information merely because someone dies or is
   accused.
10. A report or user-entered bounty is not proof of guilt and cannot directly change combat
    protection.
11. Notifications, cosmetic purchases, and narrative text cannot override authoritative game
    state.
12. Operator recovery is explicit, permissioned, attributable, and reconciles all affected records.

Versions and evidence
Store rule and content versions with relevant outcomes. Hidden probability results and secret
qualifying evidence stay private. Retention should support disputes and technical recovery while
minimizing unnecessary precise location history. Aggregate world evidence can persist without
retaining every raw phone coordinate indefinitely.

SECTION 26
Security, reliability, and operator controls
Threats that follow from the design
The priority threats are duplicated inventory, repeated reward claims, forged proximity,
tampered clients, cooldown evasion, unauthorized guild withdrawals, false-report abuse, leaked
secret rules, and inconsistent death settlement. The design also needs controls for spam,
harassment, and misuse of location information.
Authenticate every sensitive action and recheck character eligibility and permission at
settlement. Apply appropriate request limits and replay protection. Device integrity and
suspicious-location signals supplement server validation; they are not infallible proof of intent.
Avoid automatic irreversible punishment from a single noisy signal.
Operator functions
Operators need permissioned tools to inspect transactions, reconcile an order, review a report,
quarantine a faulty rule, disable an unsafe map point, manage content versions, and investigate
a death. Recovery actions require a reason and an audit record. Ordinary support access should
not include unrestricted edits to currency or secret progression.
Provide feature controls to suspend trading, lethal outcomes, a broken event, or a faulty reward
grant without taking every social and read-only surface offline. Tested backups and restore
procedures must account for the economy ledger, not only screen data.
Service behavior
Planning targets should cover acceptable response time, concurrent encounter behavior,
reconnect success, ledger consistency, and scheduled-job completion. Choose measurable
targets after selecting the pilot size and infrastructure; do not invent a supported global player
count before load testing.
The first production pilot must have working alerts for failed settlements, repeated job execution,
impossible balances, abnormal reward supply, and failures during death finalization. A client
must be able to recover the confirmed outcome of an action after losing its response.
Operational ownership
Player institutions handle their permitted in-world affairs. The operator handles account access,
exploit response, infrastructure, data protection, and real harassment. User-facing help and
appeals remain available during character cooldown. Public distribution requires current
platform, age-suitability, permission, and data-handling checks appropriate to the chosen
release; those checks belong in release planning rather than being invented as lore.

SECTION 27
End-to-end acceptance scenarios
The following scenarios turn the concept into observable outcomes. They are requirements for
meaningful verification, not a claim that tests have already run against an implemented game.
ID
Scenario
Required result
A01
New account creates a character
It starts unawakened, receives an identity, and
can use civilian services
A02
Same account requests another living
character
The request fails without creating a duplicate
A03
Unawakened player enters an eligible
difficult gate
Clear risk is shown; entry can proceed; normal
consequences apply
A04
Eligible awakening trigger is retried
One recorded outcome and one grant; no reroll
A05
Healer completes a role-specific
assessment
Certification reflects the assessment, not a
damage-only threshold
A06
QR card is scanned by another player
Only permitted public data and invitation actions
are available
A07
Two buyers attempt to purchase one item
At most one succeeds; the other receives a clear
updated result
A08
A direct-trade offer changes after
confirmation
Prior acceptances clear; both players must
confirm the new version
A09
Local shopper leaves the radius before
settlement
The transaction does not bypass the proximity
rule
A10
Virtual evacuation ends at a distant hub
The character is sheltered but cannot browse
that hub's local inventory remotely
A11
World Exchange order completes while
buyer is offline
Goods arrive once in the intended storage
without travel
A12
Purchased shipment contains an
acceleration item
That item cannot accelerate its own arrival
before it is owned and usable
A13
Crafting completion is delivered twice
Exactly one permitted output and one settlement
occur
A14
Quest reward is worldwide unique and two
players qualify
The defined selection rule grants only the
permitted supply
A15
Innocent character is reported or given a
user bounty
No automatic guilt, location reveal, or Blood Debt
exemption follows
A16
A summon causes an attributable PK
Responsibility follows the controlling character
under the declared rules
A17
Defensive kill meets verified defense
conditions
The appropriate reduced or zero Blood Debt
result is recorded
A18
Character crosses a fatal Blood Debt
threshold
The disclosed rule finalizes the correct death
once

ID
Scenario
Required result
A19
Character dies with a funded order and
guild equipment
Estate settlement honors the order; collective
ownership remains intact
A20
Dead character's old post is opened
Original permitted history remains; no new
private dossier appears
A21
Player reinstalls or changes device time
during cooldown
Server eligibility remains unchanged for that
account
A22
Offline civilian's last location lies in a new
invasion
No newly lethal exposure is created solely from
that location
A23
Client loses a response after a successful
trade
Reconnect retrieves the same receipt without
repeating the exchange
A24
A service-wide failure interrupts lethal
resolution
The documented freeze or audited recovery
policy applies consistently
A25
Guild or market founder dies
Succession and custody rules execute without
deleting collective work
A26
A news template processes an
achievement twice
No duplicate bulletin or invented public fact is
created
A27
Cooldown expires
A new unawakened identity may be created; the
previous one stays dead
A28
A player officer requests operator-only
data
Permission is denied and the attempt is recorded
appropriately
Additional exploratory testing should cover sparse regions, inaccessible map points, weak
devices, text scaling, muted notifications, economic collusion, and players who prefer civilian
careers. Broaden tests to resolve a concrete risk rather than adding checks that only repeat the
implementation.

SECTION 28
Rollout stages and release gates
Stage 0: specification and technical planning
Produce the requirements backlog, dependency map, threat and failure model, data design,
initial content definitions, visual direction, and technical decisions. Resolve the planning items in
Section 30. Preserve the complete vision but do not require every later institution before the first
playable build.
Stage 1: playable foundation
Build registration, one-character state, the System panel, fullscreen ID, a development map and
eligible live-map view, civilian work, one complete gate, a small combat kit, inventory, saved
progression, and one controlled awakening route. The objective is an end-to-end playable loop
with confirmed state. Show simulation labels where relevant.
Exit when a new tester can create an unawakened character, understand its condition, choose a
task, enter an encounter, acquire an item, and return to the same saved state. Foundational
identity and ownership tests must pass.
Stage 2: multiplayer alpha
Add real multi-account presence, parties, direct trades, personal stalls, basic guilds, crafting, NPC
quests, forums, and a local bulletin. Introduce the World Exchange and registered markets after
the shared transaction and reservation system is reliable. Test death, estates, and cooldowns in a
controlled environment before relying on them for irreversible public play.
Exit when independent players can cooperate, trade, craft, and recover consistently from
interrupted requests. Meaningful simultaneous-purchase and reward-retry tests must pass. A
small group should demonstrate voluntary repeat use and actual interaction.
Stage 3: regional mobile beta
Use one supported launch region and a concentrated group of testers. Deliver real-device GPS,
notification, battery, and accessibility validation. Enable the intended lethal risk rules only after
death, PK attribution, archives, succession, and incident recovery have passed their gates. Add
limited invasion events and a small, well-tested specialization catalog.
Exit when the economy and ordinary operations remain stable through real play and known
failure simulations. Measure whether players understand danger, return after loss, find trade
partners, and value civilian roles. Adjust declared tuning parameters with evidence.
Stage 4: regional expansion and society
Expand content, professions, rare paths, market capacity, meaningful regional events, and
community tools. Add larger fairs or auctions after transaction behavior and local liquidity justify
them. Expand geography only with dependable encounter supply, community support, and
operations.
Stage 5: mature institutions and evolving campaign
Introduce functioning national associations and the WHA when representation and worldwide
operations are viable. Add the sustained player-shaped story using the history accumulated by
earlier systems. These features remain explicitly later updates until their prerequisites are met.

SECTION 29
Evaluation, balance, and commercial
realism
What success means initially
The first test is whether people enjoy inhabiting a character and want to return. Measure
completion of the first useful task, comprehension of risk, repeat sessions, successful parties,
voluntary ID sharing, trade completion, and participation by unawakened players. Test whether
the interface communicates a hunter world without long explanations.
Severe-loss design
Permanent death, open PK, and a multi-day return delay are deliberate parts of this concept.
Their combination is also a major retention uncertainty. Test understanding and return behavior
after actual controlled losses. Distinguish dissatisfaction with an intended consequence from an
unfair loss caused by unclear rules, false attribution, or a technical fault.
Keep the owner informed if evidence suggests changes to a core rule. Do not quietly convert
death into ordinary respawn to improve a metric. Present the trade-off and a concrete alternative
before changing the baseline.
Fair opportunities
Track access to encounters in sparse areas, new-player progress, support-role assessment
outcomes, concentration of rare rewards, and local market stock. A world containing powerful
rankers still needs useful work and meaningful discoveries for everyone else. Seasonal standing
and local recognition create fresh opportunities without erasing persistent identity.
Costs and operations
Prepare a cost model after selecting the stack and target pilot size. Include maps, hosting,
storage, background jobs, monitoring, moderation, content production, device testing, and
optional AI services. Do not describe this brief as evidence that a worldwide game can be
operated without cost or staff attention.
AI can assist design, code, testing, content, and iteration. Core economic and lethal decisions
remain ordinary, testable game rules. A finished-looking interface is not evidence of multiplayer
reliability, and a prototype is not an app-store release until the required build and distribution
work is complete.

SECTION 30
Planning decisions and starting defaults
Use these defaults for the next development plan. Numerical examples are tuning proposals;
choose final values through testing. Keep hidden awakening criteria private and development
simulations separate from live permissions.
Decision
Starting position
Evidence or action needed
Commercial name
Hunter World is a descriptive
working label
Choose and check the final identity
before marketing
Launch region
One accessible, concentrated pilot
region
Select based on actual tester access and
suitable locations
Initial development
surface
Responsive browser build with real
backend
Confirm route to intended mobile clients
and device testing
Technical stack
Modular application, transactional
ledger, durable jobs, geospatial
discovery
Compare current candidates and record
the selection
Combat
Tactical turn-based solo play and
bounded party rounds
Prototype timing, readability, support
value, and retreat
Starting archetypes
Six awakened combat archetypes
plus civilian professions
Author a small complete catalog and
assess distinctiveness
Direct-trade radius
Approximately 100 meters
Test GPS uncertainty, accessibility, and
actual meeting behavior
Local-market radius
Approximately 150 meters
Test valid browsing and settlement
across real locations
Guild hunter
founding path
C-rank route and five founders as
an initial model
Set equivalent civilian founding criteria
and tune group size
Market founding
License quest, contract history,
registration, valid location, stock
Tune thresholds without making launch
areas empty
Death cooldown
Three-day floor; example tiers
around seven and fourteen days,
with a disclosed cap
Test comprehension and return behavior
before public scale
Blood Debt
Weighted, attributable burden with
visible critical warnings
Specify coefficients, defense windows,
recovery, and edge cases
Delivery
Fixed destination and disclosed
ETA with earned acceleration
Tune timings, fees, storage behavior,
and failure policies
Disconnects
Brief grace followed by
server-resolved fallback
Test honest interruptions and deliberate
evasion together
Public release
audience
Appropriate age and permissions
for the chosen regions and stores
Complete current release review before
distribution
Later governance
One association per supported
country and one WHA
Establish viable population, charters, and
operating capacity

SECTION 31
Competitive context and source notes
What the initial research established
The concept combines existing categories in a particular way. GPS exploration, fantasy classes,
raids, guild-like groups, character cards, and nearby trading each have precedents. The clearest
proposed distinction is the integrated modern hunter society: civilian life, one living character,
hidden awakening, geographic and remote commerce, player-created reputation, consequential
death, and later player government.
Product
Verified overlap
Relevance
Orna
GPS RPG, classes, dungeons, kingdoms, raids, world
events
Closest broad gameplay
comparison [S1]
Magic Streets
GPS fantasy exploration, classes, guilds, trading,
raids
Another close
comparison for world
and commerce [S2]
Monster Hunter
Now
Geographic hunting, cooperative play, equipment,
Guild Cards, mapped groups
Useful comparison for
encounters, identity, and
gatherings [S3-S5]
Ingress
Portals, map-based faction activity, coordination,
in-world interface
Useful comparison for
collective geographic
activity [S6]
LootQuest
GPS exploration, turn-based combat, narrative
quests, loot
Useful comparison for
short exploration and
combat loops [S7]
ARISE SOLO
System-style ranks, quests, personal progression,
GPS running
Adjacent fitness
experience rather than
the same game scope
[S8]
Pokemon GO
Nearby trading documented by its official help
center
Precedent for proximity
exchange [S9]
Research was checked on 11 September 2026 using official product pages and current store
listings. Those sources indicate advertised features and availability; they are not measurements
of active-player population. No verified source found during the review established an identical
complete feature package. This is not proof of exclusive originality or a prediction of commercial
demand.
Technical source boundaries
Google's Play Integrity documentation describes signals for genuine app and device interactions
and recommends using them alongside other anti-abuse measures [S10]. This supports a layered
approach, not an absolute promise to identify every person or stop every alternate account.
OpenAI's Astra documentation describes multistep software-engineering capabilities [S11]. It
supports using Astra as a development collaborator. It does not establish that this particular
game has been implemented, audited, balanced, or prepared for worldwide operation.

References
[S1] Orna, official Google Play listing:
https://play.google.com/store/apps/details?hl=en_US&id=playorna.com.orna
[S2] Magic Streets, official Google Play listing:
https://play.google.com/store/apps/details?hl=en_US&id=com.builditgames.magicstreets
[S3] Monster Hunter Now, How to Play: https://monsterhunternow.com/en/howtoplay/overview
[S4] Monster Hunter Now, Guild Card:
https://niantic.helpshift.com/hc/en/39-monster-hunter-now/faq/4466-guild-card/
[S5] Monster Hunter Now, Groups and Meetups:
https://niantic.helpshift.com/hc/en/39-monster-hunter-now/faq/4756-groups-and-meetups-1731173010/
[S6] Ingress, official Google Play listing:
https://play.google.com/store/apps/details?hl=en_US&id=com.nianticproject.ingress
[S7] LootQuest, official Google Play listing:
https://play.google.com/store/apps/details?hl=en_US&id=com.virtualcoma.lootquest
[S8] ARISE SOLO, official Google Play listing: https://play.google.com/store/apps/details?id=arisesolo.com
[S9] Pokemon GO, Trading Pokemon: https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/96-trading-pokemon/
[S10] Google, Play Integrity API overview: https://developer.android.com/google/play/integrity/overview
[S11] OpenAI, Using GPT-6 Astra: https://developers.openai.com/api/docs/guides/latest-model

SECTION 32
Astra handoff and completeness checklist
Ready-to-use planning instruction
Use this PDF as the baseline product and game-design brief for the project. Read the entire
document before planning. Preserve the owner's latest requirements and distinguish core rules
from configurable defaults, content examples, and later updates. Do not substitute a different
game with ordinary respawn, forced class selection at registration, remote access to local-only
inventories, or automatically generated public death dossiers.
First produce a build plan: requirements by release stage, dependencies, technical decisions,
data model, state transitions, authoritative operations, critical failure handling, initial content
scope, and testable acceptance criteria. Resolve Section 30 using explicit recommendations.
Keep a decision log and versioned game bible in the project's source of truth.
Build the first complete playable milestone and verify it before expanding. Use real persisted
accounts and authoritative state where the milestone requires them. Mark development
simulations clearly. Keep hidden awakening rules, reward eligibility, and operational secrets out
of the public client. Treat trading, deliveries, crafting, PK attribution, and death settlement as
connected stateful systems.
Polish the interface through rendered inspection and practical playtesting. Verify failure and
reconnect flows as well as successful ones. Keep national associations, the WHA, and the
sustained player-shaped campaign in their later stages until prerequisites are demonstrated.
Report what is implemented, what is verified, what is simulated, and the next concrete milestone
without claiming untested readiness.

Integrated feature check
Requirement
Where defined
One living character, unawakened start, civilian participation
04-05
System panel, fullscreen ID, quick HP/MP and body status
06
Geographic gates, guilds, markets, NPCs, nearby presence; no AR
07-08
Hidden awakening, classes, subclasses, rare and mythic paths
09, 17
Ranked items, crafting, healer and smith-related careers
10
Direct trades, solo stalls, qualified physical markets
11-12
Remote market, timed delivery, earned bypass items or statuses
13
Fair economy and cosmetic monetization
14
Guild creation including civilian route, recruitment, projects, succession
15
Roleplaying forums, evidence, player news, sounds, notifications
16
Map and forum NPCs, finite hidden class and item quests
17
PK, player-driven justice, weighted limit and Blood Debt lore
18
Gate accidents, breaks, invasions, hiding, evacuation, rescue
19
Permanent death, retained existing history, no automatic obituary
20
Multi-day server cooldown, new life, estates, no ghost authority
20
Later country associations and single WHA run by players
21
Later world story shaped by player actions
22
Visual and audio polish, architecture, ownership invariants
23-26
Acceptance scenarios, rollout, validation, planning decisions
27-30
Competition, sources, and next-chat handoff
31-32
Baseline completion statement
This brief contains the complete integrated app idea at the level needed to begin technical
planning and staged development. Remaining numerical tuning, platform selection, launch
geography, and final content catalogs are identified work items rather than hidden assumptions.
The next deliverable is the implementation plan and its first verifiable playable milestone.
