# Rollback

Baseline tag: `v0.1-lovable-baseline` (last state before Milestone M2).

1. `git fetch --all --tags`
2. `git switch -c rollback/m2 v0.1-lovable-baseline` — never rewrite history on `main`.
3. `npm ci && npm run build` to confirm the baseline still builds.
4. Open a PR from `rollback/m2` into `main` (revert commit, not a force-push).
5. Restart the local agent (`cd agent && npm start`); the baseline agent config ships its
   own ECU map, so no regeneration is needed.
