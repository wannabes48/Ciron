import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Mail, Menu, MessageCircle, Phone, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { SITE, TRIAL_DAYS } from "./config";

export function Logo({ className = "h-7", reversed = false }) {
  if (reversed) return <img src="/brand/ciron-logo-horizontal-reversed.svg" alt="Ciron" className={`${className} w-auto`} />;
  return (
    <picture>
      <source srcSet="/brand/ciron-logo-horizontal-reversed.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/ciron-logo-horizontal.svg" alt="Ciron" className={`${className} w-auto`} />
    </picture>
  );
}

const cx = (...c) => c.filter(Boolean).join(" ");

/** Buttons for the public site, sized to the 44px touch minimum. */
export function SiteButton({ to, href, variant = "primary", size = "md", className, children, ...props }) {
  const styles = {
    primary: "bg-c-action text-white hover:bg-c-action-hover active:bg-c-action-active",
    secondary: "border border-c-border bg-c-surface text-c-text hover:border-c-input",
    quiet: "text-c-link hover:bg-c-subtle",
    onBlue: "bg-white text-c-blue hover:bg-[#E5EDFF]",
    outlineOnBlue: "border border-white/60 text-white hover:bg-white/10",
  }[variant];
  const sizes = { md: "h-11 px-5 text-sm", lg: "h-13 px-6 text-base", sm: "h-9 px-3 text-sm" }[size];
  const cls = cx("inline-flex items-center justify-center gap-2 rounded-[10px] font-medium whitespace-nowrap disabled:opacity-60", styles, sizes, className);
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...props}>{children}</a>;
  return <button className={cls} {...props}>{children}</button>;
}

const NAV = [
  { to: "/#features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
];

function Header() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);
  const link = ({ isActive }) => cx("rounded-[10px] px-3 py-2 text-sm font-medium", isActive ? "text-c-text" : "text-c-text2 hover:text-c-text");
  return (
    <header className="sticky top-0 z-40 border-b border-c-border bg-c-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Ciron home" className="shrink-0"><Logo className="h-7" /></Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className={n.to.includes("#") ? () => link({}) : link}>{n.label}</NavLink>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {session ? <SiteButton to="/">Open my shop</SiteButton> : <>
            <SiteButton to="/login" variant="quiet">Sign in</SiteButton>
            <SiteButton to="/register">Start free trial</SiteButton>
          </>}
        </div>
        <button className="ml-auto grid h-11 w-11 place-items-center rounded-[10px] text-c-text md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-c-border bg-c-surface px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2" aria-label="Mobile">
            {NAV.map((n) => <Link key={n.to} to={n.to} className="rounded-[10px] px-2 py-3 text-base font-medium text-c-text">{n.label}</Link>)}
          </nav>
          <div className="grid gap-2">
            {session ? <SiteButton to="/">Open my shop</SiteButton> : <>
              <SiteButton to="/register">Start free trial</SiteButton>
              <SiteButton to="/login" variant="secondary">Sign in</SiteButton>
            </>}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const col = "space-y-2.5 text-sm";
  const a = "text-[#C0C6D0] hover:text-white";
  const h = "mb-3 text-sm font-semibold text-white";
  return (
    <footer className="bg-c-ink text-[#C0C6D0]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
          <div>
            <Logo reversed className="h-8" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-[#A7ADB7]">
              Point of sale and stock book for Kenyan retail and wholesale shops. Sell by the piece or the carton, take M-Pesa and credit, and know your numbers.
            </p>
          </div>
          <div>
            <h2 className={h}>Product</h2>
            <ul className={col}>
              <li><Link className={a} to="/#features">Features</Link></li>
              <li><Link className={a} to="/pricing">Pricing</Link></li>
              <li><Link className={a} to="/register">Start free trial</Link></li>
              <li><Link className={a} to="/login">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={h}>Company</h2>
            <ul className={col}>
              <li><Link className={a} to="/contact">Contact us</Link></li>
              <li><Link className={a} to="/contact?topic=demo">Book a demo</Link></li>
              <li><Link className={a} to="/contact?topic=partnership">Partners</Link></li>
              <li><Link className={a} to="/contact?topic=support">Support</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={h}>Legal</h2>
            <ul className={col}>
              <li><Link className={a} to="/legal/terms">Terms of service</Link></li>
              <li><Link className={a} to="/legal/privacy">Privacy policy</Link></li>
              <li><Link className={a} to="/legal/refunds">Billing and refunds</Link></li>
              <li><Link className={a} to="/legal/cookies">Cookies</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={h}>Talk to us</h2>
            <ul className={col}>
              <li><a className={cx(a, "inline-flex items-center gap-2")} href={`tel:${SITE.phone.replace(/\s/g, "")}`}><Phone size={16} />{SITE.phone}</a></li>
              <li><a className={cx(a, "inline-flex items-center gap-2")} href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a></li>
              <li><a className={cx(a, "inline-flex items-center gap-2")} href={`mailto:${SITE.email}`}><Mail size={16} />{SITE.email}</a></li>
              <li className="text-[#A7ADB7]">{SITE.hours}</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-[#A7ADB7] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {SITE.legalName}. {SITE.address}.</p>
          <p className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-c-accent" aria-hidden="true" />
            Prices in Kenyan shillings. {TRIAL_DAYS}-day free trial, no card needed.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function SiteLayout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className="site flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-c-surface focus:px-4 focus:py-2">Skip to content</a>
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
