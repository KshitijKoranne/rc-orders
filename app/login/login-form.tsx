"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ timedOut }: { timedOut: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          response.status === 503
            ? "The access password is not configured yet."
            : payload?.error === "Password not accepted"
              ? "That password is not correct."
              : "Could not sign in. Try again.",
        );
        return;
      }
      window.location.replace("/");
    } catch {
      setError("Could not sign in. Check the connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <span className="login-kicker">Private workspace</span>
        </div>
        <h1 id="login-title">Rithya Creations</h1>
        <p className="login-intro">
          Enter the access password to open the order book.
        </p>
        {timedOut && (
          <p className="login-message" role="status">
            Your session ended after 5 minutes without activity.
          </p>
        )}
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="access-password">Password</label>
          <input
            autoComplete="current-password"
            autoFocus
            id="access-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Checking password…" : "Open workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
