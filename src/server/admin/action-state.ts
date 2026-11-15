export interface ActionState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Changes on every submission so the client can react (e.g. reset a form). */
  at?: number;
}

export const initialActionState: ActionState = { ok: false };

export function fail(message: string, errors?: Record<string, string>): ActionState {
  return { ok: false, message, errors, at: Date.now() };
}

export function done(message: string): ActionState {
  return { ok: true, message, at: Date.now() };
}
