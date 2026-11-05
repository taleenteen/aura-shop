import { useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck } from "lucide-react";
import { apiClient, type ApiRequestError } from "@/lib/api-client";
import type { EmailMessage } from "@/types/api";
import { AccountEmailViewer } from "@/features/orders/email-viewer";
import { z } from "zod";
import { validate, email as emailRule } from "@/lib/validation";

const forgotSchema = z.object({ email: emailRule() });

interface Props {
  initialEmail: string;
  onBack: () => void;
  /** Called before following the reset link, so the sign-in modal can close. */
  onLeave: () => void;
}

/** "Forgot password?" inside the sign-in modal: request a reset link, then open the email. */
export function ForgotPasswordPanel({ initialEmail, onBack, onLeave }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailId, setEmailId] = useState<string | null>(null);
  const [message, setMessage] = useState<EmailMessage | null>(null);
  const [opening, setOpening] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const checked = validate(forgotSchema, { email });
    if (!checked.ok) {
      setError(checked.fields.email);
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient<{ email_id?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(checked.data),
      });
      setSentTo(checked.data.email);
      setEmailId(res.data.email_id ?? null);
    } catch (err) {
      const apiErr = err as ApiRequestError;
      setError(apiErr.fields?.email || apiErr.message || "We couldn't send the email. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const openEmail = async () => {
    if (!emailId) return;
    setOpening(true);
    try {
      const res = await apiClient<EmailMessage>(`/auth/emails/${emailId}`);
      setMessage(res.data);
    } catch {
      setError("We couldn't open the email. Please request a new link.");
    } finally {
      setOpening(false);
    }
  };

  const field =
    "w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white";

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to sign in
      </button>

      {sentTo ? (
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600">
            <MailCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Check your email</h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              If an account exists for <strong className="text-zinc-900 dark:text-white">{sentTo}</strong>, we've sent a link to reset the password. It expires in 30 minutes.
            </p>
          </div>
          {emailId && (
            <button
              type="button"
              onClick={openEmail}
              disabled={opening}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Open email
            </button>
          )}
          <button type="button" onClick={() => setSentTo(null)} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2 cursor-pointer">
            Use a different email
          </button>
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 mb-1">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Forgot your password?</h2>
            <p className="text-xs text-zinc-500">Enter your account email and we'll send you a link to choose a new one.</p>
          </div>
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={field} />
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Send reset link
          </button>
        </form>
      )}

      {message && (
        <AccountEmailViewer
          email={message}
          onClose={() => setMessage(null)}
          onFollow={onLeave}
        />
      )}
    </div>
  );
}
