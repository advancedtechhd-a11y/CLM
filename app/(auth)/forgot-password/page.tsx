"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings/account`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-3">Check your email</h2>
        <p className="text-gray-600 text-sm">
          If an account exists for <strong>{email}</strong>, we sent a password reset link.
        </p>
        <Link href="/signin" className="text-blue-600 hover:underline text-sm mt-4 inline-block">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold mb-6">Reset your password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <p className="text-sm text-gray-600 mt-6 text-center">
        <Link href="/signin" className="text-blue-600 hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}
