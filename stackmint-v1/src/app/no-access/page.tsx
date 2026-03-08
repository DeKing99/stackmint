"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { AlertCircle, Home } from "lucide-react";

export default function NoAccessPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-6">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-600">
            You don't have permission to access this resource.
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
          <p className="text-sm text-red-800">
            <strong>Why am I here?</strong>
          </p>
          <ul className="text-sm text-red-700 list-disc list-inside mt-2 space-y-1">
            <li>You haven't been assigned to any locations yet</li>
            <li>
              You're trying to access a location you don't have permission for
            </li>
            <li>Your account role doesn't allow this action</li>
          </ul>
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-sm text-gray-600">
            Contact your organization administrator if you believe this is an
            error.
          </p>

          <Button onClick={() => router.push("/")} className="w-full gap-2">
            <Home className="h-4 w-4" />
            Go Home
          </Button>

          <Button
            variant="outline"
            onClick={() => router.back()}
            className="w-full"
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
