"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSession, useOrganization } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import InvitationsList from "@/components/invitation-list";
import { LocationMultiSelect } from "@/components/location-multi-select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Site = {
  id: string;
  site_name: string;
  site_slug: string;
  site_location: string;
};

const roles = ["org:member", "org:manager", "org:viewer", "org:editor"];

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("org:member");
  const [isSending, setIsSending] = useState(false);

  const { session } = useSession();
  const { organization } = useOrganization();

  const [refreshKey, setRefreshKey] = useState(0); // 👈 controls re-fetch in child

  function createClerkSupabaseClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        async accessToken() {
          return session?.getToken() ?? null;
        },
      }
    );
  }

  const client = createClerkSupabaseClient();

  // Fetch available sites
  useEffect(() => {
    if (!organization) return;
    const fetchSites = async () => {
      const { data, error } = await client
        .from("construction_sites")
        .select("*")
        .eq("organization_id", organization.id);
      if (error) {
        console.error("Error fetching sites:", error);
      } else {
        setSites(data || []);
      }
    };
    fetchSites();
  }, [organization, client]);

  async function handleSend() {
    if (!email || selectedSites.length === 0) {
      alert("Please enter an email and select at least one location.");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("https://glowing-parakeet-7jqvjqg9xvpcpg5-8001.app.github.dev/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: selectedRole,
          locations: selectedSites,
          organization_id: organization?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to send invite");

      alert("Invitation sent!");
      setModalOpen(false);
      setEmail("");
      setSelectedSites([]);
      setSelectedRole("member");

      setRefreshKey((prev) => prev + 1); // 👈 force InvitationsList to refresh
    } catch (err) {
      console.error("Error sending invite:", err);
      alert("Something went wrong.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-xl font-semibold mb-4">Add Members to Locations</h1>
      <Button onClick={() => setModalOpen(true)}>Add Team Member</Button>

      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation with role and location access.
              </DialogDescription>
            </DialogHeader>

            <input
              className="w-full border rounded p-2 mt-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Enter email"
            />

            <LocationMultiSelect
              sites={sites}
              selectedSites={selectedSites}
              setSelectedSites={setSelectedSites}
            />

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full border rounded p-2 mt-2"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>

            <Button
              className="mt-4 w-full"
              onClick={handleSend}
              disabled={isSending}
            >
              {isSending ? "Sending Invite..." : "Invite"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* 👇 Invitations list auto-refreshes after sending */}
      <InvitationsList refreshKey={refreshKey} />
    </div>
  );
}
