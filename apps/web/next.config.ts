import type { NextConfig } from "next"
import { config } from "dotenv"
import { resolve } from "node:path"

// Reuse the root server credentials; app-local/environment values take precedence.
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ["@mastra/core"],
}

export default nextConfig
