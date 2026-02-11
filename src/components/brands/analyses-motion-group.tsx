"use client";

import type { PropsWithChildren } from "react";
import { LayoutGroup } from "framer-motion";

export function AnalysesMotionGroup({ children }: PropsWithChildren) {
  return <LayoutGroup id="analyses-motion">{children}</LayoutGroup>;
}


