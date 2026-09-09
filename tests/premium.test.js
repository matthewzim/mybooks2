jest.mock('../supabase/functions/_shared/runtime.ts',()=>({admin:jest.fn()}));
const {premiumState}=require('../supabase/functions/_shared/premium.ts');
function subscriber(expires, extras={}) { return {entitlements:{'Virtual Library Pro':{expires_date:expires,product_identifier:'monthly'}},subscriptions:{monthly:{is_sandbox:false,...extras}}}; }
test('active renewal, expiration and cancellation before expiration',()=>{
 expect(premiumState(subscriber('2030-01-01'),Date.parse('2029-01-01')).active).toBe(true);
 expect(premiumState(subscriber('2030-01-01'),Date.parse('2031-01-01')).active).toBe(false);
 expect(premiumState(subscriber('2030-01-01',{unsubscribe_detected_at:'2029-01-01'}),Date.parse('2029-01-02')).active).toBe(true);
});
test('billing grace period is preserved and invalid expiry fails closed',()=>{
 expect(premiumState(subscriber('2029-01-01',{grace_period_expires_date:'2030-01-01'}),Date.parse('2029-06-01')).active).toBe(true);
 expect(premiumState(subscriber('invalid'),Date.now()).active).toBe(false);
});
test('production rejects sandbox and missing entitlement',()=>{
 expect(premiumState(subscriber('2030-01-01',{is_sandbox:true}),Date.parse('2029-01-01')).active).toBe(false);
 expect(premiumState({},Date.now()).active).toBe(false);
});
