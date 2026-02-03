/**
 * Supabase Database Types
 * This file defines the database schema types for Supabase
 * In production, you would generate this using: npx supabase gen types typescript
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          is_premium: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookshelves: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_color: string;
          is_public: boolean;
          shelf_style: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          cover_color?: string;
          is_public?: boolean;
          shelf_style?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          cover_color?: string;
          is_public?: boolean;
          shelf_style?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      books: {
        Row: {
          id: string;
          title: string;
          author: string;
          image_url: string | null;
          uploaded_by_user_id: string;
          is_community: boolean;
          isbn: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          author: string;
          image_url?: string | null;
          uploaded_by_user_id: string;
          is_community?: boolean;
          isbn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          author?: string;
          image_url?: string | null;
          uploaded_by_user_id?: string;
          is_community?: boolean;
          isbn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookshelf_items: {
        Row: {
          id: string;
          book_id: string;
          shelf_id: string;
          position: number;
          review: string | null;
          rating: number | null;
          is_stacked: boolean;
          stack_id: string | null;
          stack_position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          shelf_id: string;
          position?: number;
          review?: string | null;
          rating?: number | null;
          is_stacked?: boolean;
          stack_id?: string | null;
          stack_position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          book_id?: string;
          shelf_id?: string;
          position?: number;
          review?: string | null;
          rating?: number | null;
          is_stacked?: boolean;
          stack_id?: string | null;
          stack_position?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan_id: string;
          status: string;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan_id: string;
          status?: string;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan_id?: string;
          status?: string;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      community_book_spines: {
        Row: {
          id: string;
          title: string;
          author: string;
          image_url: string;
          uploaded_by_user_id: string;
          uploader_name: string | null;
          times_added: number;
          created_at: string;
        };
      };
    };
    Functions: {
      get_community_books: {
        Args: {
          page_num: number;
          page_size: number;
          search_query?: string;
        };
        Returns: {
          id: string;
          title: string;
          author: string;
          image_url: string;
          uploaded_by_user_id: string;
          uploader_name: string | null;
          times_added: number;
          created_at: string;
        }[];
      };
    };
    Enums: {
      subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing';
    };
  };
}

// Helper type for getting table row types
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

// Helper type for inserting into tables
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

// Helper type for updating tables
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
