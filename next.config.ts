import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Menu upload takes a phone photo of a menu; the server-action default
      // of 1MB rejects one before the action even runs. Matches
      // MAX_UPLOAD_BYTES in src/lib/menu-draft.ts.
      bodySizeLimit: '8mb',
    },
  },
}

export default nextConfig
