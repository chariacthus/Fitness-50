"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type StatusResponse = { state: string; entitled: boolean; hasNutrition: boolean };

const INTERVAL_MS = 2500;
const TIMEOUT_MS = 90_000;

/**
 * Waits for the payment webhook by polling /api/membership/status.
 * It only READS the status – the membership is activated by Stripe's
 * verified webhook, never by this page.
 */
export function PaymentStatusPoller({
  waitFor,
  success,
  loginHref,
}: {
  waitFor: "membership" | "nutrition";
  /** Shown once the payment is confirmed. */
  success: ReactNode;
  loginHref: string;
}) {
  const [phase, setPhase] = useState<"waiting" | "done" | "timeout" | "logged_out">("waiting");
  const [round, setRound] = useState(0);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function check() {
      try {
        const response = await fetch("/api/membership/status", { cache: "no-store", credentials: "same-origin" });
        if (cancelled) return;
        if (response.status === 401) {
          setPhase("logged_out");
          return;
        }
        if (response.ok) {
          const status = (await response.json()) as StatusResponse;
          if (cancelled) return;
          const confirmed = waitFor === "membership" ? status.entitled : status.hasNutrition;
          if (confirmed) {
            setPhase("done");
            return;
          }
        }
      } catch {
        // Network hiccup – keep trying until the time limit.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(check, INTERVAL_MS);
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [waitFor, round]);

  useEffect(() => {
    if (phase !== "waiting") headingRef.current?.focus();
  }, [phase]);

  return (
    <div aria-live="polite" className="space-y-6">
      <div ref={headingRef} tabIndex={-1} className="outline-none">
        {phase === "waiting" ? (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-6 text-lg">
            <Spinner className="h-6 w-6 text-brand" />
            <p>Vi bekræfter din betaling… Det tager som regel kun et øjeblik. Du kan roligt blive på siden.</p>
          </div>
        ) : null}

        {phase === "done" ? success : null}

        {phase === "timeout" ? (
          <div className="space-y-4">
            <Alert tone="info" title="Det tager længere tid end normalt">
              Det tager længere tid end normalt. Du får en notifikation, så snart betalingen er bekræftet.
            </Alert>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setPhase("waiting");
                  setRound((r) => r + 1);
                }}
              >
                Tjek igen
              </Button>
              <ButtonLink href="/hjem" variant="ghost">
                Gå til forsiden
              </ButtonLink>
            </div>
          </div>
        ) : null}

        {phase === "logged_out" ? (
          <div className="space-y-4">
            <Alert tone="warning" title="Du er ikke logget ind">
              Log ind igen for at se, om din betaling er bekræftet. Betalingen er ikke gået tabt.
            </Alert>
            <ButtonLink href={loginHref}>Log ind</ButtonLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
