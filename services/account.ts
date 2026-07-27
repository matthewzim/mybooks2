import {
  supabase,
  TABLES,
  STORAGE_BUCKETS,
  handleSupabaseError,
  isMissingFunctionError,
} from './supabase';
import { storageService } from './storage';
import type { ApiResponse, User } from '@/types';

interface OwnedBookAsset {
  id: string;
  image_url: string | null;
  cover_image_url: string | null;
}

class AccountService {
  /**
   * IDs of books this user uploaded that somebody else's shelf still holds.
   *
   * `books` rows are global. Deleting the ones this user uploaded — and their
   * spine/cover files — used to empty those books off *other people's*
   * shelves, which only shows up once the app has more than one user. The
   * caller cannot see other users' private shelves, so the answer comes from
   * a security-definer RPC.
   *
   * Returns an empty set when the RPC isn't deployed yet, which reproduces
   * the old (destructive) behaviour rather than blocking the user's request.
   */
  private async getSharedBookIds(): Promise<Set<string>> {
    const { data, error } = await supabase.rpc('shared_book_ids');

    if (error) {
      if (!isMissingFunctionError(error)) throw error;
      console.warn(
        'shared_book_ids RPC is unavailable; books shared with other users may be removed. Apply the latest migrations.'
      );
      return new Set();
    }

    return new Set((data || []).map((row) => row.book_id));
  }

  private async deleteBucketFolder(
    bucket: string,
    folder: string,
    keepPaths: Set<string>
  ): Promise<void> {
    const listResult = await storageService.listFiles(bucket, folder);

    if (listResult.error || !listResult.data?.length) {
      return;
    }

    const paths = listResult.data
      .map((file) => `${folder}/${file.name}`)
      .filter((path) => !keepPaths.has(path));

    if (paths.length === 0) {
      return;
    }

    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw error;
    }
  }

  private async deleteOwnedStorageAssets(user: User): Promise<void> {
    const sharedBookIds = await this.getSharedBookIds();

    const { data: ownedBooks, error } = await supabase
      .from(TABLES.BOOKS)
      .select('id,image_url,cover_image_url')
      .eq('uploaded_by_user_id', user.id);

    if (error) {
      throw error;
    }

    const deleteRequests: Promise<ApiResponse<null>>[] = [];
    // Spine files live under `<userId>/…` and are swept folder-wide below;
    // remember the ones still in use so that sweep skips them.
    const keepSpinePaths = new Set<string>();

    (ownedBooks as OwnedBookAsset[] | null)?.forEach((book) => {
      // Assets for a book another user still has on a shelf are that user's
      // content now. Leaving the row behind but deleting its images would
      // turn their shelf into blank spines.
      if (sharedBookIds.has(book.id)) {
        const spinePath = storageService.getStoragePath(
          book.image_url,
          STORAGE_BUCKETS.BOOK_SPINES
        );
        if (spinePath) keepSpinePaths.add(spinePath);
        return;
      }

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
      this.deleteBucketFolder(STORAGE_BUCKETS.BOOK_SPINES, user.id, keepSpinePaths),
      this.deleteBucketFolder(STORAGE_BUCKETS.AVATARS, user.id, new Set()),
    ]);
  }

  async resetMyData(user: User): Promise<ApiResponse<null>> {
    try {
      await this.deleteOwnedStorageAssets(user);

      // One transactional RPC: shelves go, uploaded books go only when no
      // other shelf references them, and the rest are released rather than
      // deleted. Doing this as separate client deletes could half-apply and
      // took other users' books with it.
      const { error } = await supabase.rpc('reset_my_data');

      if (error && !isMissingFunctionError(error)) {
        throw error;
      }

      if (error) {
        await this.resetMyDataFallback(user);
      }

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Pre-RPC reset path, used only when the migration hasn't been applied.
   * Books other users still hold are left alone instead of being deleted.
   */
  private async resetMyDataFallback(user: User): Promise<void> {
    const sharedBookIds = await this.getSharedBookIds();

    const { error: shelfError } = await supabase
      .from(TABLES.BOOKSHELVES)
      .delete()
      .eq('user_id', user.id);

    if (shelfError) {
      throw shelfError;
    }

    let booksQuery = supabase
      .from(TABLES.BOOKS)
      .delete()
      .eq('uploaded_by_user_id', user.id);

    if (sharedBookIds.size > 0) {
      booksQuery = booksQuery.not(
        'id',
        'in',
        `(${[...sharedBookIds].join(',')})`
      );
    }

    const { error: booksError } = await booksQuery;

    if (booksError) {
      throw booksError;
    }

    const { error: userError } = await supabase
      .from(TABLES.USERS)
      .update({
        name: null,
        public_username: null,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (userError) {
      throw userError;
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
