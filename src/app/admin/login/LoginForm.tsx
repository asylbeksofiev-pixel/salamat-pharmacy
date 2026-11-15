"use client";
import { useActionState } from "react";
import { loginAction } from "../auth-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { ok: false });
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state.message ? <Notice tone="danger">{state.message}</Notice> : null}
      <Input id="email" name="email" type="email" label="E-mail" autoComplete="username" required maxLength={200} />
      <Input id="password" name="password" type="password" label="Пароль" autoComplete="current-password" required maxLength={200} />
      <Button type="submit" size="lg" loading={pending}>
        Войти
      </Button>
    </form>
  );
}
