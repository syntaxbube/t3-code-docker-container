# Approved glass setup

The selected design combines T3 Code's native pairing layout with Umbrel's
rounded panel and white login action. The dot pattern covers the full background;
the panel uses an 18% neutral tint and 0.5px blur so the pattern remains visible.
Inputs keep a stronger fill, and reduced-transparency mode uses an opaque panel.

`template.html` contains the layout and compiled UI styles. To update:

```sh
npm ci
npm run mockup:glass # optional review-only preview.html
npm run build:setup # generated production container/welcome.mjs
```

The renderer uses `components/ui/dot-pattern.tsx`, restores real pairing and
navigation routes, and removes preview-only scripts. The container serves static
HTML and needs no additional React runtime.

Design references:

- T3 Code v0.1.7: `apps/web/src/index.css`, `components/ui/button.tsx`,
  `components/ui/input.tsx`, `HostedEmptyState.tsx`, `ConnectOnboardingDialog.tsx`
  in https://github.com/pingdotgg/t3code (MIT).
- Umbrel: `packages/ui/src/modules/auth/login-form.tsx`,
  `layouts/bare/onboarding-page.tsx`, `components/ui/shared/material.ts`, and
  `index.css` in https://github.com/getumbrel/umbrel. Visual reference only;
  the wallpaper used during exploration is not included.
- Inter font: SIL Open Font License; see INTER-LICENSE.txt.
- Unslop methodology by Damir Sokolovsky (@heydamir), CC BY 4.0:
  https://heydamir.design/unslop

The advocate/skeptic review kept the centered identity and white primary action,
reduced the icon and heading spacing, clarified the app password vs Umbrel login
password, and retained the visible T3 Connect action and Basic Auth username hint.
