"use client";

import { usePathname } from "next/navigation";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";
import { MenuSkeleton } from "@/components/menu/menu-states";

export function RouteLoading() {
  const path = usePathname();
  return path.startsWith("/dashboard") || path.startsWith("/admin") ? <DashboardSkeleton /> : <MenuSkeleton />;
}
