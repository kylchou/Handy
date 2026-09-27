"use client";

import { useState } from "react";
import type { AdminCustomerDTO } from "@handy/contracts";
import Shell from "@/components/Shell";
import { ErrorNote, Table, Td } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { ago } from "@/lib/format";
import { useLive } from "@/lib/useLive";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLive(async () => {
    try {
      setCustomers(await api.admin.customers());
    } catch (err) {
      setError(friendlyError(err));
    }
  });

  return (
    <Shell title="Customers">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Table head={["Customer", "Address", "Emergency contact", "Requests", "Joined"]} empty={customers?.length === 0}>
        {customers?.map((c) => (
          <tr key={c.id}>
            <Td>
              <p className="font-bold">
                {c.firstName} {c.lastName}
              </p>
              <p className="text-sm text-ink-soft">{c.email}</p>
              {c.phone && <p className="text-sm text-ink-soft">{c.phone}</p>}
            </Td>
            <Td className="max-w-xs">{c.profile?.address ?? <span className="text-ink-soft">Not set</span>}</Td>
            <Td>
              {c.profile?.emergencyContact ? (
                <>
                  {c.profile.emergencyContact.name}
                  <p className="text-sm text-ink-soft">{c.profile.emergencyContact.phone}</p>
                </>
              ) : (
                <span className="text-ink-soft">None</span>
              )}
            </Td>
            <Td>
              {c.requestCount}
              {c.openRequestCount > 0 && <p className="text-sm font-bold text-warm">{c.openRequestCount} open</p>}
            </Td>
            <Td className="whitespace-nowrap text-ink-soft">{ago(c.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      {customers === null && !error && <p className="mt-4 text-ink-soft">Loading…</p>}
    </Shell>
  );
}
