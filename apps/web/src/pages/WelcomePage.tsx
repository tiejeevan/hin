import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  MessageCircle,
  PenLine,
  Sparkles,
  Video,
  Heart,
  Repeat2,
  BarChart3,
} from 'lucide-react';
import { appRegisterUrl, appSignInUrl } from '../lib/welcomeAuthLinks';

const LOGO_SRC = '/icons/hin-logo.png';
const GUEST_FEED_URL = '/';
const WELCOME_HOME = '/welcome';

/** Fades sections in as they scroll into view. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = el.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return ref;
}

function SamplePost({
  name,
  handle,
  time,
  text,
  likes,
  reposts,
}: {
  name: string;
  handle: string;
  time: string;
  text: string;
  likes: string;
  reposts: string;
}) {
  return (
    <div className="border-b border-white/5 px-4 py-3">
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="font-semibold text-white">{name}</span>
            <span className="truncate text-white/40">
              {handle} · {time}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-white/85">{text}</p>
          <div className="mt-2 flex items-center gap-5 text-white/35">
            <span className="flex items-center gap-1 text-[12px]">
              <MessageCircle className="h-3.5 w-3.5" /> 12
            </span>
            <span className="flex items-center gap-1 text-[12px]">
              <Repeat2 className="h-3.5 w-3.5" /> {reposts}
            </span>
            <span className="flex items-center gap-1 text-[12px]">
              <Heart className="h-3.5 w-3.5" /> {likes}
            </span>
            <span className="flex items-center gap-1 text-[12px]">
              <BarChart3 className="h-3.5 w-3.5" /> 1.2k
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div
      data-reveal
      className="reveal rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-indigo-500/40 hover:bg-white/[0.05]"
    >
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/15 text-indigo-400">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-[15px] leading-relaxed text-white/60">{text}</p>
    </div>
  );
}

export function WelcomePage() {
  const rootRef = useReveal();
  const signInUrl = appSignInUrl();
  const registerUrl = appRegisterUrl();

  return (
    <div ref={rootRef} className="min-h-screen bg-[#0a0a0f] text-white antialiased">
      <style>{`
        .reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .7s ease; }
        .reveal.is-visible { opacity: 1; transform: none; }
        html { scroll-behavior: smooth; }
        @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .floaty { animation: floaty 6s ease-in-out infinite; }
        @keyframes glowpulse { 0%,100% { opacity: .5; } 50% { opacity: .9; } }
        .glowpulse { animation: glowpulse 5s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href={WELCOME_HOME} className="flex items-center gap-2.5">
            <img src={LOGO_SRC} alt="Hin logo" className="h-8 w-auto" />
            <span className="text-lg font-bold tracking-tight">Hin</span>
          </a>
          <nav className="hidden items-center gap-8 text-[15px] text-white/60 sm:flex">
            <a href="#philosophy" className="transition-colors hover:text-white">
              Why Hin
            </a>
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={signInUrl}
              className="hidden text-[15px] font-medium text-white/70 transition-colors hover:text-white sm:block"
            >
              Sign in
            </a>
            <a
              href={registerUrl}
              className="rounded-full bg-indigo-600 px-5 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="glowpulse pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[120px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 sm:pt-24 lg:grid-cols-2">
          <div>
            <div
              data-reveal
              className="reveal mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-600/10 px-4 py-1.5 text-[13px] font-medium text-indigo-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Now in early access
            </div>
            <h1
              data-reveal
              className="reveal text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
            >
              Say what matters.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Find your people.
              </span>
            </h1>
            <p data-reveal className="reveal mt-6 max-w-lg text-lg leading-relaxed text-white/60">
              Hin is the social app that takes you from a post to a real
              conversation. Share your thoughts with the world, slide into
              realtime DMs, or jump on a video call — all without leaving the
              app.
            </p>
            <div data-reveal className="reveal mt-8 flex flex-wrap items-center gap-4">
              <a
                href={registerUrl}
                className="group inline-flex items-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Get started — it&apos;s free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#features"
                className="rounded-full border border-white/15 px-7 py-3.5 text-base font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                See what&apos;s inside
              </a>
            </div>
            <p data-reveal className="reveal mt-6 text-sm text-white/35">
              Connect, Share, Repeat.
            </p>
          </div>

          {/* Phone mockup */}
          <div data-reveal className="reveal mx-auto w-full max-w-[320px]">
            <div className="floaty overflow-hidden rounded-[2rem] border border-white/10 bg-[#101016] shadow-2xl shadow-indigo-950/40">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <img src={LOGO_SRC} alt="" className="h-5 w-auto opacity-90" />
                  <span className="text-[14px] font-semibold">For you</span>
                </div>
                <Sparkles className="h-4 w-4 text-white/40" />
              </div>
              <SamplePost
                name="Maya"
                handle="@maya"
                time="2m"
                text="Okay but why is nobody talking about how good realtime DMs feel here??"
                likes="48"
                reposts="6"
              />
              <SamplePost
                name="Devon"
                handle="@devonbuilds"
                time="18m"
                text="Shipped my first poll on Hin. The results are already pouring in."
                likes="132"
                reposts="21"
              />
              <SamplePost
                name="Priya"
                handle="@priya"
                time="1h"
                text="Went from a thread to a video call in one tap. This is how social should work."
                likes="89"
                reposts="11"
              />
              <div className="px-4 py-4">
                <a
                  href={registerUrl}
                  className="block rounded-full bg-indigo-600 py-2.5 text-center text-[14px] font-semibold transition-colors hover:bg-indigo-500"
                >
                  Join the conversation
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section id="philosophy" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:py-24">
          <h2 data-reveal className="reveal text-3xl font-bold tracking-tight sm:text-4xl">
            Most social apps stop at the post.
          </h2>
          <p data-reveal className="reveal mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/60">
            Hin is built for what happens <em className="text-white/85 not-italic font-medium">next</em> —
            the reply that turns into a conversation, the conversation that
            turns into a call. One place for all of it, designed to feel fast,
            personal, and alive.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <h2
          data-reveal
          className="reveal mb-3 text-center text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Everything a conversation needs
        </h2>
        <p data-reveal className="reveal mb-12 text-center text-lg text-white/55">
          No app-switching. No friction. Just you and your people.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<PenLine className="h-5 w-5" />}
            title="Post, poll, share"
            text="Text, images, polls, and rich link previews. Say it your way and watch the conversation start."
          />
          <FeatureCard
            icon={<MessageCircle className="h-5 w-5" />}
            title="Realtime DMs"
            text="Conversations that feel alive — instant, fluid, and exactly where you left them."
          />
          <FeatureCard
            icon={<Video className="h-5 w-5" />}
            title="Video calls, built in"
            text="Go from a message thread to face-to-face in one tap. No other app needed."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[300px] w-[600px] rounded-full bg-indigo-600/10 blur-[100px]"
        />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center sm:py-24">
          <img
            data-reveal
            src={LOGO_SRC}
            alt="Hin logo"
            className="reveal mx-auto mb-6 h-14 w-auto opacity-90"
          />
          <h2 data-reveal className="reveal text-3xl font-bold tracking-tight sm:text-4xl">
            Be there from day one.
          </h2>
          <p data-reveal className="reveal mx-auto mt-4 max-w-xl text-lg text-white/60">
            Hin is just getting started. Join now and help shape what it
            becomes.
          </p>
          <a
            data-reveal
            href={registerUrl}
            className="reveal group mt-8 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Create your account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img src={LOGO_SRC} alt="Hin logo" className="h-6 w-auto opacity-80" />
            <span className="text-sm text-white/50">
              Hin — Social Media Platform
            </span>
          </div>
          <p className="text-sm text-white/35">© 2026 Hin. Connect, Share, Repeat.</p>
          <a href={GUEST_FEED_URL} className="text-sm font-medium text-white/60 hover:text-white">
            Open Hin
          </a>
        </div>
      </footer>
    </div>
  );
}
