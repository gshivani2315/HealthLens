# HealthLens Editorial Redesign — Iteration 2

## Visual refinements
- Strengthened the editorial visual identity with layered warm-neutral and sage gradients.
- Added restrained ambient background lighting, more deliberate hero typography, and refined surface shadows.
- Improved shared metric tiles with a subtle top accent that animates on hover.
- Added low-key decorative rings to selected cards and smoother table/alert hover feedback.
- Fixed the Google Fonts import so DM Serif Display, DM Sans, and IBM Plex Mono match the configured design tokens.
- Preserved existing routes, service calls, dashboard data, filters, patient navigation, and alert acknowledgment behavior.

## Run locally
From the extracted project root (the folder containing `package.json`):

```powershell
npm install
npm run dev
```

For a production build:

```powershell
npm run build
```

Build validation in the authoring workspace could not complete because dependencies are not installed and the environment could not resolve npm packages. Please run the commands above in a network-enabled local environment.
