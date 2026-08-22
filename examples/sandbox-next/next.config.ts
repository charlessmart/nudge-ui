import type { NextConfig } from "next";
import { withDesignTool } from "@design-tool/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withDesignTool(nextConfig);
