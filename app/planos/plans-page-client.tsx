"use client";

import PlansPage from "@/components/site/plans-page";

export default function PlansPageClient({ session }: { session: boolean }) {
  return <PlansPage session={session} />;
}
