jest.mock('../supabase/functions/_shared/runtime.ts',()=>({authorizedSecret:jest.fn(),json:(body,status=200)=>new Response(JSON.stringify(body),{status})}));
jest.mock('../supabase/functions/_shared/premium.ts',()=>({syncPremium:jest.fn()}));
const {authorizedSecret}=require('../supabase/functions/_shared/runtime.ts');
const {syncPremium}=require('../supabase/functions/_shared/premium.ts');
let handler;
global.Deno={serve:fn=>{handler=fn;}};
require('../supabase/functions/revenuecat-webhook/index.ts');
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const request=event=>new Request('https://example.test',{method:'POST',body:JSON.stringify({event})});
beforeEach(()=>{jest.resetAllMocks();authorizedSecret.mockResolvedValue(true);});
test('unauthorized webhooks cannot trigger reconciliation',async()=>{
 authorizedSecret.mockResolvedValue(false);
 expect((await handler(request({type:'INITIAL_PURCHASE',app_user_id:A}))).status).toBe(401);
 expect(syncPremium).not.toHaveBeenCalled();
});
test('transfers reconcile both identities and deduplicate aliases',async()=>{
 expect((await handler(request({type:'TRANSFER',app_user_id:B,aliases:[B],transferred_from:[A],transferred_to:[B]}))).status).toBe(200);
 expect(syncPremium.mock.calls.map(c=>c[0]).sort()).toEqual([A,B]);
});
test('provider outage asks RevenueCat to retry instead of acknowledging loss',async()=>{
 syncPremium.mockRejectedValue(new Error('Provider offline'));
 expect((await handler(request({type:'EXPIRATION',app_user_id:A}))).status).toBe(503);
});
