/**
 * Supabase Database Types
 *
 * Describes the schema so `createClient<Database>` can type every query.
 * In production, you would generate this using: npx supabase gen types typescript
 *
 * IMPORTANT: every table and view must carry a `Relationships` array and every
 * function an `Args`/`Returns` pair. postgrest-js structurally matches this
 * shape against its `GenericSchema`; if any member is missing the whole schema
 * silently resolves to `never`, which erases type checking on every `.from()`,
 * `.insert()` and `.update()` call in the app rather than raising an error
 * here. Keep the relationship entries in sync with the foreign keys in
 * supabase/migrations — embedded selects (`bookshelf_items(*, book:books(*))`,
 * `users!uploaded_by_user_id(name)`) are typed from them.
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
          name: string | null;
          public_username: string | null;
          avatar_url: string | null;
          is_premium: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          public_username?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          public_username?: string | null;
          avatar_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: 'bookshelves_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      books: {
        Row: {
          id: string;
          title: string;
          author: string;
          image_url: string | null;
          cover_image_url: string | null;
          uploaded_by_user_id: string | null;
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
          cover_image_url?: string | null;
          uploaded_by_user_id?: string | null;
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
          cover_image_url?: string | null;
          uploaded_by_user_id?: string | null;
          is_community?: boolean;
          isbn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'books_uploaded_by_user_id_fkey';
            columns: ['uploaded_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'bookshelf_items_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookshelf_items_shelf_id_fkey';
            columns: ['shelf_id'];
            isOneToOne: false;
            referencedRelation: 'bookshelves';
            referencedColumns: ['id'];
          },
        ];
      };
      content_reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          bookshelf_id: string | null;
          reason: string;
          details: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id: string;
          bookshelf_id?: string | null;
          reason: string;
          details?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          reported_user_id?: string;
          bookshelf_id?: string | null;
          reason?: string;
          details?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_reports_bookshelf_id_fkey';
            columns: ['bookshelf_id'];
            isOneToOne: false;
            referencedRelation: 'bookshelves';
            referencedColumns: ['id'];
          },
        ];
      };
      blocked_users: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_users_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocked_users_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      community_book_spines: {
        Row: {
          id: string | null;
          title: string | null;
          author: string | null;
          image_url: string | null;
          uploaded_by_user_id: string | null;
          uploader_name: string | null;
          times_added: number | null;
          created_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'books_uploaded_by_user_id_fkey';
            columns: ['uploaded_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      get_community_books: {
        Args: {
          page_num?: number;
          page_size?: number;
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
      set_book_cover_url: {
        Args: {
          p_book_id: string;
          p_cover_url: string;
        };
        Returns: undefined;
      };
      refresh_book_cover_url: {
        Args: {
          p_book_id: string;
          p_cover_url: string;
        };
        Returns: undefined;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      reset_my_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      shared_book_ids: {
        Args: Record<string, never>;
        Returns: { book_id: string }[];
      };
      reorder_bookshelf_items: {
        Args: {
          p_shelf_id: string;
          p_item_ids: string[];
        };
        Returns: undefined;
      };
      reorder_bookshelves: {
        Args: {
          p_shelf_ids: string[];
        };
        Returns: undefined;
      };
      random_public_bookshelves: {
        Args: {
          p_limit?: number;
        };
        Returns: Database['public']['Tables']['bookshelves']['Row'][];
      };
    };
    Enums: {
      subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing';
    };
    CompositeTypes: Record<string, never>;
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
