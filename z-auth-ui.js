import { Z_AUTH_CONFIG } from "./z-auth-config.js";

/* Email magic-link authentication with Supabase.
   No user passwords, admin secrets, chats, or notes are sent by Z. */
const $ = id => document.getElementById(id);
const status = message => { $("auth-status").textContent = message; };
const AUTH_MODULE = "https://esm.sh/@supabase/supabase-js@2.75.0";
let client = null, mode = "signup", busy = false, unsubscribe = null;
const configured = config => {
  try {
    const endpoint = new URL(config.url);
    const key = String(config.publishableKey || "");
    return endpoint.protocol === "https:" &&
      /^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) &&
      endpoint.pathname === "/" &&
      (key.startsWith("sb_publishable_") || key.startsWith("eyJ")) &&
      key.length > 32 &&
      !key.includes("service_role");
  } catch { return false; }
};
function setMode(next) {
  mode = next === "login" ? "login" : "signup";
  $("mode-signup").setAttribute("aria-pressed", String(mode === "signup"));
  $("mode-login").setAttribute("aria-pressed", String(mode === "login"));
  $("form-heading").textContent = mode === "signup" ? "Create your account" : "Log in to Z";
  $("send-link").textContent = mode === "signup" ? "Create account with email" : "Send login link";
  status("");
}
$("mode-signup").addEventListener("click", () => setMode("signup"));
$("mode-login").addEventListener("click", () => setMode("login"));
function render(user) {
  $("signed-in").hidden = !user;
  $("email-panel").hidden = Boolean(user);
  $("user-email").textContent = user?.email || "Account";
  if (user) status("");
}
function setBusy(value) {
  busy = Boolean(value);
  $("send-link").disabled = busy;
  $("sign-out").disabled = busy;
  $("mode-signup").disabled = busy;
  $("mode-login").disabled = busy;
}
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!client || busy) return;
  const email = $("account-email").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    status("Enter a valid email address."); return;
  }
  setBusy(true);
  status("Requesting a secure sign-in link…");
  try {
    const redirect = new URL("./account.html", location.href);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirect.href,
        shouldCreateUser: mode === "signup",
      },
    });
    if (error) throw error;
    status("Check your email for Z's sign-in link. The email may take a moment to arrive. Do not share the link.");
    $("account-email").value = "";
  } catch (error) {
    status("Unable to send the link: " + (error.message || "please try again later."));
  } finally { setBusy(false); }
});
$("sign-out").addEventListener("click", async () => {
  if (!client || busy) return;
  setBusy(true);
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    render(null);
    status("Signed out of Z on this device. Your locally saved work is unchanged.");
  } catch (error) {
    status("Sign-out failed: " + (error.message || "Please try again."));
  } finally { setBusy(false); }
});
async function init() {
  if (!configured(Z_AUTH_CONFIG)) {
    $("setup-required").hidden = false;
    $("email-panel").hidden = true;
    $("signed-in").hidden = true;
    return;
  }
  $("setup-required").hidden = true;
  $("email-panel").hidden = false;
  setMode("signup");
  status("Connecting to Z's account service…");
  try {
    const { createClient } = await import(AUTH_MODULE);
    client = createClient(Z_AUTH_CONFIG.url, Z_AUTH_CONFIG.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    render(data?.session?.user || null);
    if (!data?.session?.user) status("Create your account or log in with an email link.");
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      render(session?.user || null);
      if (session?.user) status("");
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
  } catch {
    status("Couldn't connect to Z's account service. Check that authentication has been configured.");
    $("send-link").disabled = true;
  }
}
window.addEventListener("pagehide", () => { unsubscribe?.(); });
void init();
