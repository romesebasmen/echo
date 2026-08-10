type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const error = (await searchParams).error;
  const showError = error === "invalid";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full border-t border-border pt-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Private Echo
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Welcome back.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Enter the Echo access password to continue.
        </p>

        {showError ? (
          <p role="alert" className="mt-6 text-sm text-accent">
            Echo couldn&rsquo;t verify that password.
          </p>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-8">
          <label
            htmlFor="echo-password"
            className="block text-sm font-medium text-foreground"
          >
            Password
          </label>
          <input
            id="echo-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-foreground outline-none transition-colors focus:border-accent"
          />
          <button
            type="submit"
            className="mt-5 rounded border border-foreground px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Enter Echo
          </button>
        </form>
      </section>
    </main>
  );
}
