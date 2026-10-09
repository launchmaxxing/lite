# /lm-lite:check on before.md

A real run, 2026-10-10, Claude Code 2.1.296, headless:

```
claude -p "/lm-lite:check examples/slop-post/before.md" --plugin-dir <path to lite> --permission-mode acceptEdits
```

7 turns, $0.42. The fixed copy it wrote is [after.md](after.md). Below is the reply exactly as it came back, then the critic's own report. The only edit is the critic's file heading, shortened from an absolute scratch path.

---

**Verdict: REVISE    Score: 2/10** (the critic ran as a separate agent)
**slop-lint:** 21 hits
**Weakest line:** L3 "In today's fast-paced world, shipping with a missing env var is a journey nobody wants. That's why I built a seamless, robust, cutting-edge CLI that empowers you to unlock bulletproof deploys effortlessly."

**Fixes**
- L1 "🚀 Excited to announce envcheck - the game-changer every developer needs! 🔥": slop-lint flags the phrases (🚀, excited to announce, game-changer, 🔥) and the spaced hyphen. The critic says it talks about you before it gets to the reader's problem.
  -> "Nobody wants to ship with a missing env var, so I built a CLI for it: envcheck."
- L3 "In today's fast-paced world, … unlock bulletproof deploys effortlessly.": slop-lint flags 10 phrases (fast-paced world, journey, seamless, robust, cutting-edge, empowers, unlock, effortlessly). The critic calls it hype with nothing under it, and "bulletproof" is a claim the tool can't back up.
  -> cut. The pain and the "I built a CLI" part now sit in L1.
- L5 "compares it to .env.example -- so you find": slop-lint flags the spaced hyphen, which is doing a dash's job.
  -> "It reads every process.env in your code and compares it to .env.example, so you find the missing ones before prod does."
- L7 "It's not just a linter. It's a paradigm shift.": slop-lint flags "not just a" and "paradigm shift". The critic calls it the textbook "not X, it's Y" pattern. "Linter" is actually the right comparison.
  -> "It's a linter for your env vars."
- L9 "Let that sink in. 👇": slop-lint flags the phrase and 👇. The critic calls it engagement bait that points at nothing.
  -> "[needs a real demo: clip or screenshot of envcheck catching a missing var, plus the repo link]"
- L11 "Like and RT if a missing .env has ever ruined your Friday!!! ✨": slop-lint flags the exclamations (4 in the post) and ✨. The critic calls it engagement bait.
  -> "Has a missing .env ever ruined your Friday?" The critic wanted this line cut, but the Friday pain is real, so I kept it as a plain question.

**Keep:** L5 "…so you find the missing ones before prod does." It's the only line that says what the tool does, and "before prod does" is a good turn of phrase.

**Fixed draft:** `.launchmaxxing-lite/drafts/before-fixed.md`, slop-lint after fixes: clean

**Next:** Post the fixed version only after you replace the L9 placeholder with a real clip and the repo link. The demo is what gets people to click, and this draft doesn't have one yet.

```
examples/slop-post/before.md  exclamations   4 exclamation marks, keep it to 2 or fewer
examples/slop-post/before.md:1:1  phrase         "🚀" (🚀)
examples/slop-post/before.md:1:4  phrase         "Excited to announce" (excited to announce)
examples/slop-post/before.md:1:32  spaced-hyphen  "-" used as a dash
examples/slop-post/before.md:1:39  phrase         "game-changer" (game-changer)
examples/slop-post/before.md:1:75  phrase         "🔥" (🔥)
examples/slop-post/before.md:3:1  phrase         "In today's fast-paced" (in today's fast-paced)
examples/slop-post/before.md:3:12  phrase         "fast-paced world" (fast-paced world)
examples/slop-post/before.md:3:67  phrase         "journey" (journey)
examples/slop-post/before.md:3:110  phrase         "seamless" (seamless)
examples/slop-post/before.md:3:120  phrase         "robust" (robust)
examples/slop-post/before.md:3:128  phrase         "cutting-edge" (cutting-edge)
examples/slop-post/before.md:3:150  phrase         "empowers" (empowers)
examples/slop-post/before.md:3:166  phrase         "unlock" (unlock)
examples/slop-post/before.md:3:193  phrase         "effortlessly" (effortlessly)
...
21 hits in 1 file(s)
```

Rules for 132 places to launch, checked from each place's rules page: launchmaxxing.co

---

## The critic's report (lm-lite:cringe-critic)

```
## examples/slop-post/before.md
Verdict: REVISE
Score: 2/10
Weakest line: L3 "In today's fast-paced world, shipping with a missing env var is a journey nobody wants. That's why I built a seamless, robust, cutting-edge CLI that empowers you to unlock bulletproof deploys effortlessly."

Flags:
- L1: "🚀 Excited to announce envcheck - the game-changer every developer needs! 🔥" -> Talking about yourself before the reader's problem / hype. It opens with the author's excitement and "game-changer", and the emoji on both ends reads like an ad. Open with the pain instead.
  Rewrite: "Finding out an env var is missing after you deploy to prod is the worst way to find out."
- L3: "In today's fast-paced world, shipping with a missing env var is a journey nobody wants." -> AI tell. "In today's fast-paced world" and "journey" are stock filler. The pain is already in L1 now, so this sentence can go.
  Rewrite: cut
- L3: "That's why I built a seamless, robust, cutting-edge CLI that empowers you to unlock bulletproof deploys effortlessly." -> Hype with nothing under it / corporate voice. Five adjectives stacked for rhythm, plus "empowers" and "unlock". "Bulletproof" is a claim the tool can't back up, since it catches one class of bug.
  Rewrite: "So I built envcheck, a CLI that catches them before you deploy."
- L5: "compares it to .env.example -- so you find" -> AI tell (the slop-lint spaced-hyphen hit). The double hyphen is doing an em dash's job. Use a comma.
  Rewrite: "It reads every process.env in your code and compares it to .env.example, so you find the missing ones before prod does."
- L7: "It's not just a linter. It's a paradigm shift." -> AI tell / unearned claim. This is the "not just X, it's Y" pattern word for word. "Linter" is actually the right comparison, so use it straight.
  Rewrite: "Basically a linter for your .env."
- L9: "Let that sink in. 👇" -> AI tell / engagement bait. It points at nothing. Use this slot to show the tool running.
  Rewrite: replace with a short terminal clip or screenshot of envcheck flagging a missing var, plus the repo link (needs the real link and install command here)
- L11: "Like and RT if a missing .env has ever ruined your Friday!!! ✨" -> Engagement bait. A "like and RT if" line, three exclamation marks (four in the post, per slop-lint) and a sparkle. It's the line most likely to get a mocking quote-tweet.
  Rewrite: cut

Keep: L5 "It reads every process.env in your code and compares it to .env.example, so you find the missing ones before prod does." (once the dash is fixed). It's the only line that says what the tool does and why that matters, and "before prod does" is a good turn of phrase. The ".env ruined your Friday" idea from L11 is a pain every dev knows, but only use it if it really happened to you.

Next: Rewrite from the pain sentence. With the fixes the post is roughly L1, the "So I built envcheck" line, L5, "Basically a linter for your .env.", then the demo clip and link. The demo is what will make people click, and the draft doesn't have one yet.
```

---

## Round 2: /lm-lite:check on after.md

Same setup, run on the fixed copy. 6 turns, $0.34. It wrote [after-round2.md](after-round2.md). Note that round 1 kept the closing question against the critic's advice, and round 2's critic flagged it again. Reply exactly as it came back:

```
Verdict: REVISE    Score: 6/10
slop-lint: clean
Weakest line: L9 "Has a missing .env ever ruined your Friday?"

Fixes
- L1 "Nobody wants to ship with a missing env var, so I built a CLI for it: envcheck."  critic: the vague pain plus a colon that sets up the name as a reveal
  -> "Missing env vars get found in prod, so I built envcheck, a CLI to catch them."
- L7 "[needs a real demo: clip or screenshot of envcheck catching a missing var, plus the repo link]"  critic: no proof and nothing to click; posted like this, it scores 3
  -> [needs a real demo: clip of envcheck catching a missing var, plus the real repo link]
- L9 "Has a missing .env ever ruined your Friday?"  critic: engagement bait, the usual devtool closing question
  -> cut it. The post ends at L7.

Keep: "It's a linter for your env vars." explains the tool in six words by comparing it to one everyone knows. L3 "compares it to .env.example, so you find the missing ones before prod does" says exactly what it does.
Fixed draft: .launchmaxxing-lite/drafts/after-fixed.md, slop-lint after fixes: clean
Next: Post after the fixes, but only once L7 has a real clip and the repo link.
```

The critic's version of L1 said env vars "only show up once prod breaks", which claims more than the draft does. I changed it to "get found in prod" to match L3's "before prod does". slop-lint can't catch the colon reveal in L1 or the bait question in L9, so it came back clean while the critic still scored the draft 6.

```
clean: 1 file(s)
```

Rules for 132 places to launch, checked from each place's rules page: launchmaxxing.co
