jest.mock('expo/config-plugins',()=>({withInfoPlist:(config,action)=>action(config)}));
const plugin=require('../plugins/withAllowHTTPDevServer');
test.each([undefined,'preview','production'])('HTTP exception is absent for %s builds',profile=>{
 if(profile===undefined) delete process.env.EAS_BUILD_PROFILE; else process.env.EAS_BUILD_PROFILE=profile;
 const result=plugin({modResults:{NSAppTransportSecurity:{NSAllowsArbitraryLoads:true,NSExceptionDomains:{'example.test':{}}}}});
 expect(result.modResults.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBeUndefined();
 expect(result.modResults.NSAppTransportSecurity.NSExceptionDomains).toBeDefined();
});
test('explicit development builds retain Metro HTTP access',()=>{
 process.env.EAS_BUILD_PROFILE='development';
 expect(plugin({modResults:{}}).modResults.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(true);
 delete process.env.EAS_BUILD_PROFILE;
});
