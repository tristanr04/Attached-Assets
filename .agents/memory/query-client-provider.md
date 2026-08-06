---
name: QueryClientProvider placement in Clerk+React apps
description: Design subagent tends to omit QueryClientProvider; Clerk's ClerkQueryClientCacheInvalidator calls useQueryClient() and will crash without it
---

## Rule
Always verify `App.tsx` wraps everything in `QueryClientProvider` OUTSIDE `ClerkProvider`. The component `ClerkQueryClientCacheInvalidator` (which calls `useQueryClient()`) lives inside `ClerkProvider`, so `QueryClientProvider` must be an ancestor of `ClerkProvider`.

Correct nesting order:
```
QueryClientProvider
  ThemeProvider
    TooltipProvider
      WouterRouter
        ClerkProvider
          ClerkQueryClientCacheInvalidator  ← needs useQueryClient()
          routes...
```

**Why:** The design subagent builds Clerk+React apps but consistently omits the `QueryClientProvider` wrapper, causing a runtime crash: "No QueryClient set, use QueryClientProvider to set one".

**How to apply:** After any design subagent run on a Clerk+React app, check `App.tsx` for `QueryClientProvider` wrapping. If absent, add `QueryClient` instantiation at module level and wrap the root with `<QueryClientProvider client={queryClient}>`.
