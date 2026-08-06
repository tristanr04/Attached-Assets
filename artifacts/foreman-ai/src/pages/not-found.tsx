export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground text-center px-4">
      <h1 className="text-9xl font-black text-primary mb-4 tracking-tighter">404</h1>
      <h2 className="text-3xl font-bold uppercase tracking-widest mb-6">Page Not Found</h2>
      <p className="text-muted-foreground max-w-md text-lg">
        The page you're looking for doesn't exist or has been moved.
      </p>
    </div>
  );
}