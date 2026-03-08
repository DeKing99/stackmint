import { redirect } from "next/navigation";
import { checkOrgAdminPower } from "@/utils/roles";
import { SearchUsers } from "./SearchUsers";
import { clerkClient } from "@clerk/nextjs/server";
import { removeRole, setRole } from "./_actions";

export default async function AdminDashboard(params: {
  searchParams: Promise<{ search?: string }>;
}) {
  // Protect the page from users who are not org admins/owners
  const canManage = await checkOrgAdminPower();
  if (!canManage) {
    redirect("/no-access");
  }

  const query = (await params.searchParams).search;

  const client = await clerkClient();

  const users = query ? (await client.users.getUserList({ query })).data : [];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Manage user roles and permissions across the organization. Only
        organization admins/owners can access this page.
      </p>

      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Search Users</h2>
        <SearchUsers />
      </div>

      {query && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Search Results for "{query}"
          </h2>

          {users.length === 0 ? (
            <p className="text-gray-600">No users found.</p>
          ) : (
            <div className="space-y-4">
              {users.map((user) => {
                const currentRole =
                  (user.publicMetadata?.role as string) || "member";
                const orgSlug = user.publicMetadata?.org_slug as string;
                const allowedLocations =
                  (user.publicMetadata?.allowed_locations as string[]) || [];

                return (
                  <div
                    key={user.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-medium">
                          {user.firstName} {user.lastName}
                        </h3>
                        <p className="text-gray-600">
                          {
                            user.emailAddresses.find(
                              (email) =>
                                email.id === user.primaryEmailAddressId,
                            )?.emailAddress
                          }
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Organization: {orgSlug || "Not assigned"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-1 rounded text-sm font-medium ${
                            currentRole === "owner"
                              ? "bg-purple-100 text-purple-800"
                              : currentRole === "manager"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {currentRole}
                        </span>
                      </div>
                    </div>

                    {allowedLocations.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">
                          <strong>Allowed Locations:</strong>{" "}
                          {allowedLocations.join(", ")}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <form action={setRole} className="inline">
                        <input type="hidden" value={user.id} name="id" />
                        <input type="hidden" value="owner" name="role" />
                        <button
                          type="submit"
                          disabled={currentRole === "owner"}
                          className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Make Owner
                        </button>
                      </form>

                      <form action={setRole} className="inline">
                        <input type="hidden" value={user.id} name="id" />
                        <input type="hidden" value="manager" name="role" />
                        <button
                          type="submit"
                          disabled={currentRole === "manager"}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Make Manager
                        </button>
                      </form>

                      <form action={setRole} className="inline">
                        <input type="hidden" value={user.id} name="id" />
                        <input type="hidden" value="member" name="role" />
                        <button
                          type="submit"
                          disabled={currentRole === "member"}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          Make Member
                        </button>
                      </form>

                      <form action={removeRole} className="inline">
                        <input type="hidden" value={user.id} name="id" />
                        <button
                          type="submit"
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                          Remove Role
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
