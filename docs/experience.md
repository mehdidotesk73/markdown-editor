# Experience — Lessons & History

Record what you learn as you build: patterns that work, ideas that didn't pan out, and a version history of major changes.

## What Didn't Work (Gotchas & Dead Ends)

### Mobile-First Design Constraints

Touch targets need to be at least 44×44px. Avoid hover-only interactions — users on mobile have no hover. Rethink interactions like "expand on hover" as "toggle on tap" or always-expanded. Test regularly on actual mobile devices, not just the browser's responsive mode.

### Service-Worker Caching & Stale Builds

A PWA caches aggressively to work offline. If a user opens your app, then you deploy a new version, the old bundle may keep serving until they:
- Manually tap "Reload latest" (we surface this in the footer)
- Force-refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
- Open in a private/incognito tab
- Wait for the service worker to auto-update (can take hours)

Always surface a visual "update ready" affordance so users know to reload. See `App.vue` for the implementation.

Two things learned the hard way, both built into the scaffold (`docs/system-design.md` §2):

- **You can't tell current from stale without a published version to compare against.** Service-worker
  state doesn't answer "is a newer build live?". The build emits `version.json`, and the app polls it
  and compares with its own baked-in id. If the footer ever reads `build dev` on a deployed site, the
  build id isn't resolving — Netlify provides `COMMIT_REF`; nothing sets `VITE_BUILD_ID` by default.
- **On iOS, a polite service-worker update plus `location.reload()` often replays the old bundle** —
  the old worker keeps control and serves the precached `index.html`. Installed PWAs also stay alive
  long enough to miss deploys without a periodic `reg.update()`. The manual "Reload latest"
  therefore unregisters the worker and clears caches before reloading, and only does so after
  `version.json` confirms something newer is live.

### ECharts Gotchas (if using charts)

On a **category x-axis**, `visualMap` (color ranges) and per-segment `lineStyle` colors do **not** bind as expected. If you need per-point coloring on a category axis, use a series with per-point `itemStyle` instead. Register new chart types explicitly with `echarts.use([LineChart, ...])` — ECharts doesn't auto-register components.

### Pure Logic vs. Components

Logic lives in `src/lib/` as plain functions over already-fetched arrays. They recompute instantly with no API refetch. Keep components thin — they should mostly render. This separation makes logic testable and reusable without rebuild cycles.

### Don't Hand-Write a Static `public/manifest.json`

`vite-plugin-pwa` generates `manifest.webmanifest` and injects its own `<link rel="manifest">`. A second static `public/manifest.json` linked from `index.html` produces two competing manifest links in the built HTML, and the static one wins in some browsers — pointing at icons the build never processed. Define the manifest once, in the `VitePWA({ manifest: ... })` block.

### Database Support Is for Live Apps, Not "Stateful" Apps

Recorded as posed. The examples carry the distinction better than any taxonomy built on top of them would:

> I think the database support is for live apps not stateful apps. Depends on what defines a state. But there can be an app that accesses a database to create some sort of coherencey between different running instances of the app. Another form of state is an app that links to a resource and loads into app states for example an accounting app that sets up connection to a text file on web or a csv local file that it has read and write access to, and allow reading the state, modifying the state and saving the state. The latter is a lower level of statefulness. And another level is like a flappy bird app game that does not keep highscores or anything. The app runs, you click play, you play the game, when you die your score is displayed and button for play again. No external state at all just an endless loop of internal states.
>
> Different forms of state might need different infrastructure.

### Realtime Statefulness — a Variation With No Stored State

A further form, alongside the ones above: **state that is live between running instances and stored nowhere.** Four players in a game, a shared cursor, a live drawing surface. Separate copies must agree — but the agreement is only about *now*, and a value that's 200ms old is worthless rather than merely stale.

That is not what a database is for, and Supabase serves it with a different primitive. `postgres_changes` (what a shared shopping list uses) is a real row write replicated off the WAL and then fanned out — correct when the data must persist, far too heavy when it must not. **Broadcast** is plain pub/sub over the same WebSocket and never touches Postgres.

How the connection actually works, since the obvious guesses are both wrong — instances neither share a socket nor join one that a host opens:

- Every client opens **its own** WebSocket to the Realtime server and subscribes to a **topic name**. The server relays between whoever named the same string. It's rendezvous by string, like a chat room name.
- **Nobody creates or owns a channel.** The first subscriber doesn't set it up; the last to leave doesn't tear it down. If the app needs an authoritative host, that's an election the app runs — the transport has no such concept.
- **One socket per client, multiplexed.** Several `.channel()` calls share it.
- **Nothing is stored, and there is no replay.** A message sent before you subscribed is gone, so a late joiner arrives blind and must be handed a snapshot explicitly.
- **Traffic always goes to the region and back.** Two devices on the same wifi still round-trip to Supabase. That's the latency floor; WebRTC is the only way under it.
- The **channel name is the entire access control** on a public channel — so a random room code, for the same reason list ids are random.
- **Presence** rides the same channel and gives the roster (join/leave) without building it.

### Netlify Doesn't Rebuild When You Change an Environment Variable

The database worked on branch previews, then didn't, and a fresh rebuild fixed it with no code change and no config change. The variables had been set on all scopes from the start, so the configuration screen gave no hint anything was wrong.

The root cause was never pinned down, and it's recorded here as an open case rather than a solved one. The leading candidate is build-time staleness: **Vite inlines `VITE_*` into the bundle at build time**, and **Netlify does not trigger a deploy when an environment variable is edited** — so a build can predate its own configuration and serve `undefined` while the dashboard shows everything set correctly. That fits "a rebuild fixed it" without any code change. The service worker serving a stale bundle fits too, and the two aren't exclusive.

The useful part isn't the diagnosis. It's that **a rebuild is cheap and rules out a whole class of cause**, so it's worth trying early rather than after reading the code. And that when a value is compiled in rather than read at runtime, every configuration screen can look correct while the served artifact disagrees — the tell is the deploy's timestamp, not the value.

Worth noting the graceful `supabase = url && key ? createClient(...) : null` guard makes this harder to see. It's the right pattern — it keeps the required `build` check green in CI, where no variables are set — but it converts the failure into a feature that silently does nothing. Pairing it with `logDebug('Supabase not configured — sharing disabled', 'warn')` is what would have turned "sharing is broken" into a log line naming the cause, which is also how we'd know which candidate above was right.

### `using (true)` Is Not "Anyone With the Link"

A Supabase walkthrough that otherwise went well described its RLS policies as making rows "readable/writable by anyone with a list's id — that's what link-only sharing means at the database level," and compared it to a Google Docs anyone-with-the-link share. The SQL was `create policy ... for all using (true)`, and that claim is wrong in a way worth keeping.

`using (true)` grants the anon role **the entire table**. The client can `select *` and enumerate every row; it never has to know an id. Both values needed to do it — project URL and publishable key — are readable in the shipped JavaScript bundle, because that is what those values are for. The unguessable `gen_random_uuid()` stops someone *guessing* a link; it does nothing once they can just list the table. Google Docs actually enforces link-sharing server-side, so the analogy claims a property the database does not have.

It's usually an acceptable trade-off — a shopping list between two people does not need more — and the fix is not always harder SQL. The fix is describing it accurately: *"keeps it away from anyone who wasn't sent the link, and off search engines; not private in a bank-account sense."* Real link-only enforcement needs table access revoked and `security definer` functions taking the id as an argument, which is a bigger piece of work and should be scoped as one.

Same family as the disabled ruleset and the blank Netlify project name: **a setup that looks configured and enforces less than it appears to.** The difference here is that the gap lands in what Claude *tells* the user, not in what they clicked — which makes it harder to catch, since nothing ever fails.

### A Multi-Select Gate Without a Recommendation Is a Quiz the User Can't Pass

The pre-merge doc gate listed its four surfaces neutrally and asked which to update. But the user is non-technical and did not read the diff — they have no basis for judging whether a branch touched "architecture" or made a help page wrong. Asking anyway pushes a decision onto the person least equipped to make it, and the rational responses are to tick everything or tick nothing, neither of which is a judgement.

Claude is the only participant who knows what changed, so the recommendation has to be worked out *before* the question is posed and carried in the options themselves: recommended ones first with **(Recommended)**, and each description naming the specific thing in *this* branch that triggers it. "The Browse page got a category filter, so its help page now describes the old behaviour" is a fact they can accept or reject. "If UI changed, update the help doc" is homework.

**The failure mode to avoid is recommending all four defensively.** If everything is always recommended the recommendation carries no information, and it's the neutral list again with more words. Actively clearing a surface — "nothing here changed the architecture" — is worth as much as flagging one.

Generalizes past this gate: whenever a question is posed to someone who can't see what you can see, the options have to carry your reading of the situation, not just the choices. The user still decides; they just shouldn't have to reconstruct the evidence first.

### A Log Panel Nobody Writes To Is Just an Empty Box

The scaffold shipped the *display* half of on-device debugging — a reactive buffer, a log panel, a **Copy log** button, an error-count dot — and none of the *capture* half. `main.ts` was three lines with no `errorHandler`, no `window.error` listener, no `unhandledrejection` handler. The only entries that ever appeared were ones someone had hand-written a `logDebug()` call for, which means the panel could only report failures that had already been anticipated. The user opens it after a button misbehaves and reads "No log entries yet."

**The case that matters is not the white screen — it's the button that does nothing.** And that one has a specific trap: **Vue catches throws inside event handlers itself.** A handler that throws never reaches `window.onerror`; Vue routes it to `app.config.errorHandler`, and if that's unset the error is logged to a console the phone user cannot open. So the single most common user-visible failure was the one path a naive `window.onerror` would have missed.

Four sources are needed, and each catches something the others don't: `app.config.errorHandler` (handlers, hooks, watchers), patched `console.error`/`warn` (library output, Vue's own warnings), `window.error` **in the capture phase** (plain script errors, plus failed image/script/stylesheet loads, which don't bubble), and `unhandledrejection` (the un-awaited `fetch` in an async handler). Patching the console needs care: bind the native methods *before* patching and have `logDebug` use those, or writing to the panel re-enters the patch and records itself.

Two things that only matter because the user is non-technical: **repeated identical errors collapse to `×N`**, since a handler that throws on every tap would otherwise flush the one useful message out of a 100-entry buffer with copies of itself; and **`copyLog` has an `execCommand` fallback**, because `navigator.clipboard` needs a secure context and this is the only channel from the phone back to Claude — a silent failure there loses the entire bug report.

Verified with Playwright against the built app rather than argued from the code: a throwing handler, a `console.error`, a rejected promise, a 404 image and five repeats all land in the panel, the footer badge turns red with the count, and **Copy log** sits inside the opened window. Worth doing because all four handlers were unverifiable by reading, and the sandbox can drive a real browser.

### Mobile Autocapitalization Silently Breaks Exact-Match Identifiers

Told to add a required status check named `build`, a user on iOS typed it into GitHub's search box and got `Build` — the keyboard capitalized the first letter, as mobile keyboards do by default in text fields. GitHub duly offered **+ Add Build · Any source**.

Adding that would have been a full lockout. Check names match literally, so a rule requiring `Build` waits forever on a check reporting as `build`; combined with an empty bypass list, every PR the user ever opened would be unmergeable — on a ruleset that reads as correctly configured, Active, with all the right boxes ticked. Exactly the failure **Required approvals: 0** was chosen to prevent, arriving through a completely different door.

Two things follow:

**This audience types on phones, so any instruction to enter an identifier needs its casing stated.** "Type `build`" is insufficient; "type `build`, all lowercase — your phone will try to capitalize it" is the instruction. Applies to anything matched literally: check names, branch patterns, project names.

**Better still, don't have them type it at all.** Both of the above are mitigations for an input step that turned out to be avoidable — see the entry below on triggering CI early, which makes `build` a listed option the user selects instead of an identifier they transcribe. Casing guidance and readbacks remain as the fallback, but the durable fix was removing the keystroke, not perfecting the instruction around it.

**And where a readback is still needed, it matters more than the instruction.** The user can follow "type `build`" perfectly and still end up with `Build`, because the corruption happens after they act, not during. That's what makes it different from a misread instruction — no amount of clarity in the telling prevents it. The only reliable catch is asking what's actually in the field before they commit, which is the same reason the confirmation gates restate the expected result rather than just asking "done?".

### Don't Schedule a Check-In for a Two-Minute Deploy

Waiting on a deploy (this happened with the GitHub Pages build the template used to have) by scheduling a background check-in produced the worst available shape: the turn ended on "I'll check back in a couple of minutes", the conversation stalled, and the user — sitting right there — got bored and checked manually. The deploy had already succeeded. The automation added latency and dead air to something that takes ninety seconds.

Poll it in-turn instead, or hand the check to the user as an ordinary confirmation gate ("takes about two minutes, tell me when the run goes green"). Both beat a promise that parks the conversation. Background scheduling earns its place on long or unattended waits; during an interactive setup the user is a faster and more reliable signal than a timer. Still applies to Netlify's own builds now that they're the only deploy pipeline.

### Netlify Site Names Are a Global Namespace

Every Netlify site lives under `*.netlify.app`, one pool shared across the platform, so plain names like `grocery-assistant` are long gone. Propose a distinguished name (username, initials, an extra word), keep alternates in reserve, and warn the user it may be taken — then a rejection is a ten-second retry instead of a failure.

The subtler failure is **doc rot**: the name is chosen at intake and committed into the scaffold (README URLs, the deploy-preview pattern in the project's `CLAUDE.md`), but isn't tested against reality until Netlify setup several steps later. If it changes there and the docs aren't updated, the project's documentation points at a stranger's live site — a wrong link, not a broken one, so nothing surfaces it. Any value committed before external validation needs a write-back once the real value is known.

### A Guided Step Needs a Link and a Value for Every Required Field

The branch-protection step told the user "Go to your repo on GitHub → Settings → Rules → Rulesets" and then listed seven instructions that never supplied a **Ruleset Name** — a field GitHub requires and leaves blank. Two failures in one message, and both had already been fixed once, elsewhere:

**A navigation path is not a link.** Four hops through a settings menu someone has never opened, on a phone, is work the message could have done for them. Deep links exist: `https://github.com/<owner>/<repo>/settings/rules`. Give the URL and keep the click-path as a one-line fallback for when it doesn't resolve.

**Every field the form requires needs a value in the message.** This is the same bug as Netlify's blank Project name, one page later. The instruction covered what to tick and what to leave alone, and simply had nothing to say about the field at the top — so the user stops, mid-step, holding a decision the instructions implied wouldn't come up. If the value genuinely doesn't matter, that's still a reason to supply one (`protect main`) rather than to omit it; "any name works" is a thing to know, not a thing to have to invent.

The general form: **walk the actual form, field by field, and check the message accounts for each one** — including the ones that don't matter. Steps get written from the interesting parts (which rules, which checks) and the boring required field at the top is what gets dropped.

**Follow-up: the link then shipped in backticks and rendered as dead text.** Code formatting suppresses auto-linking, so `https://github.com/.../settings/rules` arrived as a string the user couldn't tap — leaving them to select and copy a long URL on a phone, which is worse than the four-hop click-path the link was supposed to replace. The habit comes from treating every literal the same way; URLs are the exception. Backticks are for values the user **types** (names, branches, check names, where exact characters matter and a link would be wrong). URLs are for **tapping** and go bare in running text. Worth noticing that `ship-feature`'s three hand-off links were already bare and had been working the whole time — the inconsistency is what hid the bug.

### `npm ci` Needs a Committed Lockfile

The CI workflow runs `npm ci`, which fails outright ("can only install packages when your package.json and package-lock.json are in sync") if `package-lock.json` isn't committed. It's tempting to gitignore lockfiles; don't. Commit it whenever dependencies change.

### `declaration: true` in an App's tsconfig

Emitting declarations for an *app* makes `vue-tsc` demand exported names for every type used in a component's public surface — a `defineProps` interface that isn't exported fails with `TS4082: Default export of the module has or is using private name 'Props'`. Declarations matter for libraries, not apps. Dropping `declaration`/`declarationMap` is the fix, not exporting every internal interface.

### Ambient Types for Build-Time Constants

`__BUILD_ID__` and `__BUILD_TIME__` are injected by Vite's `define`, and `virtual:pwa-register` only exists at build time. TypeScript knows about none of them without an `src/env.d.ts` declaring the constants and referencing `vite/client` and `vite-plugin-pwa/client`. Without it the build fails with `TS2304: Cannot find name '__BUILD_ID__'`.

## Patterns Worth Reusing

### Two-Party Link Apps: the URL Fragment as Credential, and the Join Race

Two people share one thing via a link, with no accounts — a chat, a 1:1 handoff, an approval between
two roles. Two pieces here are worth reusing **whether or not anything is encrypted**, which is why
they sit outside the encryption pattern below.

**The URL fragment is a credential store you already have.** Everything after `#` is never sent in
an HTTP request — not to the host, not to the database, not in a `Referer` header, not into server
access logs. So `#/chat/<id>/<role>/<packedKey>` hands someone a real secret with no login, no
password, and nothing server-side to store. Pack it by exporting the key as JWK →
`JSON.stringify` → base64 → URL-safe alphabet (`+/` → `-_`, strip `=`).

That's a complete answer to *"how do we give someone a real credential without building a login
system"*, and it's the most transferable idea here. What it is **not** is secret from everything:

- **Any JavaScript on the page can read `location.hash`.** Add an analytics snippet, a chat widget,
  any third-party tag, and it can exfiltrate every user's private key. This is the failure that
  matters most, because it arrives later, innocently, in an unrelated PR.
- It lands in **browser history**, which may sync across a user's devices.
- It's **on screen** — in screenshots, screen shares, and over a shoulder.
- **The link is the account.** Whoever holds it *is* that party, and losing it loses everything with
  no reset. Say that to the user in those words.

**Guard the join with a conditional update, not a plain one.** When the second person to open an
invite claims a role, do it as:

```sql
update sessions set joiner_public_key = $1
where id = $2 and joiner_public_key is null
```

Then **check the affected row count** rather than trusting that the update "succeeded" — zero rows
means somebody else got there first, and the app should say so instead of silently continuing as a
participant it isn't. Without this, a third visitor to a shared link quietly overwrites the real
joiner and takes over the session.

Be honest about its reach: with a permissive `using (true)` policy this stops the *accidental*
second joiner, which is the realistic case. It does not stop someone determined, who can issue the
same update themselves. It's cheap, it fixes the failure that actually happens, and it isn't
authentication.

### End-to-End Encryption Over a Database You Don't Trust

For a messaging app, or anything where the rows live in a database but their contents shouldn't be readable by whoever can read the database. The server stores ciphertext and public keys; it never sees plaintext or any private key.

**Key agreement is Diffie–Hellman (ECDH).** Each side has a keypair and publishes only the public half. The trick is that combining *your private key with their public key* produces the same value as combining *their private key with your public key* — so both ends arrive at one shared secret that never crosses the wire. On elliptic curves the combining step is scalar multiplication, not hashing. Hashing comes one step later: run the raw shared secret through HKDF to get the actual symmetric key.

Then AES-GCM with that key, **a fresh random IV per message**. Reusing an IV under the same key breaks GCM badly — it's the one implementation mistake that turns this from real encryption into none.

The browser does all of it natively; no library:

```ts
// once per identity — publish publicKey, keep privateKey off the server
const kp = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])

// per conversation — both sides compute the identical key
const key = await crypto.subtle.deriveKey(
  { name: 'ECDH', public: theirPublicKey }, myPrivateKey,
  { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

// per message
const iv = crypto.getRandomValues(new Uint8Array(12))
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
```

**Storage shape: pairwise, not user-keyed.** Built for real, this wants no `profiles`/`users` table
at all — there is no identity beyond "the two people in this row", so the role is an enum and the
public keys are slots on the shared row:

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  starter_public_key text not null,
  joiner_public_key  text,            -- null until the second party arrives
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  sender text not null check (sender in ('starter', 'joiner')),
  ciphertext text not null,
  iv text not null,
  created_at timestamptz not null default now()
);
```

The IV is stored beside the ciphertext and is not secret. `sender` as a role check rather than a
foreign key is the part that generalizes to any small fixed-N arrangement.

**Two realtime subscriptions, not one:** an UPDATE on the session row, so "waiting for the other
person" becomes a live transition rather than a poll, and a session-filtered INSERT on messages.
Letting your own sends round-trip through that same INSERT subscription instead of rendering
optimistically avoids a duplicate-render race, and the added latency isn't noticeable.

**Key custody, when the user holds it.** Simplest workable version: the user enters a passphrase at the start of a session, and it never leaves memory. Two ways to get from a passphrase to a keypair — wrapping is the one to prefer:

- **Wrap** (recommended): generate a random keypair once, encrypt the private key under a PBKDF2/Argon2-derived AES key, store that wrapped blob in the DB. The passphrase unwraps it. Safe to store because it's useless without the passphrase, and it works on any device.
- **Derive deterministically**: turn the passphrase directly into the private scalar. No blob to store, but importing a raw scalar as a P-256 key via JWK is fiddly and easy to get subtly wrong.

Either way the passphrase is the whole system: **lose it and every past message is permanently unreadable.** There is no reset. Say that to the user in those words before they pick one.

**Be precise about what this protects, and what it doesn't.** Same discipline as not calling `using (true)` "link-only":

- **The server can still MITM you** if it's the one telling you the recipient's public key — it can substitute its own and read everything. Closing that needs an out-of-band fingerprint check, which is what Signal's "safety numbers" are.
- **No forward secrecy** with static keypairs: one compromised private key decrypts every message ever sent. Rotating per message (Double Ratchet) is a much larger build.
- **Metadata stays plaintext.** Who talked to whom, when, and how often are ordinary readable columns. Encryption hides content, not the social graph.
- **Group chat breaks the pairwise model.** Encrypt the message once under a random key, then wrap that key separately for each recipient.

One good side effect, worth stating the right way round: `using (true)` still means anyone with the URL and publishable key can list the whole table — **the encryption is what makes that normally-too-permissive default acceptable here**, since what they enumerate is ciphertext. It is not that the policy became safe.

### Chained-Scenario E2E Tests for Step-Triggered State Machines

For an app whose state changes only in response to an explicit user action — no scheduler, no NPC loop, no second user acting concurrently. Within that, some behaviour only appears across a *sequence* of dependent steps: create a thing, act on it as a second actor, respond as the first, then check both sides. Unit tests can't reach it — it needs a real trigger, a real round trip, and real settled state before the next step is even valid. A single "does the feature work" E2E test misses it too, because the bug lives in the interaction between steps. In practice this caught a UI bug that only appeared on the *second* modal opened in a sequence, which no single-step test or manual happy path had surfaced.

**Test against the live backend, when the access model makes that safe.** If RLS is `using (true)` everywhere, a test-created row is no more exposed than any row already there, and testing the real thing catches what a mock cannot: actual query shapes, actual constraint violations, actual realtime propagation delay. Simulate separate devices with separate browser contexts (`browser.newContext()`) — anything kept in `localStorage` is shared inside one context and isolated across them, which is the guarantee two real phones would give you.

**Clean up by manifest, not by tagging.** When primary keys are generated UUIDs and lookup columns are hashed rather than plain, there is nothing free to prefix with a "test data" marker without changing the schema. Instead have the harness track what it creates, using the identifier it already holds, and at teardown re-derive the same lookup the app uses and delete directly:

```ts
export interface TestManifest {
  track(identity: GeneratedIdentity): void
}

async function cleanupIdentity(identity: GeneratedIdentity): Promise<void> {
  const lookupTag = deriveLookupTag(identity) // the app's own derivation — import it, don't copy it
  await supabase.from('main_table').delete().eq('owner_tag', lookupTag)
  await supabase.from('accounts_table').delete().eq('public_key', identity.publicKey)
}
```

**Chain steps on positive, waitable signals — never a fixed sleep.** Each step fires only once there's proof the previous one propagated: a value changing, an element appearing, a count moving. When the thing you care about has no signal of its own — "the fetch that would have populated an empty list finished" produces no marker when the list stays empty — wait on an *adjacent* signal known to complete alongside it, then assert the silent thing.

**Poll and read as one operation when a value passes through an intermediate state.** If a field shows "Generating…" on its way to a real value, checking "did it change?" and then reading it separately can land the read inside the placeholder window — the placeholder satisfies "changed" without being the answer. Re-read inside the assertion on every attempt so only a settled value passes:

```ts
let value = ''
await expect(async () => {
  value = await input.inputValue()
  expect(value).not.toBe(previousValue)
  expect(value).not.toBe('Generating…')
}).toPass({ timeout: NETWORK_TIMEOUT })
```

**Read the app's own debug log from the test.** The on-screen error capture built for phones with no console is a far better CI diagnostic than an assertion message: it holds the real thrown exception rather than "the click had no visible effect". Dumping it into the thrown error turns a silent timeout into a stack trace without a repro machine.

**What it does not do:**

- **It does not handle live background processes.** NPCs ticking, a scheduled job, another real user acting at the same time — there may be no stable settled state to wait for. That needs seeded randomness, a controllable clock, or a fake behind the nondeterministic part.
- **Live-database testing is only safe under the access-control condition above.** Against a backend with real per-user isolation, a cleanup bug or a mid-suite crash leaves residue exposed to real users.
- **It does not replace unit tests of pure logic.** It's for what unit tests structurally cannot reach, and it's far slower per assertion.
- **Manifest cleanup has no built-in proof it deleted anything.**

Two additions from reviewing it here, beyond what the originating project reported:

- **Exposure and pollution are different risks.** "No more exposed than any other row" is true, and separate from the fact that test rows are *live data*: if the app lists rows rather than fetching by id, test sessions appear in real users' UI. Check whether any screen enumerates before pointing a suite at production.
- **Fix cleanup drift by importing, not by verifying.** The stated gap — the harness's copy of the app's derivation silently going out of sync — can't be closed by re-querying after delete, since the check would use the same stale derivation and report success. **Import the derivation from the app's own source.** If it genuinely can't be imported, pin the two together with a unit test asserting both produce the same output for a fixed input; that fails loudly on the next change instead of orphaning rows in silence.

## What didn't work: screenshot-based PDF export (html2pdf.js)

The first Export PDF used html2pdf.js (html2canvas + jsPDF): it screenshots the rendered page
and slices the image into A4 pages. Two problems that can't be fixed in that approach:

- **Lines cut in half at page breaks.** The slicer cuts the image at fixed heights; `pagebreak`
  `avoid` rules only protect whole elements, and a paragraph longer than the gap still splits
  mid-line.
- **Garbled text on real machines** — inline `code` that wraps across lines (plus symbols like
  `∩`, `→`) rendered in the wrong place on Windows. html2canvas re-implements text layout and
  gets it wrong.

Also: text not selectable, ~1 MB of JS. **Use the browser's print engine instead** (hidden iframe
+ `print()`, `@page` for size/margins). Cost: one click on "Save as PDF" in the print window.

Testing it headlessly: patch the iframe's own `contentWindow.print` (it's a separate realm —
patching the parent's `Window.prototype` does nothing), capture its HTML, and render it with
Playwright's `page.pdf({ preferCSSPageSize: true })` from the app's origin in a context with
service workers blocked (otherwise the SW's navigate fallback serves the app instead).

## What didn't work: PDF via the browser's print dialog

The second Export PDF printed a hidden iframe (`print()`, user picks "Save as PDF"). Clean page
breaks and real text — but the user rejected it: an extra dialog step for what should be a
download, and on their machine the iframe's stylesheets didn't apply, so the PDF came out in the
browser's default serif. **Build the PDF in the page and download it** (pdfmake, see
`docs/system-design.md` §1c). Lessons from getting there:

- **pdfmake 0.3 can't read woff2** ("Cannot read properties of undefined (reading 'version')");
  `.woff` and `.ttf` work. Subset with fontTools, then save with `flavor = 'woff'`.
- **Font coverage decides the font**, not looks: Noto Sans (Latin subset) lacks ∩ → ∈ ≤ etc.;
  DejaVu Sans/Mono cover everything except ⨄ (which only appears inside math → MathJax paths).
- **`$$ … $$` on one line is an inline token** (`inlineKatex` with `displayMode: true`) in
  marked-katex-extension, not `blockKatex` — split the paragraph around it.
- **MathJax's `AllPackages` isn't what makes it big**; the SVG glyph data is (~600 KB gz either way).

## What didn't work: flat "glass" and emoji icons

The first glass pass (translucent pill + one highlight line + `color-mix` tint) read as rounded
old-macOS buttons, not glass. What sells glass is **layered light**: several inset shadows in the
button's own hue (lit top edge, glow pooling at the bottom), a glow cast *below* the element, a
moving specular streak, and a coloured backdrop to blur. Emoji icons (📂 💾 ⤓) render as bitmaps
and broke the look — keep labels as text, Unicode marks only.

**Raised bubble + dented bar, dropped for a recessed well.** The tab bar first had the active tab in
a glass bubble floating above the bar, pressing a dent (later a smooth valley) into the bar's top edge
(SVG path + `clip-path`). It looked good mid-bar, but at the bar's rounded ends the dent had to be
clamped away from the curve while the bubble stayed on its tab, so they misaligned — the user
suggested a well pressed *into* the bar instead, which has no such edge case and needs no path
geometry at all.

**`:global()` in a Vue scoped style swallows the rest of the selector.** Writing
`:global([data-theme='light']) .t-primary::after { opacity: .5 }` compiled to a rule on
`[data-theme='light']` alone — `<html>` — so the whole light theme rendered at 50% opacity. Put
theme differences in CSS variables (set per theme in `vars.css`) instead; components stay
theme-agnostic. After any theme work, check `getComputedStyle(document.documentElement).opacity`.

**Choosing the look from sketches worked.** After several rounds of tuning colours in the real app,
a canvas of nine full-app mockups (same layout, different palettes) let the user pick in one go:
Sage for dark, Porcelain for light.

**`Intl.Segmenter` won't start a sentence at a lowercase word.** "one two. three four." is one
sentence to ICU (the full stop could end an abbreviation); "One two. Three four." is two. Real
prose is fine, but test fixtures must capitalise sentence starts. Fenced code is split line by
line, so the focus engine treats a code block as a single sentence.

**Unconfirmed greedy alignment drifts on real documents.** Matching source words to preview
words "first equal word within 40" passed unit tests but failed on a long document: a formula's
`x` matched a later italic *x*, the pointer jumped ahead, and everything after lost its underline.
Requiring each match to be confirmed by the following words, and skipping math, fixed it. Test the
focus underline on a long, varied document (`docs/focus-shadow-showcase.md`), not just fixtures.

**A threshold slider feels non-linear; a width slider doesn't.** For the focus shadow, the
underline's reach is ≈ σ·√(−2 ln(1−I)). Sliding the bell's width σ moves it evenly; sliding the
threshold I jumps at the start and explodes near 1. So "intensity" became the width, with the
cut-off fixed at 0.4.

Headless screenshots catch colour transitions mid-flight: a button that just changed tone can
look wrong in a shot taken <0.25 s later. Wait out the transition before judging colour.

## Version History

### v0.10.0 — 2026-11-10
- **Added:** The theme canvas's looks, chosen from a menu beside Dark / Light; Dark / Light flips between the viewer's chosen dark and light look. Kept: Sage, Graphite, Midnight & Champagne, Navy & Brass (navy deepened), Porcelain, Fog; Original, Smoke & Sand and Monochrome were tried and dropped

### v0.9.0 — 2026-11-10
- **Added:** Lettered lists (`a)` `b)` / `A.` `B.`) in the preview and the PDF
- **Added:** PDF font choice — Sans, Serif (new DejaVu Serif subsets) or Mono — from a menu beside Export PDF; each export downloads only its font
- **Changed:** PDF code blocks: a subtle cream tint (`#fffbf4`, edge `#f2eadb`; sage off-white and stronger creams were compared and passed over) — a panel that wraps long lines and carries across page breaks; over-long tokens are split to fit. (A pale fill read as white; rounded corners — a pre-sized canvas, or a two-pass paint — were tried and dropped in favour of a tint that always applies cleanly.)

### v0.8.0 — 2026-11-09
- **Added:** Tab / Shift+Tab indent / outdent the selected block of lines (undoable)
- **Changed:** The focus starts off and its panel closed (settings key v4; scale, decay and lag carry over)
- **Changed:** Focus controls move to the top right of the Preview header: a Focus button (eye shows on/off, chevron) with a dropdown settings panel

### v0.7.0 — 2026-11-07
- **Changed:** Focus model rebuilt on the user's terms: a focal point emits a bell attention field (decay σ in words); a unit's attention is the field's average over it; the focus is the run holding 60% of the cumulative attention. Decay is tuned per scale (log slider); lag follows the cursor's path: the focal point is the unit the cursor was in L distinct units ago (a first version shifted it L units back in document order — not what the user meant). Live "N sentences in focus" counter. Nested ruler, fixed 0.4 cut-off and the shared 1–60 intensity removed — at intensity 1–4 nothing above the word scale moved, and paragraphs needed 30–60
- **Docs:** guide (now "Focus"), Help, system-design §1d, CLAUDE.md

### v0.6.0 — 2026-11-07
- **Changed:** Buttons are compact and matte (flat fill, hairline border, small radius; `--btn-*` tokens), replacing the liquid-glass buttons; sizes tightened again after a look on iPhone
- **Added:** Lucide icons (`@lucide/vue`) on buttons: `iconLeft` / `iconRight` + label in any mix; tab close / new and pane rails use them too. Unsaved shows as an amber Save icon and an amber tab name (an amber outline was tried and rejected), not ● dots. Picked over Iconoir after a side-by-side of 40 icons (Lucide 39/40, Iconoir 28/40)
- **Changed:** Tab bar is matte too (flat bar, flat springing fill under the active tab); the focus panel's dropdowns match the buttons
- **Docs:** CLAUDE.md, system-design, TODO

### v0.5.0 — 2026-11-07
- **Added:** Focus shadow — focus engine (`lib/focus/`), preview underline via CSS Custom Highlight API, Intensity / Distance / scale / Linear-Nested controls
- **Infrastructure:** `ES2022.Intl` types for `Intl.Segmenter`
- **Docs:** Help (focus shadow), system-design §1d, TODO

### v0.4.0 — 2026-11-06
- **Added:** Whole-app Dark (Sage) / Light (Porcelain) themes; Fraunces display face in Porcelain
- **Changed:** Liquid-glass buttons (one `UiButton`, hue-lit, hover sweep; new `tag` size; no emoji icons)
- **Added:** Liquid tab bar — a recessed, mint-outlined well that springs between tabs; names light up by distance
- **Docs:** CLAUDE.md, system-design styling, TODO

### v0.3.0 — 2026-11-05
- **Changed:** Export PDF downloads a real-text PDF directly (pdfmake); print-dialog export removed
- **Added:** Typeset display math in PDFs (MathJax SVG), DejaVu fonts, offline caching of export pieces
- **Infrastructure:** Vitest unit tests (`npm test`), run in the CI `build` job
- **Docs:** Help, README, CLAUDE.md, system-design §1c

### v0.2.0 — 2026-11-05
- **Changed:** Export PDF uses the browser print engine (clean page breaks, selectable text); html2pdf.js removed
- **Added:** LaTeX math (KaTeX); Light/Dark panel theme with off-white tones
- **Docs:** Help, README, CLAUDE.md, system-design updated

### v0.1.0 — 2026-11-05
- **Added:** Markdown editor — local-file tabs, split editor/preview with collapsible panes, Save / Save as, PDF export
- **Infrastructure:** Netlify (production + preview deploys); branch protection on `main` to follow
- **Docs:** README, CLAUDE.md, Help overview personalized

---

*Tip: When you abandon a branch or realize something didn't work, add a short "What didn't work" entry above so future-you (or a teammate) doesn't re-walk the same dead end.*
