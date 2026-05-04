import { redirect } from "next/navigation";

interface HomePageProps {
  searchParams: Promise<{
    shop?: string;
    hmac?: string;
    host?: string;
  }>;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;

  // If Shopify redirected here (e.g. from "Open app" in admin or post-install),
  // bounce to the OAuth start route to get/refresh the access token.
  if (params.shop && params.hmac) {
    const oauthUrl = `/api/connect/shopify?shop=${encodeURIComponent(params.shop)}`;
    redirect(oauthUrl);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Lifecycle<span className="text-blue-600">AI</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          The strategy layer for your customer lifecycle.
        </p>
        <p className="text-base text-gray-500 mb-12">
          Connect your data, get a complete program — CLV scoring, churn prediction,
          next-best-offer — and push to your existing tools in one click.
        </p>
        <div className="text-sm text-gray-400">
          🚧 Pre-MVP — building from spec
        </div>
      </div>
    </main>
  );
}
