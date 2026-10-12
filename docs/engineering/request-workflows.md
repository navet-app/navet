# Direct request workflows

Use ordinary requests in the Navet Codex workspace. The routed guides carry each request through
its checked deliverable. These workflows run interactively using available connected tools.

| Request | Result | Authority |
| --- | --- | --- |
| Post about Navet, promote a feature, or share release updates | One checked post and screenshot published to Navet Reddit, Discord and the existing Home Assistant topic | One approval of the shared master post and screenshot covers all three destinations |
| Suggest ideas for Navet | Researched private GitHub Project proposals with plans and proportionate prototypes | Includes isolated feasibility POCs; prioritization remains with the maintainer |
| Scan Navet for UX bugs and improvements | Luna high code inspection with concise, deduplicated GitHub Project findings and explicit coverage | On demand; findings do not authorize implementation |
| Implement this approved idea | One PR, previews, current-head checks and UX evidence linked to GitHub Project | Requires selected scope and public visibility; maintainer merges |

## Follow the matching workflow

- Community communication resolves the
  requested topic or feature, applies Navet voice and design standards, and verifies all three
  publications. Release posts also read the full changelog and ask which news should lead.
- Idea proposals uses the existing private **Navet planning** Project, checks duplicates and develops decision-ready proposals.
- Approved delivery implements selected
  scope using the existing work brief, UX audit and approval package.
- UX discovery scan delegates close code and journey
  inspection to `gpt-6-luna` with high reasoning effort. It separates defects from improvements
  and reports source evidence and actual rendered coverage.

Private destination, access and revision rules live in [Project planning](github-project-planning.md).
Project draft detail follows the [proposal template](templates/idea-proposal.md). Small bugs use
short reproduction, expected behavior, suggested repair and acceptance checks. Research, options
and prototypes support decisions that need them. Detailed logs and execution records remain in
private task artifacts; draft history carries useful new results, questions and delivery links.

For a release announcement, the agent first reads and retains the entire published changelog.
It presents a brief digest and asks **“What should be the headline news for this release?”**
If you already supplied that priority, it uses your answer. Your selected news drives the title,
opening and screenshot; the post includes up to three supporting highlights from the changelog
and links to the full release notes. This editorial selection is separate from approval to publish.

For feature highlights, tips and general Navet discussion, the requested topic drives the post.
Verify product claims against the exact current public product source; use the maintainer's
actual point of view for opinion-led discussion. Use a clean checkout at the verified commit
for evidence and public-safe screenshots. A release tag/changelog is required for release claims.

Before posting, show one master title, body, CTA, screenshot and alt text, with the three named
destinations and publishing identities. One approval authorizes that post in all three places.
Use one actual composer preview when available. The agent checks the other platforms itself;
missing access remains explicit. Reddit uses its title field; Discord and forum replies include
the same title above the body. Platform formatting may differ, but wording, links and image stay
identical. A change to substantive copy or the screenshot requires renewed approval. A human
request to reuse an already approved post at another named destination authorizes that reuse.
New identity, templates and foundational product/design choices keep their existing review rules.

## Setup and recovery

GitHub must be authenticated with Projects access to the private Navet planning Project. Drafts
need no repository and have no comment threads. Retain research, questions and verified answers in
the draft body; separately protected artifacts retain their own access permissions. Use a separately
authored public issue for the approved delivery brief.
The agent verifies destination privacy and owning-service readback before completing a proposal.
Public delivery requires a separate selected-scope decision; prioritization does not grant it.

Community publication uses enabled browser control and authenticated Navet accounts, or a
channel-specific Discord incoming webhook. Verify the account or webhook identity and exact
destination before sending. The configured Discord URL identifies the Navet
server; inspect its actual announcement channel. Missing login or ambiguous destination blocks
that channel with final content retained.
Discord webhook delivery requires a private local webhook URL rather than browser login. The
maintainer creates it in Server Settings → Integrations, selects the announcements channel and
sets the reviewed name/avatar. Store its URL in `marketing/private/discord-webhook-url` with
permissions `600`; keep it outside copy, screenshots and publication receipts. Include its
identity in the consolidated approval package. The sender verifies the server, channel, name, avatar,
approved text and image before claiming one send, disables automatic mentions, and records API
readback. No webhook publication occurs during setup or testing. Use `node scripts/discord-webhook.mjs --help` for the
sender command. An unavailable actual Discord preview remains explicitly unverified.

Workflow tooling reads evidence from a separate clean checkout through `--source-root`. Release
posts require its published tag; other posts require the exact verified source commit. Capture
that checkout's public-safe demo. Source/head and committed-file checks prevent changed or
untracked evidence from being presented as product proof.

Each marketing task retains private progress, copy and review evidence in the ignored marketing
workspace. `prepare` retains the reviewed publication intent; `attempt` claims one send before the
browser click or webhook request; `record` validates observed post/message readback. Current command arguments and record fields are defined in the
[content CLI](../../scripts/content-cli.mjs) and
[publication protocol](../../scripts/content-publication.mjs). Successful channels are skipped on restart. An uncertain
send requires inspection of the owning platform and cannot automatically send again.

Version 2 agent records retain request authorization, final package approval, quality review, publication method and
readback. Version 1 manual records retain their existing meaning. Review assertions are supported
by actual evidence; the scripts cannot authenticate a human conversation or inspect a browser.
The local shared ledger deduplicates within this workspace; multiple machines require shared
durable history. Local ignored files and caches are not backups.

Idea and delivery tasks retain request identity, draft revision, artifact locations, completed
steps, blockers and next action. A human answer resumes the same task within accepted scope.
Head-sensitive validation becomes unverified after another commit. A pending preview, unresolved
valid finding or missing UX evidence stays visible in the approval package.

## Acceptance evidence

| Milestone | Required evidence |
| --- | --- |
| Community post | Actual human request, verified source, approved master copy/image, identities/destinations and three actual publication readbacks |
| Idea development | Requested scope, verified private destination, proposal and attachment/prototype readback |
| Approved delivery | Selected scope, one PR, current previews/checks, rendered UX review and Project readback |

Verify access and operational status for the current request from owning-service receipts.
A prior publication or local evaluation does not establish present access or acceptance.

Deterministic tests cover agent-authored content, clean tagged evidence, request scope, reviewed
payloads, wrong destinations/readbacks, retained attempts and partial-channel recovery. Isolated
skill evaluations cover uncertain sends, duplicate ideas, inaccessible attachments and stale PR
evidence. These establish workflow behavior without proving live platform access or content quality.
Update operational status only from an explicitly requested real run and its receipts.

Measure observed request-to-result time, maintainer interventions, duplicate actions and review
defects. Leave unavailable measurements unknown. No scheduler or unattended runner is activated
by these skills; coordinated-team live gates remain in [the team workflow](agent-team-workflow.md).
