# CLAUDE.md — NGPLUS_TRAILERS_website

ngplustrailers.com: NG+ Trailers' one-page portfolio/contact site. Frontend-only,
prerendered to static HTML, served from Namecheap shared hosting. Originally
built in Lovable (July 2026); Lovable is no longer in the loop except for inert
plumbing (`@lovable.dev/vite-tanstack-config`, the `__l5e` asset-folder naming,
`src/lib/lovable-error-reporting.ts`).

## Stack

- TanStack Start (React) on Vite via `@lovable.dev/vite-tanstack-config`,
  Tailwind, shadcn/ui components in `src/components/ui/`.
- Single route: `src/routes/index.tsx` (hero, work grid + video modal, services,
  about, contact form). `<head>` metadata (title, description, og/twitter,
  Organization + WebSite JSON-LD) lives in the `head()` of
  `src/routes/__root.tsx`, driven by the site-identity constants at the top of
  that file.
- The Services copy exists twice on purpose: the grid in `index.tsx` and
  `SERVICES` in `__root.tsx` (feeds the JSON-LD). Change both or neither.
- Decorative terminal flavor text ("PRESS ANY KEY TO BEGIN", "SYSTEM STANDBY",
  `> OUR_WORK_SELECTED`, the LAUNCH_TRAILER-style tags) is drawn by CSS from a
  `data-text` attribute (`.deco-text` in `src/styles.css`) with
  `aria-hidden="true"`. People see the same page; crawlers and AI agents read
  only the real content. Any new flavor text goes on that pattern. Where a tag
  carries a fact (trailer type), the same fact is in plain words inside the h3
  as an `sr-only` span (`kind` next to `tag` in the work array; keep in step).
- Contact form POSTs to `public/api/contact.php` (v1.3; PHP on the host; logs
  every submission to `~/contact-submissions.log` above the docroot, then
  `mail()`s `brian@ngplustrailers.com` From `noreply@ngplustrailers.com`).
  Before v1.3 (Nov 16 2026) it mailed `hello@`, which nobody read until it was
  forwarded that same day. The log was checked: one real enquiry had come in
  (Sep 1) and is an HQ task. Known gap: `CONTACT_ORIGINS` has no default, so
  the same-origin check is skipped.
- Static assets are referenced through `src/assets/*.asset.json` files whose
  `url` points under `public/__l5e/assets-v1/<uuid>/<file>`. To swap an asset,
  change the JSON (and the file), not the TSX.

## Build and deploy

- `npm run build` → `dist/client` (deployable) + `dist/server` (prerender
  byproduct, never leaves the machine). `nitro` is deliberately disabled in
  `vite.config.ts`; the comment there documents the three-day incident behind it.
- Deploy ONLY with `deploy.ps1` (v3.0, repo root):
  `powershell -ExecutionPolicy Bypass -File .\deploy.ps1 [-DryRun] [-SkipBuild] [-WithMedia] [-PruneAssets] [-Force]`
  - Routine deploy ships ~1 MB of code. `-WithMedia` adds `__l5e` (untarred,
    ungzipped) — pass it whenever anything under `public/__l5e` changed.
  - Non-destructive: files unpack over the top; nothing on the server is
    deleted unless `-PruneAssets` (clears remote `assets/` only).
  - NEVER combine `-PruneAssets` with a deploy that ships a new `index.html`
    (Jul 25 incident: clients holding old HTML lost their CSS/JS).
  - Fatal consistency gate: every asset `index.html` references must exist in
    `assets/`. Not overridable.
  - Config via env vars, defaults in the script: `NGP_SSH_HOST` 198.54.116.242,
    `NGP_SSH_USER` ngplus, `NGP_SSH_PORT` 21098, `NGP_REMOTE_DIR`
    /home/ngplus/public_html.
- `public/.htaccess` is REPO-OWNED and overwritten on every deploy. Any server
  config (SetEnv, cache rules, redirects) goes in that file in the repo, never
  edited live. It carries: `Options -Indexes`, the X-Forwarded-Proto-guarded
  https 301, the acme-challenge exemption, SPA fallback, and immutable caching
  for hashed assets + versioned video.
- Claude can verify a build in its own container (npm install + build on a
  copy). The Lovable config binds the prerender preview server to `::`, which
  fails in an IPv6-less sandbox; use a container-only config that adds
  `vite: { preview: { host: "127.0.0.1" } }`. Never ship that config.

## Mail (cPanel on server233, records in Namecheap Advanced DNS)

- MX `server233.web-hosting.com`; SPF `v=spf1 include:spf.web-hosting.com ~all`;
  DKIM selector `default` (cPanel's key); DMARC TXT at `_dmarc` is
  `p=quarantine` (since Nov 16 2026), aggregate reports to
  `brian@ngplustrailers.com`. It is cPanel mail on the hosting server, not
  Namecheap Private Email.
- `brian@` is a cPanel forwarder to Brian's Gmail; the server re-signs
  forwarded mail as `d=ngplustrailers.com`. `hello@` (the footer mailto) is its
  own mailbox and, since Nov 16, also forwards to the same Gmail. The messages
  from before then are still unread in the mailbox (HQ task).
- The form's From must stay on the bare domain: `www.ngplustrailers.com` has
  no SPF record and no DKIM key, so a From there fails DMARC.
- deploy.ps1's probe is a real submission, so every deploy drops a "Website
  enquiry" from `deploy-probe@example.com` into Gmail. That is the mail path
  working, not a lead.

## Hosting topology (load-bearing)

- Origin: LiteSpeed on 198.54.116.242 (cPanel account `ngplus`), docroot
  `~/public_html`. `www` A-record points straight at it.
- Apex `ngplustrailers.com` A-record points at Namecheap's APISIX edge proxy,
  which terminates TLS with the paid SSL.com cert and caches HTML. Removing it
  ("step 4") requires reshipping `.htaccess` with an https guard that works
  without `X-Forwarded-Proto` — the current rule only matches behind a proxy.
- Origin cert: Let's Encrypt via acme.sh, auto-renewed by cron, deployed with
  the `cpanel_uapi` hook (`--ecc` required on a manual redeploy).
- Probe the origin with `curl --resolve ngplustrailers.com:443:198.54.116.242`.

## Media

- Masters (16–31 Mbps delivery exports, 4K60/1080p60, ~790 MB) live in
  `media-masters/` — gitignored, outside `public/`, never deployed. They are the
  source for any future re-encode or a move to a video host (Bunny Stream etc.).
- Served video under `public/__l5e` is web-encoded: 1080p60 H.264 High, CRF 21,
  maxrate 7.5 Mbps / bufsize 15 Mbps, GOP 120, AAC 160k stereo, `+faststart`.
  Hero (`hero-bg.v2.mp4`): 1080p30, CRF 23, maxrate 2.5 Mbps, no audio.
  Recipe:
  `ffmpeg -i IN -map 0:v:0 -map 0:a:0? -dn -sn [-vf scale=-2:1080:flags=lanczos] -c:v libx264 -profile:v high -level 4.2 -pix_fmt yuv420p -preset medium -crf 21 -maxrate 7500k -bufsize 15000k -g 120 -c:a aac -b:a 160k -ac 2 -ar 48000 -movflags +faststart OUT.vN.mp4`
- Video filenames carry a version suffix (`.v2.mp4`) because `.htaccess` caches
  mp4 immutably for a year. A re-encode is a NEW filename + a JSON `url` update;
  never overwrite an existing served name.
- The work-grid modal is `max-w-5xl` (1024 CSS px): 1080p is the ceiling worth
  serving; 4K is wasted bandwidth.
- Hosting reality: one shared LiteSpeed box, no CDN, single-bitrate progressive
  MP4. If buffering comes back at these bitrates, the next step is adaptive HLS
  off-box (Bunny Stream ≈ $1/mo), not a higher bitrate here.

## AI search visibility (started Nov 18 2026, homepage pass live Nov 19)

- Goal: get the site returned by AI tools for "make a game trailer" and
  "Steam trends" questions. Where they look: Claude's web search runs on Brave
  (which only crawls what Googlebot can), ChatGPT search leans heavily on
  Bing's index plus OpenAI's own crawler, Gemini/AI Overviews on Google.
- AI crawlers do not run JavaScript. This site is prerendered, so they read the
  full text — keep it that way: every page must prerender, and no content may
  depend on client-side JS.
- On-site brand name is "NG+ Game Trailers" everywhere (title, footer, JSON-LD,
  llms.txt); `alternateName` carries "NG+ Trailers" and "NG Plus Game
  Trailers". Chosen Nov 18 2026 as the default (Brian's question went
  unanswered; he okayed proceeding). His email signature says "NG+ Trailers".
- Decided against bot-only / agent-only page versions (the Akamai + Scrunch
  user-agent approach): Google and Bing reps warn it may count as cloaking, and
  this page is already light server-rendered HTML. If ever wanted, the safe
  form is `Accept: text/markdown` content negotiation serving the same content
  with `Vary: Accept`, and only after testing that the APISIX edge (which
  caches apex HTML) respects Vary.
- `public/llms.txt` is kept because it is free, but it is not a lever: almost
  no AI search system requests it.
- Bot baseline, raw logs late Oct to Nov 18 2026 (891 log lines in Oct, 21,760
  in Nov), requests per bot: googlebot 101, oai-searchbot 78, gptbot 44,
  claude-user 17 (mostly Claude chats with Brian), claudebot 15, bingbot 10,
  claude-searchbot 4, perplexity-user 2, chatgpt-user 2, perplexitybot 1.
  Reading: crawlers see the site fine; fetches triggered by real users' AI
  questions are near zero. The bottleneck is content, not access.
- Re-run the baseline with this (counts matching LINES; counting matches
  double-counts bots whose user-agent names them twice, e.g. GPTBot):

  ```powershell
  ssh -p 21098 ngplus@198.54.116.242 'z(){ zcat -f ~/access-logs/* ~/logs/*ngplustrailers* 2>/dev/null; }; echo LOG LINES BY MONTH; z | grep HTTP | cut -d[ -f2 | cut -d/ -f2,3 | cut -d: -f1 | sort -t/ -k2n -k1M | uniq -c; echo BOT REQUESTS; for b in googlebot gptbot oai-searchbot chatgpt-user claudebot claude-user claude-searchbot perplexitybot perplexity-user bingbot; do echo $(z | grep -ci $b) $b; done | sort -rn'
  ```

- Nov 18 2026 homepage pass (build-verified in the container: prerender OK,
  JSON-LD valid, consistency gate clean, full-page screenshots pixel-identical
  to the previous build except the new About line): keyword-bearing title and
  description, og:site_name, Organization JSON-LD with Vancouver address, logo
  and the five services as an OfferCatalog, WebSite JSON-LD linked to it,
  `.deco-text` flavor cleanup, trailer types in plain words, "Based in
  Vancouver, Canada. Working with indie teams worldwide." in About, refreshed
  llms.txt, sitemap lastmod. Deployed Nov 19 2026 at 09:47 PT (commit 355fa85)
  and verified live on both the apex and www.
- Verifying a deploy: trust deploy.ps1's server listing (index.html size and
  time) and this check from Brian's machine — both lines should show the new
  title. Do NOT treat Claude's WebFetch as proof of what is live: on Nov 19 it
  kept returning the pre-deploy page for several minutes after the deploy had
  landed, even for cache-busting `?v=` URLs and for www, and Claude wrongly
  reported the upload as failed.

  ```powershell
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  foreach ($u in 'https://ngplustrailers.com/', 'https://www.ngplustrailers.com/') {
    $h = (Invoke-WebRequest $u -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }).Content
    $t = [regex]::Match($h, '<title>(.*?)</title>').Groups[1].Value
    '{0,-34} {1} | Vancouver line: {2}' -f $u, $t, ($h -match 'Based in Vancouver')
  }
  ```

## Conventions

- Deliver COMPLETE files, never diffs or paste-over snippets — every file type,
  even a one-line change.
- When the repo is reachable through the device bridge, write delivered files
  straight into their destination paths instead of leaving cards to save.
- Every message that attaches files ends with a minimal destination map placed
  directly above the file cards: one repo-relative path per line, each in inline
  code (backticks), never a fenced block, no arrows, nothing else.
- Every step the user has to run is a runnable PowerShell block (git, ssh,
  deploy.ps1), in run order; no click-path directions when a command will do.
  Config stays in env vars so shipped files are drop-in.
- Shipping tracked files: append a PowerShell `git add` / `commit` / `push`
  snippet at the end of the response.
- Don't flag stray or untracked files in the repo.
- Update this file on every day the repo gets work.

## Open items

- Step 4: repoint the apex A-record to the origin and drop the APISIX edge
  (prerequisite: proxy-agnostic https guard in `.htaccess`), then request the
  paid SSL.com cert refund — in that order.
- Default `CONTACT_ORIGINS` in `contact.php` + matching `Origin` header on the
  deploy.ps1 probe.
- `public/og-image.png` is 830 KB; resize to 1200×630.
- Submit `sitemap.xml` in Search Console (verification token is in `<head>`).
- Old video files left on the server after the Nov 6 media deploy can be
  deleted (see the ssh cleanup in that session). deploy.ps1 reports 16 remote
  media files against 11 local; the 5 extras are most likely the five videos
  superseded by the `.v2` encodes. Its media-count WARN is expected until they
  are gone.
- AI visibility, next steps: Bing Webmaster Tools (import from Search Console;
  its AI Performance report shows Copilot citations) + an IndexNow ping after
  each deploy; a pricing page (waits on Brian's call on publishing the $5,000
  starting price — add an Offer price to the JSON-LD only when it is visible on
  the page); one case-study page per portfolio title (needs Brian's project
  details); a weekly `/steam-trends` page built from NG+ LeadGen aggregates —
  totals only, never leads or contacts (waits on Brian's call on publishing
  them); VideoObject JSON-LD for the four trailers (needs upload dates);
  `sameAs` profile links in the Organization JSON-LD (needs NG+'s social /
  YouTube URLs).
- `src/routes/sitemap.xml.ts` is dead code (a server route, never prerendered,
  no server at runtime) still pointing at the old lovable.app URL;
  `public/sitemap.xml` is what is served. Delete it when convenient.
