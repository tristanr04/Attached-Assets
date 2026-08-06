---
name: Zod v4 Orval fix
description: orval 8.23.0 generates zod.int() which is the zod v4 API but the workspace has zod@3.x as the main export
---

## Rule
After every `pnpm --filter @workspace/api-spec run codegen` run, the generated `lib/api-zod/src/generated/api.ts` must import from `zod/v4` not `zod`:

```bash
sed -i "s/^import \* as zod from 'zod';/import * as zod from 'zod\/v4';/" lib/api-zod/src/generated/api.ts
```

The `lib/api-spec/package.json` codegen script already includes this sed fix — do not remove it.

**Why:** orval 8.23.0 uses the zod v4 API (`zod.int()`, `zod.url()`, etc.) but the catalog has `zod@3.25.76` as the main package. The `zod/v4` sub-path export is the compatibility shim that exposes v4 API from a v3 install.

**How to apply:** Runs automatically via the codegen script. If schema types change, re-run codegen and the sed fix runs automatically.
