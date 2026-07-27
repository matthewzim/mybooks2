/**
 * Moderation Service
 *
 * Report and block functionality for community (user-generated) content,
 * required by App Store Review Guideline 1.2:
 * - Report objectionable content or users (rows land in content_reports
 *   for review in the Supabase dashboard)
 * - Block abusive users (client filters blocked users out of community
 *   surfaces)
 */

import { supabase, handleSupabaseError } from './supabase';
import type { ApiResponse } from '@/types';

/** Preset reasons shown in the report dialog */
export const REPORT_REASONS = [
  'Inappropriate images',
  'Offensive name or username',
  'Spam',
  'Other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

class ModerationService {
  private async requireUserId(): Promise<string> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (!userId) {
      throw new Error('Not authenticated');
    }
    return userId;
  }

  /**
   * File a report against another user's content.
   *
   * @param reportedUserId - The user whose content is being reported
   * @param reason - One of REPORT_REASONS
   * @param bookshelfId - Optional shelf the report refers to
   */
  async reportUser(
    reportedUserId: string,
    reason: string,
    bookshelfId?: string
  ): Promise<ApiResponse<null>> {
    try {
      const reporterId = await this.requireUserId();

      const { error } = await supabase.from('content_reports').insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        bookshelf_id: bookshelfId ?? null,
        reason,
      });

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Block a user. Their shelves and profile stop appearing in community
   * surfaces for the current user.
   */
  async blockUser(blockedId: string): Promise<ApiResponse<null>> {
    try {
      const blockerId = await this.requireUserId();

      const { error } = await supabase.from('blocked_users').upsert(
        { blocker_id: blockerId, blocked_id: blockedId },
        { onConflict: 'blocker_id,blocked_id' }
      );

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Unblock a previously blocked user.
   */
  async unblockUser(blockedId: string): Promise<ApiResponse<null>> {
    try {
      const blockerId = await this.requireUserId();

      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get the IDs of all users the current user has blocked.
   * Returns an empty list when signed out or on error, so callers can
   * always use it directly in a filter.
   */
  async getBlockedUserIds(): Promise<string[]> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', userId);

      if (error) throw error;

      return (data ?? []).map((row) => row.blocked_id);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
      return [];
    }
  }

  /**
   * Whether the current user has blocked the given user.
   */
  async isBlocked(userId: string): Promise<boolean> {
    const blocked = await this.getBlockedUserIds();
    return blocked.includes(userId);
  }
}

export const moderationService = new ModerationService();

export default moderationService;
