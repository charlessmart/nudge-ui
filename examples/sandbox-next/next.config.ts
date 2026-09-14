import type { NextConfig } from "next";
import { withNudgeUi } from "nudge-ui/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withNudgeUi(nextConfig);
