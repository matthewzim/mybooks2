import { supabase, handleSupabaseError } from './supabase';
import type { ApiResponse, User } from '@/types';

class AccountService {
  // Database changes and the durable storage-cleanup queue commit together.
  // Never delete images first or fall back to nontransactional client deletes.
  private async run(name: 'reset_my_data' | 'delete_my_account'): Promise<ApiResponse<null>> {
    try {
      const { error } = await supabase.rpc(name);
      if (error) throw error;
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: { message: handleSupabaseError(error) } };
    }
  }
  resetMyData(_user: User) { return this.run('reset_my_data'); }
  deleteMyAccount(_user: User) { return this.run('delete_my_account'); }
}
export const accountService = new AccountService();
export default accountService;
