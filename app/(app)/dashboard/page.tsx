export default function DashboardPage() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-2">Welcome 👋</h2>
      <p className="text-gray-600 mb-8">
        You&apos;re signed in. The dashboard is empty for now — coming in Week 3+ of the build.
      </p>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">Build progress</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>✅ Week 1: Project scaffolding</li>
          <li>✅ Week 2: Auth flow (you&apos;re using it now)</li>
          <li>⏳ Week 3: Dashboard shell, sidebar, settings</li>
          <li>⏳ Week 4: Stripe Connect integration</li>
          <li>⏳ Week 5+: ...</li>
        </ul>
      </div>
    </div>
  );
}
