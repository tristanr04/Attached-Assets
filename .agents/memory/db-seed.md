---
name: DB seed execution approach
description: How to run seed scripts that need pg in this monorepo
---

## Rule
Run seed scripts from `lib/db/` directory where `pg` is in local `node_modules`:

```bash
cd /home/runner/workspace/lib/db && node --input-type=module << 'EOF'
import { Pool } from 'pg';
...
EOF
```

Do NOT place seed scripts in the workspace root `/scripts/` — `pg` is not in the root `package.json` and will fail with `ERR_MODULE_NOT_FOUND`.

Alternatively, run `pnpm --filter @workspace/db exec node --input-type=module` to use the db package's node_modules.

**Why:** pg is only installed in `lib/db/node_modules/` (via drizzle's peer dep). The workspace root doesn't have it.

**How to apply:** Any time seeding or running one-off DB scripts, cd to lib/db first or use the filter flag.
