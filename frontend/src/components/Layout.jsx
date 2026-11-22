import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3, Boxes, Building2, ChevronDown, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings,
  ShoppingCart, Truck, UserCog, Users, Wallet, X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { cx } from "./ui";

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view", end: true },
  { to: "/pos", label: "POS", icon: ShoppingCart, perm: "pos.sell" },
  { to: "/sales", label: "Sales", icon: Receipt, perm: "sales.view" },
  { to: "/products", label: "Products", icon: Package, perm: "products.view" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "stock.view" },
  { to: "/customers", label: "Customers", icon: Users, perm: "customers.view" },
  { to: "/suppliers", label: "Suppliers", icon: Building2, perm: "suppliers.view" },
  { to: "/purchases", label: "Purchases", icon: Truck, perm: "purchases.view" },
  { to: "/expenses", label: "Expenses", icon: Wallet, perm: "expenses.view" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "reports.view" },
  { to: "/users", label: "Employees", icon: UserCog, perm: "users.manage" },
  { to: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
];

export default function Layout() {
  const { user, business, branches, branch, setBranch, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => can(n.perm));

  const sidebar = (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 font-bold text-white">C</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{business?.name}</div>
          <div className="truncate text-xs text-slate-400">{business?.subdomain}.ciron</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", isActive ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 hover:text-white")
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 px-2 text-xs">
          <div className="font-medium text-white">{user?.full_name || user?.username}</div>
          <div className="text-slate-400">{user?.role_display}</div>
        </div>
        <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-800">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <button className="rounded p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
          {branches.length > 0 && (
            <label className="relative flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:inline">Branch</span>
              <select
                value={branch?.id || ""}
                onChange={(e) => {
                  setBranch(e.target.value);
                  window.location.reload();
                }}
                className="appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
            </label>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
