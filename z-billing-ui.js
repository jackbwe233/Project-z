import { Z_AUTH_CONFIG } from "./z-auth-config.js";
const button=document.getElementById("start-checkout");
const status=document.getElementById("billing-status");
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/??$/i.test(Z_AUTH_CONFIG.url||"") && !!Z_AUTH_CONFIG.publishableKey;
let client=null, session=null;
async function initialize(){
 if(!configured){ status.textContent="Z Pro billing is not live. The owner must configure Supabase authentication, deploy the Stripe checkout and webhook functions, and set billing secrets first."; return; }
 try{
  const {createClient}=await import("https://esm.sh/@supabase/supabase-js@2.75.0");
  client=createClient(Z_AUTH_CONFIG.url,Z_AUTH_CONFIG.publishableKey);
  const {data,error}=await client.auth.getSession(); if(error)throw error;
  session=data?.session;
  if(!session?.user){status.replaceChildren(document.createTextNode("Sign in before subscribing. "));const a=document.createElement("a");a.href="./account.html";a.textContent="Open Z Account";status.append(a);return;}
  const result=await client.from("z_subscriptions").select("status,current_period_end").eq("user_id",session.user.id).maybeSingle();
  if(result.error)throw result.error;
  const sub=result.data;
  if(sub?.status==="active" && (!sub.current_period_end || new Date(sub.current_period_end).getTime()>Date.now())){status.textContent="Your Z Pro subscription is active.";return;}
  button.disabled=false;status.textContent="Signed in. When checkout is enabled, you'll review the subscription terms with our payment provider before paying.";
 }catch(error){status.textContent="Subscriptions are not ready: "+(error.message||"the billing service is unavailable.");}
}
button.addEventListener("click",async()=>{
 if(!client || !session || button.disabled)return;
 button.disabled=true;status.textContent="Creating your secure checkout session…";
 try{
  const {data,error}=await client.functions.invoke("create-checkout",{body:{plan:"pro-monthly"}});
  if(error)throw error;
  if(!data?.url || !/^https:\/\/checkout\.stripe\.com\//.test(data.url))throw Error("Checkout URL was invalid.");
  location.assign(data.url);
 }catch(error){status.textContent="Could not open checkout: "+(error.message||"please retry.");button.disabled=false;}
});
void initialize();
