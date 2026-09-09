jest.mock('../services/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } }, handleSupabaseError: e => e.message }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS:'ios' } }));
const { supabase } = require('../services/supabase');
const { accountService } = require('../services/account');
const { sessionStorage } = require('../services/sessionStorage');
const asyncStorage = require('@react-native-async-storage/async-storage');
const secure = require('expo-secure-store');
beforeEach(()=>jest.resetAllMocks());
test('missing reset RPC fails without destructive fallback',async()=>{
  supabase.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Migration missing'}});
  expect((await accountService.resetMyData({id:'a'})).error.message).toBe('Migration missing');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
test('deletion failures remain actionable; success is returned only after RPC',async()=>{
  supabase.rpc.mockResolvedValueOnce({error:{message:'Offline'}}).mockResolvedValueOnce({error:null});
  expect((await accountService.deleteMyAccount({id:'a'})).error.message).toBe('Offline');
  expect((await accountService.deleteMyAccount({id:'a'})).error).toBeNull();
});
test('session upgrade writes Keychain before deleting legacy credential',async()=>{
  secure.getItemAsync.mockResolvedValue(null); asyncStorage.getItem.mockResolvedValue('session');
  secure.setItemAsync.mockImplementation(async()=>{expect(asyncStorage.removeItem).not.toHaveBeenCalled();});
  expect(await sessionStorage.getItem('key')).toBe('session');
  expect(secure.setItemAsync).toHaveBeenCalledWith('key','session');
  expect(asyncStorage.removeItem).toHaveBeenCalledWith('key');
});
test('Keychain failure never erases the only anonymous credential',async()=>{
  secure.getItemAsync.mockResolvedValue(null); asyncStorage.getItem.mockResolvedValue('session');
  secure.setItemAsync.mockRejectedValue(new Error('Keychain locked'));
  await expect(sessionStorage.getItem('key')).rejects.toThrow('Keychain locked');
  expect(asyncStorage.removeItem).not.toHaveBeenCalled();
});
test('existing secure session wins over stale legacy session',async()=>{
  secure.getItemAsync.mockResolvedValue('secure');
  expect(await sessionStorage.getItem('key')).toBe('secure');
  expect(asyncStorage.getItem).not.toHaveBeenCalled();
});

test('static web rendering never touches browser storage',async()=>{
  const {Platform}=require('react-native'); Platform.OS='web';
  try {
    expect(await sessionStorage.getItem('key')).toBeNull();
    await sessionStorage.setItem('key','session');
    await sessionStorage.removeItem('key');
    expect(asyncStorage.getItem).not.toHaveBeenCalled();
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
  } finally { Platform.OS='ios'; }
});
