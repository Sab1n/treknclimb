'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  adminLoginSchema,
  type AdminLoginValues,
} from '../../lib/validators/adminLogin';
import { Field, inputClass } from './Field';

/**
 * The admin sign-in form.
 *
 * Same conventions as every other form on the site — shared Zod schema, inline
 * errors from `Field`, `noValidate` so no browser bubbles, "Required" rather
 * than an asterisk — with two differences that are specific to a login.
 *
 * **`window.location.assign`, not `router.push`.** The session cookie arrives
 * on the login response, and a client-side navigation would render the next
 * page from a cache populated while signed out. A full load makes the browser
 * re-request with the new cookie, which is also what lets the middleware see it.
 *
 * **The server's error message is shown verbatim.** Everywhere else the client
 * softens a failure; here the endpoint has deliberately chosen one sentence
 * that covers a wrong password, an unknown address and a locked account, and
 * rewording it in the browser risks reintroducing the distinction it exists to
 * hide.
 */
export default function AdminLoginForm({ next }: { next: string }) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    shouldFocusError: true,
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: AdminLoginValues) {
    setSubmitError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(
            result.fieldErrors as Record<string, string>
          )) {
            setError(field as keyof AdminLoginValues, {
              type: 'server',
              message,
            });
          }
        }

        setSubmitError(result.error ?? 'Sign-in failed. Please try again.');
        return;
      }

      window.location.assign(next);
    } catch {
      setSubmitError('Could not reach the server. Check your connection.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <Field label="Email" error={errors.email?.message} htmlFor="email" required>
        {(field) => (
          <input
            {...field}
            type="email"
            autoComplete="username"
            autoFocus
            {...register('email')}
            className={inputClass(!!errors.email)}
          />
        )}
      </Field>

      <Field label="Password" error={errors.password?.message} htmlFor="password" required>
        {(field) => (
          <input
            {...field}
            type="password"
            // `current-password` rather than `password`: it tells a password
            // manager to offer a saved credential instead of generating a new
            // one, which is what it would do on a signup form.
            autoComplete="current-password"
            {...register('password')}
            className={inputClass(!!errors.password)}
          />
        )}
      </Field>

      {submitError && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
