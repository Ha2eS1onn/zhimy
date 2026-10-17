"use client";

import { Suspense } from "react";
import { AtlasScreen } from "@/components/atlas/AtlasScreen";

export default function AtlasPage() {
  return (
    <Suspense fallback={null}>
      <AtlasScreen />
    </Suspense>
  );
}
