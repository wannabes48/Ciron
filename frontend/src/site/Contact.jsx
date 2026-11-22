import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { SiteButton } from "./SiteLayout";
import { SITE } from "./config";

const TOPICS = [
  ["sales", "Sales and pricing"],
  ["demo", "Book a demo"],
  ["support", "Support for my shop"],
  ["partnership", "Partnership"],
  ["other", "Something else"],
];

const input = "h-11 w-full rounded-[10px] border border-c-input bg-c-surface px-3 text-base text-c-text placeholder:text-c-muted focus:border-c-action focus:outline-none focus:ring-2 focus:ring-c-focus/40";

function Field({ label, hint, children, id }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-c-muted">{hint}</p>}
    </div>
  );
}

export default function Contact() {
  const [params] = useSearchParams();
  const initialTopic = TOPICS.some(([v]) => v === params.get("topic")) ? params.get("topic") : "sales";
  const [f, setF] = useState({ name: "", business_name: "", phone: "", email: "", topic: initialTopic, message: "", website: "" });
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.phone && !f.email) { setError("Give us a phone number or an email address so we can reply."); return; }
    setState("sending");
    try {
      const res = await fetch("/api/public/contact/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (res.status === 429) throw new Error("You have sent several messages already. Call or WhatsApp us instead, or try again in an hour.");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const first = Object.values(data).flat()[0];
        throw new Error(typeof first === "string" ? first : "The message was not sent. Check the form and try again.");
      }
      setState("sent");
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "The message was not sent because you seem to be offline. Check your connection and try again." : err.message);
      setState("idle");
    }
  };

  const channels = [
    { icon: Phone, label: "Call sales", value: SITE.phone, href: `tel:${SITE.phone.replace(/\s/g, "")}` },
    { icon: MessageCircle, label: "WhatsApp", value: "Chat with us", href: `https://wa.me/${SITE.whatsapp}`, external: true },
    { icon: Mail, label: "Email", value: SITE.email, href: `mailto:${SITE.email}` },
    { icon: Mail, label: "Existing customers", value: SITE.supportEmail, href: `mailto:${SITE.supportEmail}` },
  ];

  return (
    <section>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.25fr] lg:py-20">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.02em]">Talk to us</h1>
          <p className="mt-4 max-w-md text-lg leading-7 text-c-text2">
            Questions about plans, a demo for your team, or help with your shop. A person replies, usually within two working hours.
          </p>
          <ul className="mt-8 space-y-3">
            {channels.map(({ icon: Icon, label, value, href, external }) => (
              <li key={label}>
                <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="flex items-center gap-4 rounded-[14px] border border-c-border bg-c-surface p-4 hover:border-c-input">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-c-subtle text-c-subtle-text"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                  <span><span className="block text-sm text-c-text2">{label}</span><span className="block font-medium">{value}</span></span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 text-sm text-c-text2">
            <p className="flex items-center gap-2"><Clock size={16} aria-hidden="true" />{SITE.hours}, East Africa Time</p>
            <p className="flex items-center gap-2"><MapPin size={16} aria-hidden="true" />{SITE.address}</p>
          </div>
        </div>

        <div className="rounded-[20px] border border-c-border bg-c-surface p-5 sm:p-8">
          {state === "sent" ? (
            <div className="py-10 text-center" role="status">
              <CheckCircle2 size={40} className="mx-auto text-c-success" aria-hidden="true" />
              <h2 className="mt-4 text-[22px] font-semibold">Message sent</h2>
              <p className="mx-auto mt-2 max-w-sm text-base text-c-text2">Thank you, {f.name.split(" ")[0]}. We will reply by {f.phone ? "phone or WhatsApp" : "email"} within two working hours.</p>
              <SiteButton variant="secondary" className="mt-6" onClick={() => { setF({ ...f, message: "" }); setState("idle"); }}>Send another message</SiteButton>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <h2 className="text-[22px] font-semibold">Send us a message</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" id="c-name"><input id="c-name" className={input} value={f.name} onChange={set("name")} required autoComplete="name" /></Field>
                <Field label="Shop or business name" id="c-biz"><input id="c-biz" className={input} value={f.business_name} onChange={set("business_name")} autoComplete="organization" /></Field>
                <Field label="Phone" id="c-phone" hint="We can reply by WhatsApp"><input id="c-phone" type="tel" className={input} value={f.phone} onChange={set("phone")} placeholder="0712 345 678" autoComplete="tel" /></Field>
                <Field label="Email" id="c-email"><input id="c-email" type="email" className={input} value={f.email} onChange={set("email")} autoComplete="email" /></Field>
              </div>
              <Field label="What is it about?" id="c-topic">
                <select id="c-topic" className={input} value={f.topic} onChange={set("topic")}>
                  {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Message" id="c-msg">
                <textarea id="c-msg" rows={5} className={`${input} h-auto py-2.5`} value={f.message} onChange={set("message")} required maxLength={4000}
                  placeholder="Tell us about your shop: how many branches, what you sell, and what you use today." />
              </Field>
              {/* Honeypot for bots; hidden from people and screen readers. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={set("website")} />
              {error && <p role="alert" className="rounded-[10px] bg-c-danger-bg px-3 py-2.5 text-sm text-c-danger">{error}</p>}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-c-muted">We use your details only to reply. See our <a href="/legal/privacy" className="text-c-link underline">privacy policy</a>.</p>
                <SiteButton type="submit" disabled={state === "sending" || !f.name || !f.message}>{state === "sending" ? "Sending…" : "Send message"}</SiteButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
