import { Z_AUTH_CONFIG } from "../z-auth-config.js";

const AUTH_MODULE = "https://esm.sh/@supabase/supabase-js@2.75.0";
export function authConfigured(config = Z_AUTH_CONFIG) {
  try {
    const u = new URL(config.url);
    const key = String(config.publishableKey || "");
    return u.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) &&
      u.pathname === "/" && (key.startsWith("sb_publishable_") || key.startsWith("eyJ")) &&
      key.length > 32 && !key.includes("service_role");
  } catch { return false; }
}
/** Guest data stays in legacy local keys; signed-in identities use separate local keys. */
export function accountStorage(storage, userId) {
  if (!storage || !userId) return storage;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid account identity.");
  const prefix = "project-z:account:" + userId + ":";
  return {
    getItem(key) { return storage.getItem(prefix + key); },
    setItem(key, value) { return storage.setItem(prefix + key, value); },
    removeItem(key) { return storage.removeItem(prefix + key); },
  };
}
/** Validate the current account with the auth provider; never trust an email in localStorage. */
export async function resolvePersonalScope(storage, options = {}) {
  const config = options.config || Z_AUTH_CONFIG;
  if (!authConfigured(config)) {
    return { storage, identity: "guest", label: "Guest · this device", configured: false };
  }
  const loader = options.loadClient || (async () => {
    const { createClient } = await import(AUTH_MODULE);
    return createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  });
  const client = await loader();
  const { data, error } = await client.auth.getUser();
  if (error && !["AuthSessionMissingError", "AuthSessionMissing"].includes(error.name) &&
    error.code !== "session_not_found") throw error;
  const user = data?.user;
  if (!user) return { storage, identity: "guest", label: "Guest · this device", configured: true };
  return {
    storage: accountStorage(storage, user.id),
    identity: user.id,
    label: "Account · this device",
    configured: true,
  };
}
