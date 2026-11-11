# Lightweight mobile performance baseline

This is a small release baseline, not a Lighthouse scorecard. It protects the
**Living Sakura product path** with a static seed mark when
WebGL is unavailable.

## Verification profile

- Chromium, 375 × 812 CSS pixels
- reduced motion enabled for the accessibility pass
- **Living Sakura** selected as the product default (`gardenRenderer="living"`)
- Seed-mark demotion measured when WebGL fails (`LivingProductGarden` chain)
- experimental WebGL / img2threejs routes measured separately (non-product)
- no production journal text in screenshots or traces
- home dock is a single safe-area stack (no absolute On This Day / CTA collisions)

The Playwright smoke flow records the narrow viewport overflow check and runs
axe against the private landing screen. A release should also capture the
browser performance entries from the same profile:

```js
performance.getEntriesByType("navigation")[0]
performance.getEntriesByType("paint")
```

Record navigation response timing, first-contentful-paint when available,
document width versus viewport width, and the compressed size of initial CSS
and JavaScript. Keep the result with the staging verification report.

## Practical budgets

- No horizontal overflow at 375px.
- Living and experimental Sakura renderers remain dynamically split from server rendering.
- Living Sakura must demonstrate bounded rendering at 1, 193, 1,000, and
  10,000 journal events without a visible maturity cap.
- Paused garden mode unmounts living WebGL (archive/settings) to free GPU.
- Social preview asset remains below 300 KB.
- The browser flow must remain usable if WebGL initialization fails and the
  illustration (or seed-mark) fallback is shown — never a blank garden slot.
- Growth reveal must not mount a second living Canvas when `hostGarden` /
  AppFrame `revealMode` is active.

Runtime timing is intentionally measured by the staging browser flow rather
than by adding a new performance framework to the application.
