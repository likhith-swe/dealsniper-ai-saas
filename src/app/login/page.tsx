import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/app/login/LoginForm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabaseConfigured, magicLinkDeliveryMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Passwordless sign-in for DealSniper AI price-drop alerts, keyword triggers and affiliate click analytics.",
  robots: { index: false, follow: false },
};

/** Sign-in surface. Already-authenticated callers continue straight to the requested route. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const rawNext = params.next;
  const nextPath = (Array.isArray(rawNext) ? rawNext[0] : rawNext) ?? "/dashboard";

  if (user) {
    redirect(nextPath.startsWith("/") ? nextPath : "/dashboard");
  }

  const rawError = params.error;
  const errorValue = Array.isArray(rawError) ? rawError[0] : rawError;

  return (
    <div className="flex min-h-[70vh] items-center justify-center pt-8">
      <LoginForm
        nextPath={nextPath.startsWith("/") ? nextPath : "/dashboard"}
        initialError={errorValue ?? null}
        googleConfigured={isSupabaseConfigured()}
        deliveryMode={magicLinkDeliveryMode()}
      />
    </div>
  );
}
