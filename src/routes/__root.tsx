import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import faviconAsset from "../assets/favicon.png.asset.json";
import ngLogoAsset from "../assets/ngplus_logo.png.asset.json";
import { reportLovableError } from "../lib/lovable-error-reporting";

// ---------------------------------------------------------------------------
// Site identity. One brand name everywhere: "NG+ Game Trailers". "NG+" alone
// reads as New Game Plus and "Trailers" alone as the towing kind, so the full
// name carries "Game" every time. Other spellings people use go in
// alternateName below rather than in visible copy.
// ---------------------------------------------------------------------------
const SITE_URL = "https://ngplustrailers.com";
const SITE_NAME = "NG+ Game Trailers";
const PAGE_TITLE = "NG+ Game Trailers | Indie Game Trailer Studio in Vancouver";
const SOCIAL_TITLE = "NG+ Game Trailers — Take Your Game To The Next Level";
const DESCRIPTION =
  "Vancouver trailer studio for indie games: Steam page trailers, reveal and launch trailers, festival cuts and publisher pitch videos.";

// Same five services and copy as the Services grid in src/routes/index.tsx
// (names spelled out in full here). Change both or neither.
const SERVICES = [
  {
    name: "Steam Page Trailers",
    description: "Optimized for the “scroll-and-watch” behavior of Steam users.",
  },
  {
    name: "Reveal & Launch Trailers",
    description: "High-impact pieces designed to get attention and drive wishlists/sales.",
  },
  {
    name: "Festival Cuts",
    description: "Snappy edits for showcase Steam events and seasonal fests.",
  },
  {
    name: "Publisher Pitch Videos",
    description: "Videos that prove your mechanics, loop, and market viability.",
  },
  {
    name: "Trailer Strategy",
    description: "Analysis of your game's hooks and the best way to frame them.",
  },
];

// No price in here on purpose: publishing the starting price is still an
// open decision. Add an Offer price only once it is on the visible page too.
const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ["NG+ Trailers", "NG Plus Game Trailers"],
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}${ngLogoAsset.url}`,
  email: "hello@ngplustrailers.com",
  description:
    "Vancouver-based trailer studio making Steam page trailers, reveal and launch trailers, festival cuts and publisher pitch videos for indie game developers.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Vancouver",
    addressRegion: "BC",
    addressCountry: "CA",
  },
  areaServed: "Worldwide",
  knowsAbout: ["Game trailers", "Steam page trailers", "Steam festivals", "Indie game marketing"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Game trailer services",
    itemListElement: SERVICES.map((s) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: s.name,
        description: s.description,
        serviceType: "Video production",
        provider: { "@id": `${SITE_URL}/#organization` },
      },
    })),
  },
};

const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  alternateName: "NG+ Trailers",
  url: `${SITE_URL}/`,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "ldG_V-Xc_lfjubLILrxyYxvmrjc951klmz4jeM9cpn0" },
      { title: PAGE_TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SOCIAL_TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SOCIAL_TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:image:alt", content: "NG+ Game Trailers — indie game trailer studio" },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      { rel: "icon", type: "image/png", href: faviconAsset.url },
      { rel: "apple-touch-icon", href: faviconAsset.url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(ORGANIZATION_LD),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(WEBSITE_LD),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
