import type { NextConfig } from "next";
import { withNudgeUi } from "@nudge-ui/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withNudgeUi(nextConfig);
