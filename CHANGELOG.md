# Changelog

## Unreleased

- `slop-lint` now lints post text inside fences. It skips only fences tagged with a code language (```` ```sh ````, ```` ```json ````...); untagged, `text` and `md` fences are linted, and `--count` counts only those. Before, every fenced block was skipped, so a post kept in a fence was never checked.

## 0.1.0 (unreleased)

First version.

- `/lm-lite:check`: runs slop-lint and the cringe-critic agent on any draft, a file or pasted text. Returns a verdict, a 1 to 10 score, the weakest line and rewrites in the author's voice. Short drafts get a fixed copy that is linted again.
- `/lm-lite:card`: a 1200x675 star card (PNG and SVG) from a repo's real stargazer dates, with markers for when you posted. The small launchmaxxing.co mark is on by default; `--no-mark` removes it.
- Both skills can start on their own when you ask things like "is this tweet cringe" or "make a chart of my stars".
- `scripts/slop-lint.mjs`, `scripts/star-curve.mjs`, `data/slop-phrases.txt` and `agents/cringe-critic.md`, the same files the paid Launchmaxxing kit uses.
- `evals/evals.json` with 6 cases and 10 trigger checks, and `evals/check.mjs` to score a run.
- `examples/`: real runs of `/lm-lite:check` on a slop-heavy post and on this repo's README.
