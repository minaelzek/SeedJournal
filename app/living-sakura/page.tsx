import type { Metadata } from "next";

import { LivingSakuraLab } from "@/features/garden/living-sakura/LivingSakuraLab";

export const metadata: Metadata = {
  title: "Living Sakura · Seed Journal",
  description:
    "Meet Seed Journal’s living Sakura — each completed journal leaves a permanent memory petal, and the tree flourishes over time.",
};

export default function LivingSakuraStudyPage() {
  return <LivingSakuraLab />;
}
