import { Navigate, Route, Routes } from "react-router-dom";
import Layout, { NAV } from "./components/Layout";
import { Toasts } from "./components/ui";
import { useAuth } from "./lib/auth";
import { Login, Register } from "./pages/Auth";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Inventory from "./pages/Inventory";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Purchases from "./pages/Purchases";
import Reports from "./pages/Reports";
import Sales from "./pages/Sales";
import Settings from "./pages/Settings";
import Suppliers from "./pages/Suppliers";
import Users from "./pages/Users";
import { subdomainFromHost } from "./lib/api";
import Contact from "./site/Contact";
import Landing from "./site/Home";
import Legal from "./site/Legal";
import Pricing from "./site/Pricing";
import SiteLayout from "./site/SiteLayout";

function Guard({ perm, children }) {
  const { can } = useAuth();
  return can(perm) ? children : <div className="p-10 text-center text-slate-500">You don’t have access to this page.</div>;
}

function Home() {
  const { can } = useAuth();
  if (can("dashboard.view")) return <Dashboard />;
  const first = NAV.find((n) => can(n.perm));
  return <Navigate to={first?.to || "/pos"} replace />;
}

export default function App() {
  const { session } = useAuth();
  // On a shop's own subdomain (mamanjeri.ciron.co.ke) the root is that shop's sign-in, not the marketing site.
  const onShopDomain = Boolean(subdomainFromHost());
  return (
    <>
      <Toasts />
      <Routes>
        {/* Public website, reachable signed in or out */}
        <Route element={<SiteLayout />}>
          {!session && !onShopDomain && <Route index element={<Landing />} />}
          <Route path="pricing" element={<Pricing />} />
          <Route path="contact" element={<Contact />} />
          <Route path="legal" element={<Navigate to="/legal/terms" replace />} />
          <Route path="legal/:doc" element={<Legal />} />
        </Route>

        {!session ? (
          <>
            {onShopDomain && <Route index element={<Login />} />}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/pos" element={<Guard perm="pos.sell"><POS /></Guard>} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="sales" element={<Guard perm="sales.view"><Sales /></Guard>} />
              <Route path="products" element={<Guard perm="products.view"><Products /></Guard>} />
              <Route path="inventory" element={<Guard perm="stock.view"><Inventory /></Guard>} />
              <Route path="customers" element={<Guard perm="customers.view"><Customers /></Guard>} />
              <Route path="suppliers" element={<Guard perm="suppliers.view"><Suppliers /></Guard>} />
              <Route path="purchases" element={<Guard perm="purchases.view"><Purchases /></Guard>} />
              <Route path="expenses" element={<Guard perm="expenses.view"><Expenses /></Guard>} />
              <Route path="reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
              <Route path="users" element={<Guard perm="users.manage"><Users /></Guard>} />
              <Route path="settings" element={<Guard perm="settings.manage"><Settings /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </>
        )}
      </Routes>
    </>
  );
}
