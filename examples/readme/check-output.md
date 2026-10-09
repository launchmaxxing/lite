# /lm-lite:check on this README

A real run, 2026-10-10, Claude Code 2.1.296, headless, on the README as of commit `1df710f`:

```
claude -p "/lm-lite:check README.md" --plugin-dir <path to lite> --permission-mode acceptEdits --max-budget-usd 3
```

8 turns, $0.47. The README is over 40 lines, so it got a fix list and no fixed copy. Below is the reply exactly as it came back, then the critic's own report (its file heading shortened from an absolute scratch path).

The critic called one line untrue: that GitHub only shows star dates to a repo's owner. It is true as of 2026-10-09 (the stargazer API returns 404 for repos you don't own), and the main agent pushed back using the comment in `scripts/star-curve.mjs`. The critic only sees the draft, so its knowledge of an API can be out of date. Since this run, `/lm-lite:check` checks the author's own files before passing on an "untrue" flag.

What changed in the README after this run: the star-date line now says "now" and gives the date, the critic description says "reads drafts as", and the views cell says what the comparison shows. slop-lint on the README was clean before and after.

---

Verdict: REVISE    Score: 4/10 (the critic's score, held down by one claim it called untrue. It said the README is an 8 without that claim.)
slop-lint: clean
Weakest line: L97 "GitHub only shows star dates to a repo's owner, so run it on your own repo."

Fixes
- L97 "GitHub only shows star dates to a repo's owner, so run it on your own repo."  critic: flagged as untrue. It says star dates are public for any public repo through the `star+json` header.
  -> "GitHub now only shows star dates to the owner, so run it on your own repo."
  I'm not sure the critic is right. Your own code says the opposite: `scripts/star-curve.mjs:87` notes that GitHub has returned 404 on stargazer lists of repos you don't own since 2026-10-09. The critic didn't have that file, and its knowledge of the API may be out of date. I tried one read-only `gh api` call on a repo you don't own to settle it, but it needed approval I didn't have. If your 404 still happens, the line is true. The "now" in the rewrite tells readers this is a recent change, so it heads off the "that's wrong" reply. If the 404 doesn't happen, cut the sentence.
- L11 "breakscale on X: a friend's own video of the app vs my launch post. Read 2026-10-09."  critic: vague claim. Readers can't tell what this column proves, and "Read" is unclear.
  -> "breakscale on X: a friend's video of the app vs my launch post, as of 2026-10-09."
  The critic also wants one plain line saying what you learned from the friend's video getting about 3.5x your views. It won't write that line for you, and neither will I.
- L89 "It reads like a senior developer scrolling X with a thumb on mute."  critic: unclear. As written, it says the critic *sounds* like a dev, not that it reads drafts the way one would.
  -> "It reads drafts as a senior dev scrolling X with a thumb on mute."

Keep: L3 "Find the lines in your launch post that read like AI wrote them…" opens on the reader's worry, not on you. L30 "The after still says REVISE… The demo is yours to record." Admitting the tool didn't get a perfect score is the most convincing line in the README. L116 to L119 do the same job.
Next: Post after the fixes. First check whether the L97 claim still holds, since it decides between a 4 and an 8.

The critic couldn't check the numbers on L9 or "132 places" on L123 because it had no receipts. Make sure they're right before you ship. The draft is over 40 lines, so you get the fix list only and I didn't write a fixed copy.

```
clean: 1 file(s)
```

Rules for 132 places to launch, checked from each place's rules page: launchmaxxing.co

---

## The critic's report (lm-lite:cringe-critic)

```
## README.md
Verdict: REVISE
Score: 4/10 (capped by one BLOCKER. With L97 fixed it's an 8.)
Weakest line: L97 "GitHub only shows star dates to a repo's owner, so run it on your own repo."

Flags:
- L97: "GitHub only shows star dates to a repo's owner, so run it on your own repo." -> BLOCKER, untrue. Star dates are public for any public repo. The stargazers API returns `starred_at` with the `application/vnd.github.star+json` header, and star-history.com runs on any repo. A dev who knows this will reply with a link and doubt the rest of the README. If the script really is owner-only, give the real reason. If not, drop the claim.
  Rewrite: "Run it on your own repo." (or "needs the real reason here" if there is one)
- L9/L11, middle column: "195,162 vs 54,783 views" / "breakscale on X: a friend's own video of the app vs my launch post. Read 2026-10-09." -> Vague claim. It isn't clear what this proves. Your own post lost to a friend's video by about 3.5x, and the reader has to guess the takeaway. L13 also says "Those are my launches", but this cell is mostly someone else's post. "Read 2026-10-09" is cryptic. This needs one plain line on what the comparison shows, and I won't write that line for you. Tighter wording for the cell:
  Rewrite: "breakscale on X: a friend's video of the app vs my launch post, as of 2026-10-09."
- L89: "It reads like a senior developer scrolling X with a thumb on mute." -> Over-explaining / clarity. "Reads like" means "sounds like". As written, the critic sounds like a dev. You mean it reads drafts the way a dev would.
  Rewrite: "It reads drafts as a senior dev scrolling X with a thumb on mute."

Not flagged:
- The tables and slop-lint block are quoted examples.
- L85 is dense, but it's README docs and every sentence carries a fact.
- I couldn't check the numbers on L9 and the "132 places" on L123 because no receipts or LAUNCH.md were provided. Confirm them before shipping.

Keep:
- L3 "Find the lines in your launch post that read like AI wrote them, and fix them in your own voice before anyone replies "slop"." It opens on the reader's fear, not on you.
- L30 "The after still says REVISE... The demo is yours to record." Admitting the tool didn't get a perfect score is the most convincing line here. L116 to L119 do the same job.

Next: Post after fixes. Correct or cut the L97 claim, and say in one line what the 195,162 vs 54,783 column proves.
```
