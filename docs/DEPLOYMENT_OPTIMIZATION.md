## Deployment Performance Snapshot – 2025-11-09

**Command:** `bun run deploy`  
**Total time:** 104.26s (see `scripts/deploy.sh` timing output)

| Step                              | Duration |
|-----------------------------------|---------:|
| Ensuring workspace dependencies   | 0.21s    |
| **Building web image**            | **103.01s** |
| Recreating web service            | 0.58s    |
| Running DB migrations             | 0.18s    |
| Services status                   | 0.06s    |
| Health check                      | 0.21s    |

### Bottleneck
The Docker image build dominates the deploy (∼99% of total time). Most of that time is spent running `bun run build` inside the container, which in turn runs Next.js linting, type-checking, and page generation every time.

### Optimization Plan
1. **Enable cached Docker builds by default**  
   - Remove the unconditional `--no-cache` flag from `docker-compose build`.  
   - Add an opt-in `--clean`/`--no-cache` flag to `bun run deploy` for rare reproducible builds.  
   - Expected impact: skip redundant dependency reinstallations and layer rebuilds when the app code does not change, saving multiple seconds on routine deploys.

2. **Move lint/type-check out of the production build path**  
   - Update `apps/web/next.config.js` to skip ESLint and TS checks during `next build`.  
   - Introduce `bun run typecheck`/`bun run verify` scripts so validation can run on demand (CI or pre-deploy) without blocking every container build.  
   - Expected impact: remove the 15–20s lint/type-check phase from each Docker build, keeping production deploys focused on asset compilation.

These changes keep the documented `bun run deploy` entrypoint intact while leveraging Bun tooling for the “verify” workflow and Docker layer caching for faster, iterative releases. Clean-room builds remain available via the new flag when required.

### Post-Optimization Measurements (2025-11-09)

| Scenario                                   | Build Step | Duration | Notes |
|--------------------------------------------|-----------:|---------:|-------|
| Fresh build after changes                  |  Building web image  | 82.55s | No cache hit (app code changed) but lint/type-check skipped, saving ~20s. |
| Cached redeploy (no code changes)          |  Building web image  | 7.54s  | Docker cache reuses all layers; deploy completes in 7.88s total. |

Quality checks now run via `bun run verify`, so linting/type safety remains available without slowing production deploys.
