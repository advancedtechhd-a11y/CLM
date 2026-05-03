export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Lifecycle<span className="text-blue-600">AI</span>
          </h1>
        </div>
        <div className="bg-white shadow-md rounded-lg p-8">{children}</div>
      </div>
    </div>
  );
}
