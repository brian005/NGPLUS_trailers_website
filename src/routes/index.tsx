import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Rocket, PartyPopper, Target, Brain, Menu, X, Play } from "lucide-react";
import ngLogoAsset from "@/assets/ngplus_logo.png.asset.json";
import work1Asset from "@/assets/before-your-eyes.jpg.asset.json";
import work2Asset from "@/assets/manifold-garden.jpg.asset.json";
import work3Asset from "@/assets/fields-of-mistria.jpg.asset.json";
import work4Asset from "@/assets/pacific-drive.jpg.asset.json";
import beforeYourEyesTrailerAsset from "@/assets/before-your-eyes-trailer.mp4.asset.json";
import pacificDriveTrailerAsset from "@/assets/pacific-drive-trailer.mp4.asset.json";
import fieldsOfMistriaTrailerAsset from "@/assets/fields-of-mistria-trailer.mp4.asset.json";
import manifoldGardenTrailerAsset from "@/assets/manifold-garden-trailer.mp4.asset.json";
const work1 = work1Asset.url;
const work2 = work2Asset.url;
const work3 = work3Asset.url;
const work4 = work4Asset.url;
const beforeYourEyesTrailer = beforeYourEyesTrailerAsset.url;
const pacificDriveTrailer = pacificDriveTrailerAsset.url;
const fieldsOfMistriaTrailer = fieldsOfMistriaTrailerAsset.url;
const manifoldGardenTrailer = manifoldGardenTrailerAsset.url;
import heroVideoAsset from "@/assets/hero-bg.mp4.asset.json";

const ngLogo = ngLogoAsset.url;

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    links: [
      { rel: "preload", as: "image", href: work1, fetchpriority: "high" },
    ],
  }),
});

const SECTIONS = ["work", "services", "about", "contact"] as const;

const VIDEO_SRC = heroVideoAsset.url;

function TerminalHeader({ label, prefix }: { label: string; prefix: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      {prefix && (
        <span className="font-mono text-xs sm:text-sm tracking-[0.3em] text-[#00ff41]">
          &gt; {prefix}
        </span>
      )}
      <h2 className="text-5xl sm:text-6xl md:text-7xl font-extrabold uppercase tracking-tight text-white">
        {label}
      </h2>
      <div className="h-px w-24 bg-[#00ff41]" />
    </div>
  );
}

function Index() {
  const [started, setStarted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const indexRef = useRef(0);
  const startedRef = useRef(false);

  const advance = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
    }
    const next = SECTIONS[indexRef.current];
    const el = document.getElementById(next);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (indexRef.current < SECTIONS.length - 1) indexRef.current += 1;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignore typing in form fields
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      advance();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("a, button, input, textarea, select, label")) return;
      advance();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const i = SECTIONS.indexOf(id as typeof SECTIONS[number]);
    if (i >= 0) indexRef.current = Math.min(i + 1, SECTIONS.length - 1);
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#131313] text-white scanlines">
      {/* NAV */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-2">
            <img src={ngLogo} alt="NG+ Game Trailers" width={120} height={64} className="h-10 w-auto" />
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 font-mono text-xs tracking-[0.2em] uppercase">
            {[
              { id: "work", label: "Our Work" },
              { id: "services", label: "Services" },
              { id: "about", label: "About NG+" },
              { id: "contact", label: "Start a Project" },
            ].map((l) => {
              const isCta = l.id === "contact";
              return (
                <button
                  key={l.id}
                  onClick={(e) => { e.stopPropagation(); jump(l.id); }}
                  className={
                    isCta
                      ? "bg-[#00ff41] px-4 py-2 font-bold text-[#131313] transition hover:brightness-110"
                      : "text-white/70 transition hover:text-[#00ff41]"
                  }
                >
                  {l.label}
                </button>
              );
            })}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={(e) => { e.stopPropagation(); jump("contact"); }}
              className="bg-[#00ff41] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#131313]"
            >
              Start a Project
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMobileOpen(true); }}
              className="text-white p-1"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[#131313]/95 backdrop-blur-md flex flex-col items-center justify-center gap-8 md:hidden">
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-6 text-white p-1"
            aria-label="Close menu"
          >
            <X size={28} />
          </button>
          {[
            { id: "work", label: "Our Work" },
            { id: "services", label: "Services" },
            { id: "about", label: "About NG+" },
            { id: "contact", label: "Start a Project" },
          ].map((l) => {
            const isCta = l.id === "contact";
            return (
              <button
                key={l.id}
                onClick={(e) => { e.stopPropagation(); setMobileOpen(false); jump(l.id); }}
                className={
                  isCta
                    ? "bg-[#00ff41] px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-[#131313]"
                    : "font-mono text-lg uppercase tracking-[0.2em] text-white transition hover:text-[#00ff41]"
                }
              >
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {/* HERO */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          poster={work1}
        >
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#131313]/70 via-[#131313]/40 to-[#131313]" />
        <div className="absolute inset-0 scanlines pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          <div className="mb-8 font-mono text-sm sm:text-base md:text-lg tracking-[0.4em] text-[#00ff41] glow-green">
            NG+ GAME TRAILERS
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold uppercase tracking-tight text-white glow-green">
            PRESS ANY KEY TO BEGIN
            <span className="ml-2 inline-block w-4 h-[0.9em] bg-[#00ff41] align-middle animate-blink" />
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base sm:text-lg text-white/70">
            Next level game trailers for indie teams without the bureaucracy.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); jump("work"); }}
              className="group relative inline-flex items-center gap-3 bg-[#00ff41] px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#131313] transition hover:brightness-110 border-glow"
            >
              <span className="text-[#131313]">▶</span> See our Work
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); jump("contact"); }}
              className="inline-flex items-center gap-3 border border-white/30 bg-transparent px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:border-[#00ff41] hover:text-[#00ff41]"
            >
              Start a Project
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.4em] text-[#00ff41] animate-pulse-green">
            {started ? "SYSTEM ACTIVE" : "SYSTEM STANDBY"}
          </span>
          <span className="animate-bounce-down text-[#00ff41]">▼</span>
        </div>
      </section>

      {/* OUR WORK */}
      <section id="work" className="border-t border-white/5 px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <TerminalHeader label="Our Work" prefix="OUR_WORK_SELECTED" />
          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { img: work1, title: "Before Your Eyes", result: "", tag: "LAUNCH_TRAILER", video: beforeYourEyesTrailer },
              { img: work2, title: "Manifold Garden", result: "", tag: "SWITCH_TRAILER", video: manifoldGardenTrailer as string | null },
              { img: work3, title: "Fields of Mistria", result: "", tag: "WHOLESOME_DIRECT_TRAILER", video: fieldsOfMistriaTrailer as string | null },
              { img: work4, title: "Pacific Drive", result: "", tag: "UPDATE_TRAILER", video: pacificDriveTrailer as string | null },
            ].map((p) => (
              <article key={p.title} className="group relative overflow-hidden border border-white/10 bg-black cursor-pointer" onClick={() => p.video && setActiveVideo(p.video)}>
                <div className="relative aspect-video overflow-hidden">
                  <img src={p.img} alt={p.title} loading="lazy" width={1280} height={720} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                  {p.video && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/40">
                      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#00ff41] text-[#131313]">
                        <Play size={28} fill="currentColor" />
                      </div>
                    </div>
                  )}
                  <div className="absolute top-4 left-4 font-mono text-[10px] tracking-[0.3em] text-[#131313] bg-[#00ff41] border border-[#00ff41] px-2 py-1 font-bold">
                    {p.tag}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-6 py-5">
                  <h3 className="text-xl font-bold uppercase tracking-wide text-white">{p.title}</h3>
                  {p.result && <span className="font-mono text-xs tracking-[0.2em] text-[#00ff41]">// {p.result}</span>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="border-t border-white/5 px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <TerminalHeader label="Services" prefix="SERVICES_SELECTED" />
          <p className="mt-8 max-w-2xl text-lg text-white/70">
            Let us help you be in the right place at the right time.
          </p>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-5 gap-px bg-white/10">
            {[
              { Icon: Clapperboard, label: "Steam Page Trailers", copy: "Optimized for the \u201Cscroll-and-watch\u201D behavior of Steam users." },
              { Icon: Rocket, label: "Reveal & Launch", copy: "High-impact pieces designed to get attention and drive wishlists/sales." },
              { Icon: PartyPopper, label: "Festival Cuts", copy: "Snappy edits for showcase Steam events and seasonal fests." },
              { Icon: Target, label: "Publisher Pitch", copy: "Videos that prove your mechanics, loop, and market viability." },
              { Icon: Brain, label: "Trailer Strategy", copy: "Analysis of your game's hooks and the best way to frame them." },
            ].map((s) => (
              <div key={s.label} className="group flex flex-col items-center text-center gap-6 bg-[#131313] p-8 transition hover:bg-[#0a0a0a]">
                <s.Icon className="h-10 w-10 text-[#00ff41] transition group-hover:glow-green" strokeWidth={1.5} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">{s.label}</h3>
                <p className="text-xs text-white/60 leading-relaxed">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="border-t border-white/5 px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <TerminalHeader label="About NG+" prefix="ABOUT_SELECTED" />
            <div className="mt-10 space-y-6 text-white/75 text-base sm:text-lg leading-relaxed">
              <p>
                NG+ is a boutique trailer studio built by filmmakers who grew up with a controller in hand. We craft cinematic cuts that help indie games punch above their weight.
              </p>
              <p>
                From first reveal to launch day, we partner with solo developers and small teams to translate hundreds of hours of gameplay into ninety seconds that make players hit wishlist.
              </p>
              <p>
                We treat every project like a New Game Plus run — sharper, faster, with everything we&apos;ve learned carried forward.
              </p>
            </div>
          </div>
          <div className="relative flex items-center justify-center aspect-square">
            <div className="absolute inset-0 border border-white/10" />
            <div className="absolute inset-0 scanlines" />
            <img src={ngLogo} alt="NG+ boutique trailer studio branding" width={512} height={512} className="relative w-2/3 h-2/3 object-contain" />
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="border-t border-white/5 px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <TerminalHeader label="Start a Project" prefix="" />
          <p className="mt-6 text-base sm:text-lg text-white/70">Tell us about your game. We'll find the hook.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const name = String(fd.get("name") || "");
              const game = String(fd.get("game") || "");
              const email = String(fd.get("email") || "");
              const steam = String(fd.get("steam") || "");
              const requirements = String(fd.get("requirements") || "");
              const timeline = String(fd.get("timeline") || "");
              const subject = `New Project Inquiry: ${game || name || "NG+ Trailers"}`;
              const body = [
                `Full Name: ${name}`,
                `Game Title: ${game}`,
                `Email: ${email}`,
                `Steam Link: ${steam}`,
                `Target Timeline: ${timeline}`,
                ``,
                `Project Requirements:`,
                requirements,
              ].join("\n");
              window.location.href = `mailto:hello@ngplustrailers.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            }}
            onClick={(e) => e.stopPropagation()}
            className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <Field label="Full Name" name="name" placeholder="your name" />
            <Field label="Game Title" name="game" placeholder="your game" />
            <Field label="Email Address" name="email" type="email" placeholder="you@studio.com" />
            <Field label="Steam Link (Optional)" name="steam" placeholder="store.steampowered.com/..." />
            <div className="md:col-span-2 flex flex-col gap-2">
              <label htmlFor="requirements" className="font-mono text-[10px] tracking-[0.3em] text-[#00ff41] uppercase">&gt; Project Requirements</label>
              <textarea
                id="requirements"
                name="requirements"
                rows={5}
                placeholder="tell us about your game..."
                className="w-full border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-[#00ff41] focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="timeline" className="font-mono text-[10px] tracking-[0.3em] text-[#00ff41] uppercase">&gt; Target Timeline</label>
              <select id="timeline" name="timeline" className="w-full border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white focus:border-[#00ff41] focus:outline-none">
                <option>ASAP</option>
                <option>1-2 months</option>
                <option>3-6 months</option>
                <option>Strategy/Planning/Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[10px] tracking-[0.3em] text-transparent uppercase select-none">&gt; Submit</label>
              <button
                type="submit"
                className="w-full bg-[#00ff41] px-4 py-3 font-mono text-sm font-extrabold uppercase tracking-[0.4em] text-[#131313] transition hover:brightness-110 border-glow"
              >
                ▶ Begin Project
              </button>
            </div>

          </form>

          <div className="mt-16 text-center">
            <p className="font-mono text-[10px] tracking-[0.4em] text-[#00ff41] uppercase">&gt; Direct Communications</p>
            <a
              href="mailto:hello@ngplustrailers.com"
              className="mt-3 inline-block font-mono text-base sm:text-lg tracking-[0.2em] text-white hover:text-[#00ff41] transition"
            >
              hello@ngplustrailers.com
            </a>
          </div>
        </div>
      </section>


      {/* VIDEO MODAL */}
      {activeVideo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => { setActiveVideo(null); }}>
          <div className="relative w-full max-w-5xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActiveVideo(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition"
              aria-label="Close video"
            >
              <X size={28} />
            </button>
            <video
              ref={videoRef}
              src={activeVideo}
              controls
              autoPlay
              className="w-full rounded border border-white/10"
              onEnded={() => setActiveVideo(null)}
            />
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={ngLogo} alt="NG+ Game Trailers" className="h-6 w-auto object-contain" />
            <span className="font-mono text-xs font-bold tracking-[0.3em] text-white">TRAILERS</span>
          </div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-white/40 uppercase text-center">
            © 2026 NG+ Game Trailers. Take Your Game To The Next Level.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="font-mono text-[10px] tracking-[0.3em] text-[#00ff41] uppercase">
        &gt; {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        className="w-full border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-[#00ff41] focus:outline-none"
      />
    </div>
  );
}
