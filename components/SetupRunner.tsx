"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  runFirstTimeSetup,
  kickOffHealthBackfill,
  type SetupResult,
} from "@/app/onboarding/setup/actions";

const PIPELINE = [
  { key: 0, label: "Sync customers + orders from Shopify" },
  { key: 1, label: "Score customers (rules + ML)" },
  { key: 2, label: "Extract brand voice from your storefront" },
  { key: 3, label: "Generate your first strategy" },
];

export function SetupRunner({ shopDomain }: { shopDomain: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SetupResult | null>(null);
  const [started, setStarted] = useState(false);
  const autoStartedRef = useRef(false);
  const backfillKickedOffRef = useRef(false);

  const begin = () => {
    setStarted(true);
    setResult(null);
    start(async () => {
      const r = await runFirstTimeSetup();
      setResult(r);
    });
  };

  // Fire-and-forget historical health backfill once the main pipeline succeeds.
  // The server action runs to completion in its own function invocation (up to
  // 5 min) — we deliberately don't await it. The dashboard widget polls
  // merchants.health_backfill_status and shows "Calculating..." while it runs.
  useEffect(() => {
    if (!result?.ok || backfillKickedOffRef.current) return;
    backfillKickedOffRef.current = true;
    kickOffHealthBackfill().catch((err) => {
      console.warn("[setup] health backfill kick-off failed (non-fatal):", err);
    });
  }, [result]);

  // Auto-start if the merchant just connected via OAuth (or explicitly requested auto-run)
  useEffect(() => {
    if (autoStartedRef.current) return;
    const shouldAutoStart = searchParams.get("auto") === "1" || searchParams.get("just_connected") === "1";
    if (shouldAutoStart && !started) {
      autoStartedRef.current = true;
      begin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const stepStatus = (stepIndex: number): "pending" | "running" | "done" | "skipped" | "error" => {
    if (!started) return "pending";
    if (result) {
      return result.steps[stepIndex]?.status ?? "pending";
    }
    return "running"; // all steps "running" while pending
  };

  return (
    <div>
      {/* Steps list */}
      <div className="space-y-3 mb-6">
        {PIPELINE.map((p, i) => {
          const s = stepStatus(i);
          const detail = result?.steps[i]?.detail;
          const ms = result?.steps[i]?.durationMs;
          return (
            <div
              key={p.key}
              className={`flex items-start gap-3 p-3 rounded-md border ${
                s === "done" ? "bg-green-50 border-green-200" :
                s === "error" ? "bg-red-50 border-red-200" :
                s === "skipped" ? "bg-amber-50 border-amber-200" :
                s === "running" && pending ? "bg-blue-50 border-blue-200" :
                "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="w-6 flex-shrink-0 pt-0.5">
                {s === "done" && <span className="text-green-600 font-bold">✓</span>}
                {s === "error" && <span className="text-red-600 font-bold">✗</span>}
                {s === "skipped" && <span className="text-amber-600 font-bold">!</span>}
                {(s === "running" || (s === "pending" && pending)) && <Spinner />}
                {s === "pending" && !pending && <span className="text-gray-400">○</span>}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${
                  s === "done" ? "text-green-900" :
                  s === "error" ? "text-red-900" :
                  s === "skipped" ? "text-amber-900" :
                  "text-gray-700"
                }`}>
                  {p.label}
                </div>
                {detail && (
                  <div className="text-xs text-gray-600 mt-0.5">
                    {detail}{ms ? ` · ${(ms / 1000).toFixed(1)}s` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      {!started ? (
        <button
          onClick={begin}
          className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
        >
          Start setup →
        </button>
      ) : pending ? (
        <div className="text-sm text-gray-600 italic">
          Working... this typically takes 2-3 minutes.
        </div>
      ) : result ? (
        <div className="space-y-3">
          {result.ok ? (
            <>
              <div className="text-sm font-medium text-green-700">
                ✓ {result.message}
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
              >
                Open dashboard →
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-red-700">
                {result.message}
              </div>
              <button
                onClick={begin}
                className="px-5 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
              >
                Retry
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-5 py-2 ml-2 text-sm text-blue-600 hover:underline"
              >
                Skip and open dashboard
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  );
}
