import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async request=>{
 const appUrl=Deno.env.get("Z_APP_URL")||"";
 const origin=appUrl?new URL(appUrl).origin:"";
 const cors={"Access-Control-Allow-Origin":origin||"null","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
 const respond=(message,status=400)=>new Response(JSON.stringify({error:message}),{status,headers:{...cors,"Content-Type":"application/json"}});
 if(request.headers.get("Origin")!==origin)return respond("Origin not allowed",403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST")return respond("Method not allowed",405);
 const secret=Deno.env.get("STRIPE_SECRET_KEY"), price=Deno.env.get("STRIPE_PRICE_ID");
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!secret||!price||!url||!anon||!appUrl)return respond("Checkout setup incomplete",503);
 const bearer=request.headers.get("Authorization")||"";
 if(!bearer.startsWith("Bearer "))return respond("Sign in required",401);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(bearer.slice(7));
 if(error||!data?.user?.id)return respond("Session invalid",401);
 const body=await request.json().catch(()=>({}));
 if(body?.plan!=="pro-monthly")return respond("Unknown plan");
 const user=data.user;
 const form=new URLSearchParams({
   mode:"subscription",
   "line_items[0][price]":price,"line_items[0][quantity]":"1",
   success_url:new URL("./billing.html?checkout=return",appUrl.endsWith("/")?appUrl:appUrl+"/").href,
   cancel_url:new URL("./billing.html?checkout=cancel",appUrl.endsWith("/")?appUrl:appUrl+"/").href,
   client_reference_id:user.id,
   "metadata[z_user_id]":user.id,
   "subscription_data[metadata][z_user_id]":user.id,
 });
 if(user.email)form.set("customer_email",user.email);
 const checkout=await fetch("https://api.stripe.com/v1/checkout/sessions",{
   method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body:form
 });
 const result=await checkout.json().catch(()=>({}));
 if(!checkout.ok || typeof result.url!=="string")return respond("Payment provider unavailable",502);
 return new Response(JSON.stringify({url:result.url}),{headers:{...cors,"Content-Type":"application/json"}});
});
