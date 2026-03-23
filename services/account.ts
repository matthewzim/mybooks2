import { supabase, TABLES, STORAGE_BUCKETS, handleSupabaseError } from './supabase';
import { storageService } from './storage';
import type { ApiResponse, User } from '@/types';

interface OwnedBookAsset {
  id: string;
  image_url: string | null;
  cover_image_url: string | null;
}

class AccountService {
  private async deleteBucketFolder(bucket: string, folder: string): Promise<void> {
    const listResult = await storageService.listFiles(bucket, folder);

    if (listResult.error || !listResult.data?.length) {
      return;
    }

    const paths = listResult.data.map((file) => `${folder}/${file.name}`);
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw error;
    }
  }

  private async deleteOwnedStorageAssets(user: User): Promise<void> {
    const { data: ownedBooks, error } = await supabase
      .from(TABLES.BOOKS)
      .select('id,image_url,cover_image_url')
      .eq('uploaded_by_user_id', user.id);

    if (error) {
      throw error;
    }

    const deleteRequests: Promise<ApiResponse<null>>[] = [];

    (ownedBooks as OwnedBookAsset[] | null)?.forEach((book) => {
      if (book.image_url) {
        deleteRequests.push(storageService.deleteBookSpine(book.image_url));
      }

      if (book.cover_image_url) {
        deleteRequests.push(storageService.deleteBookCover(book.cover_image_url));
      }
    });

    if (user.avatar_url) {
      deleteRequests.push(storageService.deleteAvatar(user.avatar_url));
    }

    const deleteResults = await Promise.all(deleteRequests);
    const deleteError = deleteResults.find((result) => result.error);

    if (deleteError?.error) {
      throw new Error(deleteError.error.message);
    }

    await Promise.all([
      this.deleteBucketFolder(STORAGE_BUCKETS.BOOK_SPINES, user.id),
      this.deleteBucketFolder(STORAGE_BUCKETS.AVATARS, user.id),
    ]);
  }

  async resetMyData(user: User): Promise<ApiResponse<null>> {
    try {
      await this.deleteOwnedStorageAssets(user);

      const { error: shelfError } = await supabase
        .from(TABLES.BOOKSHELVES)
        .delete()
        .eq('user_id', user.id);

      if (shelfError) {
        throw shelfError;
      }

      const { error: booksError } = await supabase
        .from(TABLES.BOOKS)
        .delete()
        .eq('uploaded_by_user_id', user.id);

      if (booksError) {
        throw booksError;
      }

      const { error: userError } = await supabase
        .from(TABLES.USERS)
        .update({
          name: null,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (userError) {
        throw userError;
      }

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  async deleteMyAccount(user: User): Promise<ApiResponse<null>> {
    try {
      await this.deleteOwnedStorageAssets(user);

      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        throw error;
      }

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }
}

export const accountService = new AccountService();

export default accountService;
