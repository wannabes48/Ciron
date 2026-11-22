import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { SITE, TRIAL_DAYS } from "./config";

// NOTE: these are working drafts written for a Kenyan SaaS under the Data Protection Act 2019 and the
// Consumer Protection Act 2012. Have an advocate review them before launch.

const L = SITE.legalName;

function Terms() {
  return (
    <>
      <p>These terms are the agreement between you (the business that opens a Ciron account, and the people you allow to use it) and {L} ("Ciron", "we", "us"). By creating a shop or using Ciron you accept them. If you are accepting for a company, you confirm you are allowed to bind it.</p>

      <h2>1. The service</h2>
      <p>Ciron is an online point of sale and business management service. It lets you record sales, stock, customers, suppliers, purchases, expenses and payments, and produce receipts and reports. Each business gets its own account, reached at its own address on {SITE.domain}.</p>
      <p>Features marked "coming soon" are not part of the service until we announce them as live.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>Give accurate business details, including your KRA PIN where you enter one.</li>
        <li>You are responsible for the staff accounts you create, the permissions you give them and what they do in Ciron.</li>
        <li>Keep passwords and PINs private. Tell us straight away at <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> if you think someone has accessed your account without permission.</li>
        <li>You must be 18 or older to open an account.</li>
      </ul>

      <h2>3. Free trial, plans and payment</h2>
      <p>New shops get a {TRIAL_DAYS}-day free trial. After that the service is paid for in advance, monthly or yearly, at the prices on our <Link to="/pricing">pricing page</Link>, in Kenyan shillings including VAT. Our <Link to="/legal/refunds">billing and refunds policy</Link> forms part of these terms.</p>
      <p>If a payment is more than 7 days late we may make your shop read-only until it is paid. We give at least 30 days' notice of any price increase, by email or SMS and in the app.</p>

      <h2>4. Your data</h2>
      <p>The records you put into Ciron (products, sales, customers, stock and so on) belong to you. You give us permission to store and process them only to run the service for you, keep it secure and support you. We do not sell your data. You can export it to CSV at any time. How we handle personal data is set out in our <Link to="/legal/privacy">privacy policy</Link>.</p>

      <h2>5. Your responsibilities</h2>
      <ul>
        <li>Your tax affairs remain yours. Ciron helps you calculate VAT and keep records, but you are responsible for filing returns, issuing valid tax invoices and complying with KRA requirements, including eTIMS.</li>
        <li>You must have a lawful basis for the personal data of your customers and staff that you enter into Ciron, and you must tell them how you use it.</li>
        <li>Check figures before relying on them for important decisions. Count your cash and stock regularly.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You must not use Ciron to break the law, sell prohibited goods, launder money, send spam, try to access another business's data, probe or overload our systems, or copy or resell the service. We may suspend an account that does any of these, and will tell you why unless the law prevents us.</p>

      <h2>7. Availability and support</h2>
      <p>We aim to keep Ciron available around the clock and to schedule maintenance outside trading hours. We back up data daily. We cannot promise the service will never be interrupted, because it depends on internet connections, mobile networks and third parties such as payment providers.</p>
      <p>Support is available by phone, WhatsApp and email during the hours shown on our <Link to="/contact">contact page</Link>.</p>

      <h2>8. Our liability</h2>
      <p>Nothing in these terms limits liability that cannot be limited under Kenyan law. Otherwise, we are not liable for indirect losses such as lost profit, lost business or lost goodwill, and our total liability in any 12 months is limited to the fees you paid us in that period.</p>

      <h2>9. Ending the agreement</h2>
      <p>You can cancel at any time from Settings or by contacting us; your plan runs to the end of the period you have paid for. We may end the agreement with 30 days' notice, or straight away for a serious breach of these terms. After an account closes we keep your data for 90 days so you can export it or come back, and then delete it, except records we must keep by law.</p>

      <h2>10. Changes to these terms</h2>
      <p>We may update these terms. For changes that affect you materially we give at least 30 days' notice. If you keep using Ciron after a change takes effect, the new terms apply.</p>

      <h2>11. Law and disputes</h2>
      <p>These terms are governed by the laws of Kenya. Contact us first so we can try to settle any dispute. If we cannot, the courts of Kenya have jurisdiction.</p>

      <h2>12. Contact</h2>
      <p>{L}, {SITE.address}. Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>, phone {SITE.phone}.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>This policy explains how {L} handles personal data, in line with Kenya's Data Protection Act, 2019 and its regulations. It covers people who visit our website, business owners and staff who use Ciron, and the customers and suppliers whose details shops record in Ciron.</p>

      <h2>1. Our two roles</h2>
      <p><strong>As data controller</strong>, we decide how to use the data of people who visit our site, contact us or hold a Ciron account: names, phone numbers, emails, business details and billing records.</p>
      <p><strong>As data processor</strong>, we store and process the data each shop enters about its own customers, suppliers and staff, only on that shop's instructions. The shop is the controller of that data. If you are a customer of a shop and have a question about your data, contact the shop first; we will help them answer.</p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> business name, owner's name, phone, email, KRA PIN, physical address.</li>
        <li><strong>Staff details:</strong> names, usernames, roles, and a record of sign-ins (time, IP address, device).</li>
        <li><strong>Business records:</strong> products, prices, stock, sales, payments (including M-Pesa transaction codes), expenses and the customer and supplier details a shop chooses to enter, such as names, phone numbers and balances.</li>
        <li><strong>Enquiries:</strong> what you send us through the contact form, email, phone or WhatsApp.</li>
        <li><strong>Technical data:</strong> browser type, IP address and error logs, used to keep the service secure and working.</li>
      </ul>
      <p>We do not collect card numbers; card payments are handled by our payment provider.</p>

      <h2>3. Why we use it, and our lawful basis</h2>
      <ul>
        <li>To provide the service you signed up for and support you (contract).</li>
        <li>To bill you and keep accounting records (contract and legal obligation).</li>
        <li>To keep accounts secure, detect fraud and fix problems (legitimate interest).</li>
        <li>To tell you about changes to the service and, if you agree, about new features (legitimate interest or consent; you can opt out of marketing at any time).</li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>We share personal data only with service providers who help us run Ciron, under written agreements that require them to protect it: cloud hosting, SMS and email delivery, payment processing (such as Safaricom M-Pesa and card processors) and, when you ask for it, KRA for tax invoicing. We disclose data to authorities only where Kenyan law requires it. We never sell personal data.</p>

      <h2>5. Where it is stored</h2>
      <p>Some of our providers may store data outside Kenya. Where they do, we transfer it only with the safeguards the Data Protection Act requires, such as contractual protections and providers with adequate security.</p>

      <h2>6. How long we keep it</h2>
      <p>We keep account and business records while your account is active and for 90 days after it closes, then delete them. Billing records are kept for at least 5 years, as Kenyan tax law requires. Shops are responsible for how long they keep their own customers' data and can delete it in Ciron.</p>

      <h2>7. Security</h2>
      <p>Data is encrypted in transit, each business's records are kept separate from every other business's, staff access is controlled by role, sign-ins are logged and data is backed up daily. If a breach affects your personal data we will notify the Office of the Data Protection Commissioner and you as the law requires.</p>

      <h2>8. Your rights</h2>
      <p>You have the right to be told how your data is used, to see it, to have it corrected or deleted, to object to its use or restrict it, and to receive it in a portable format. To use any of these rights, email <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. We reply within 7 days. If you are unhappy with our answer you can complain to the Office of the Data Protection Commissioner (<a href="https://www.odpc.go.ke" target="_blank" rel="noreferrer">odpc.go.ke</a>).</p>

      <h2>9. Children</h2>
      <p>Ciron is a business tool and is not meant for anyone under 18.</p>

      <h2>10. Changes</h2>
      <p>We will post any changes here and tell account holders about significant ones by email or in the app.</p>

      <h2>11. Contact</h2>
      <p>Data protection questions: <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. Post: {L}, {SITE.address}.</p>
    </>
  );
}

function Refunds() {
  return (
    <>
      <p>This policy explains how billing, cancellations and refunds work for Ciron subscriptions.</p>

      <h2>Free trial</h2>
      <p>Every new shop gets {TRIAL_DAYS} days free with no card or payment needed. If you do not choose a plan by the end of the trial, your shop becomes read-only. You can still sign in and export your data for 90 days.</p>

      <h2>How billing works</h2>
      <ul>
        <li>Plans are paid in advance, monthly or yearly, in Kenyan shillings. Prices include VAT.</li>
        <li>You can pay by M-Pesa, card or bank transfer. We send a receipt for every payment.</li>
        <li>Upgrades take effect immediately and you pay the difference for the rest of the current period. Downgrades take effect at the start of the next period.</li>
        <li>If a payment fails we remind you by SMS and email. After 7 days unpaid, the shop becomes read-only until payment is made. No data is deleted.</li>
      </ul>

      <h2>Cancelling</h2>
      <p>Cancel any time from Settings or by contacting us. Your plan stays active until the end of the period you have paid for, and is not renewed.</p>

      <h2>Refunds</h2>
      <ul>
        <li><strong>Monthly plans:</strong> we do not refund part-months, but you can cancel before the next renewal.</li>
        <li><strong>Yearly plans:</strong> if you cancel within 30 days of paying, we refund the full amount. After 30 days we refund the unused whole months, less one month's fee at the monthly rate.</li>
        <li><strong>Our fault:</strong> if Ciron is unavailable for more than 24 hours in a row because of a problem on our side, we credit the affected days to your account on request.</li>
        <li><strong>Charged in error:</strong> duplicate or mistaken charges are always refunded in full.</li>
      </ul>
      <p>Refunds go back to the method you paid with, M-Pesa or card, within 7 working days of approval.</p>

      <h2>How to ask</h2>
      <p>Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> with your shop address and the payment reference, or call {SITE.phone}.</p>
    </>
  );
}

function Cookies() {
  return (
    <>
      <p>Ciron uses a small amount of browser storage to work. We do not use advertising cookies or sell browsing data.</p>
      <h2>What we store</h2>
      <ul>
        <li><strong>Sign-in session:</strong> after you sign in, your browser keeps a secure token so you stay signed in. Signing out removes it.</li>
        <li><strong>Preferences:</strong> things like the branch you last chose, so the app opens where you left off.</li>
        <li><strong>Offline till data:</strong> where offline selling is enabled, a copy of your product list and any sales waiting to sync, stored on that device until they reach our servers.</li>
      </ul>
      <h2>Analytics</h2>
      <p>If we add website analytics, we will use a privacy-friendly tool that does not track you across other sites, and update this page first.</p>
      <h2>Your choices</h2>
      <p>You can clear site data in your browser settings at any time. Ciron will sign you out and any unsynced offline sales on that device will be lost, so sync before you clear.</p>
      <p>Questions: <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>.</p>
    </>
  );
}

const DOCS = {
  terms: { title: "Terms of service", Body: Terms },
  privacy: { title: "Privacy policy", Body: Privacy },
  refunds: { title: "Billing and refunds", Body: Refunds },
  cookies: { title: "Cookies and storage", Body: Cookies },
};

export default function Legal() {
  const { doc } = useParams();
  const page = DOCS[doc];
  if (!page) return <Navigate to="/legal/terms" replace />;
  const { title, Body } = page;
  return (
    <section>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-16">
        <nav aria-label="Legal" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-medium text-c-muted">Legal</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {Object.entries(DOCS).map(([k, d]) => (
              <li key={k}>
                <NavLink to={`/legal/${k}`} className={({ isActive }) => `block rounded-[10px] px-3 py-2.5 text-sm font-medium ${isActive ? "bg-c-subtle text-c-subtle-text" : "text-c-text2 hover:text-c-text"}`}>{d.title}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-3xl">
          <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.01em] sm:text-4xl sm:leading-[1.15]">{title}</h1>
          <p className="mt-2 text-sm text-c-muted">Last updated {SITE.legalUpdated}</p>
          <div className="prose-legal mt-6"><Body /></div>
        </article>
      </div>
    </section>
  );
}
