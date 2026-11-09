# React component preview

The Umbrel package's live setup is static HTML in `container/`. This repository
now also has a separate Vite + React + TypeScript + Tailwind CSS frontend for
integrating and reviewing components. The supplied Dot Pattern demo is its entry
screen. The served setup page is generated from the approved glass design and the same
React DotPattern component, then committed as static HTML in `container/welcome.mjs`.
The Docker image needs no React runtime or frontend build step.

## Run

Use Node.js 24 LTS (the frontend requires Node 22.12 or newer):

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The demo includes a dark-mode toggle.

```sh
npm run build     # TypeScript check and production assets in dist/
npm run test:ui   # SVG instance isolation and provider-free demo rendering
npm run preview  # Inspect the production build locally
```

## Approved glass setup

`design/glass-setup/template.html` contains the approved T3 × Umbrel panel layout.
`scripts/render-glass-mockup.tsx` renders the actual DotPattern across its full
background, with 18% panel tint and 0.5px backdrop blur. It preserves the opaque
fallback and reduced-transparency treatment.

```sh
npm run mockup:glass # review-only design/glass-setup/preview.html
npm run build:setup  # regenerate container/welcome.mjs for the served setup page
```

Production generation removes mockup scripts and restores the real POST pairing
form, existing-workspace link, and T3 Connect setup link. CI checks the generated
page stays synchronized. Re-run `build:setup` after editing the template, renderer,
or DotPattern. Do not edit `container/welcome.mjs` by hand.

## Paths and shadcn

- `components/ui/dot-pattern.tsx`: supplied reusable component
- `components/ui/demo.tsx`: supplied demonstration
- `lib/utils.ts`: `cn`, using `clsx` and `tailwind-merge`
- `styles/globals.css`: Tailwind entry and shadcn-compatible theme tokens
- `frontend/main.tsx`: preview application
- `components.json`: shadcn registry configuration

The `@/` alias points to the repository root in both TypeScript and Vite, so
`@/components/ui` resolves to `/components/ui` inside this repository. There was
no default React component directory before this integration. Creating this folder
keeps component imports and the shadcn CLI in agreement, and gives reusable
primitives a predictable home. The folder name is a convention, not a React
requirement.

The project is configured already. Add future shadcn components with:

```sh
npx shadcn@latest add button
```

For a fresh project, the official CLI can scaffold Vite, TypeScript, and the
shadcn structure:

```sh
npx shadcn@latest init --template vite
```

For an existing Vite project, install React/TypeScript and Tailwind's Vite plugin,
configure the `@/` alias in TypeScript and Vite, import `tailwindcss` in the global
stylesheet, then run `npx shadcn@latest init`. This repository has those steps
implemented, including `@tailwindcss/vite` in `vite.config.ts`.

References: [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite),
[Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite).

## Component contract

`DotPattern` is a decorative SVG background. Defaults are a 24×24 pattern cell,
zero x/y offsets, a circle at (1, 0.5), and radius 0.5. Use `width`/`height` for
spacing, `cx`/`cy` for dot position, `cr` for dot radius, and `className` for color,
opacity, and masking. Extra SVG props pass through. The provided demo sets the
circle values to 1 and applies a radial mask.

It uses only React's `useId` hook. It needs no context provider, external data,
state manager, images, or icons. No stock imagery or icon package is needed.
Each instance creates its own pattern ID. The supplied component's TypeScript
`any` prop types and circle ID are retained as requested.

Place it inside a `relative overflow-hidden` container, behind content with
`relative z-10`. Its absolute dimensions follow that container; it does not set
its own height. The supplied demo uses a fixed 500px height, full available width,
and stronger dot fill from the `md` breakpoint onward. It is pointer-inert and
hidden from assistive technology.

For the proposed setup redesign, the natural placement is behind the welcome
content, below its glass panel. The approved setup now uses it across the entire background; the translucent
card sits above it. The standalone Vite demo remains available for component
development.
