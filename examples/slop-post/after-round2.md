Missing env vars get found in prod, so I built envcheck, a CLI to catch them.

It reads every process.env in your code and compares it to .env.example, so you find the missing ones before prod does.

It's a linter for your env vars.

[needs a real demo: clip or screenshot of envcheck catching a missing var, plus the repo link]
