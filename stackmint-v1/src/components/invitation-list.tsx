"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useOrganization } from "@clerk/nextjs";

type Invitation = {
  id: string;
  email_address: string;
  status: string;
  sites: { id: string; site_name: string }[];
  created_at: string;
};

export default function InvitationsList({ refreshKey }: { refreshKey: number }) {
  const { organization } = useOrganization();
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const fetchInvites = async () => {
    if (!organization?.id) return;
    const res = await fetch(
      `https://glowing-parakeet-7jqvjqg9xvpcpg5-8001.app.github.dev/invitations?organization_id=${organization.id}`
    );
    const data = await res.json();
    setInvitations(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    fetchInvites();
  }, [organization?.id, refreshKey]); // 👈 refresh when parent bumps refreshKey

  const revokeInvite = async (id: string) => {
    if (!organization?.id) return;
    await fetch(
      `https://glowing-parakeet-7jqvjqg9xvpcpg5-8001.app.github.dev/invitations/${id}/revoke?organization_id=${organization.id}`,
      { method: "POST" }
    );
    setInvitations((prev) => prev.filter((inv) => inv.id !== id));
  };

  return (
    <div className="p-6 bg-white text-gray-900 rounded-xl shadow-sm">
      <h2 className="text-2xl font-semibold mb-6">Pending Invitations</h2>

      {invitations.length === 0 ? (
        <p className="text-gray-500 text-sm">No pending invitations.</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {invitations.map((inv) => {
            const displayLocation =
              inv.sites.length === 0
                ? "—"
                : inv.sites.length === 1
                ? inv.sites[0].site_name
                : `${inv.sites[0].site_name} +${inv.sites.length - 1}`;

            return (
              <div
                key={inv.id}
                className="flex justify-between items-center py-4"
              >
                {/* Info */}
                <div>
                  <p className="font-medium">{inv.email_address}</p>
                  <p className="text-sm text-gray-600">
                    {inv.status} •{" "}
                    <span
                      title={inv.sites.map((s) => s.site_name).join(", ")}
                      className="cursor-help"
                    >
                      {displayLocation}
                    </span>
                  </p>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full hover:bg-gray-100"
                    >
                      <MoreHorizontal className="w-5 h-5 text-gray-500" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-white text-gray-900 shadow-lg rounded-md"
                  >
                    <DropdownMenuItem
                      onClick={() => revokeInvite(inv.id)}
                      className="hover:bg-red-50 hover:text-red-600"
                    >
                      Revoke Invitation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
