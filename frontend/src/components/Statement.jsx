import { useAuth } from "../lib/auth";
import { date, money, num } from "../lib/format";
import { Button } from "./ui";
import { Printer } from "lucide-react";

/** Printable account statement (customer or supplier). */
export default function Statement({ party, rows, kind = "customer" }) {
  const { business } = useAuth();
  return (
    <div>
      <div className="mb-2 flex justify-end print:hidden">
        <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print statement</Button>
      </div>
      <div className="print-area a4">
        <div className="mb-3 flex justify-between">
          <div><div className="text-base font-bold">{business?.name}</div><div className="text-xs text-slate-500">{business?.address} {business?.phone}</div></div>
          <div className="text-right"><div className="font-semibold">Statement of account</div><div className="text-xs">{party.name} · {party.phone}</div></div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="py-1.5">Date</th><th>Reference</th><th>Description</th>
              <th className="text-right">{kind === "customer" ? "Charged" : "Paid / returned"}</th>
              <th className="text-right">{kind === "customer" ? "Paid / credited" : "Goods received"}</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5">{date(r.date)}</td><td>{r.reference}</td><td>{r.description}</td>
                <td className="tabular text-right">{Number(r.debit) ? num(r.debit) : ""}</td>
                <td className="tabular text-right">{Number(r.credit) ? num(r.credit) : ""}</td>
                <td className="tabular text-right font-medium">{num(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right font-semibold">{kind === "customer" ? "Amount due" : "Amount owed"}: {money(party.balance)}</div>
      </div>
    </div>
  );
}
