/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        // Local Supabase
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/**',
      },
      {
        // Production Supabase (use your project ref)
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/**',
      },
      {
        // Replicate CDN (for temporary URLs)
        protocol: 'https',
        hostname: 'replicate.delivery',
      },
      {
        protocol: 'https',
        hostname: '**.replicate.delivery',
      },
    ],
  },
};

export default nextConfig;
