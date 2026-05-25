This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Location search & autocomplete (Mapbox)

The Locations page uses a server-side Mapbox Geocoding integration (`/api/location-search`) for enterprise-grade autocomplete and coordinate capture.

### Why Mapbox
- Reliable global geocoding + autocomplete with production-grade SLA support
- Generous free tier and clear pay-as-you-go scaling model
- Fast low-latency autocomplete suitable for SaaS UX
- Commercial usage supported

### Required environment variable

```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
```

Keep this key server-side only (the app calls Mapbox through a Next.js API route).

### Notes
- The API route applies HTTP cache headers to reduce provider load.
- Apply rate limiting at your edge/proxy layer (or distributed store like Redis/KV) for horizontally scaled/serverless production.
- The client autocomplete uses debounce, request cancellation, retry-on-transient-failure, keyboard navigation, and local query-result caching.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
