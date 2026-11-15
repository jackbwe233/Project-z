import { createClient } from "npm:@supabase/supabase-js@2";
const encoder=new TextEncoder();
function fromHex(hex){
 if(!/^[0-9a-f]{64}$/i.test(hex))return null;
 return Uint8Array.from(hex.match(/.{2}/g)||[],v=>parseInt(v,16));
}
async function validSignature(raw,header,secret){
 const parts=header.split(",").map(s=>s.trim().split("="));
 const stamp=parts.find(x=>x[0]==="t")?.[1];
 const signatures=parts.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!stamp || !/^\d{10,}$/.test(stamp) || Math.abs(Date.now()/1000-Number(stamp))>300)return false;
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const data=encoder.encode(stamp+"."+raw);
 for(const signature of signatures){const bytes=fromHex(signature);if(bytes && await crypto.subtle.verify("HMAC",key,bytes,data))return true;}
 return false;
}
Deno.serve(async request=>{
 if(request.method!=="POST")return new Response("Method not allowed",{status:405});
 const secret=Deno.env.get("STRIPE_WEBHOOK_SECRET");
 const adminKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), url=Deno.env.get("SUPABASE_URL");
 if(!secret||!adminKey||!url)return new Response("Webhook not configured",{status:503});
 const raw=await request.text();
 if(!(await validSignature(raw,request.headers.get("Stripe-Signature")||"",secret)))return new Response("Invalid signature",{status:400});
 let event;try{event=JSON.parse(raw)}catch{return new Response("Bad payload",{status:400})}
 const object=event.data?.object||{};
 const client=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
 if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
  const userId=object.metadata?.z_user_id;
  if(!/^[a-f0-9-]{36}$/i.test(userId||""))return new Response("Missing user ID",{status:400});
  const period=object.items?.data?.[0]?.current_period_end||object.current_period_end;
  const payload={user_id:userId,stripe_customer_id:object.customer||null,
   stripe_subscription_id:object.id||null,
   status:event.type==="customer.subscription.deleted"?"canceled":object.status||"pending",
   current_period_end:period?new Date(period*1000).toISOString():null,
   updated_at:new Date().toISOString()};
  const {error}=await client.from("z_subscriptions").upsert(payload,{onConflict:"user_id"});
  if(error)return new Response("Database write failed",{status:500});
 }
 return new Response("ok",{status:200});
});
