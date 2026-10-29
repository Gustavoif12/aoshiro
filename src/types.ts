export type Currency = "BRL" | "USD" | "EUR";
export type Language = "pt-BR" | "en-US" | "es-ES";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          currency: Currency;
          language: Language;
          dark_mode: boolean;
          hide_balance: boolean;
          notifications_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          phone?: string | null;
          currency?: Currency;
          language?: Language;
          dark_mode?: boolean;
          hide_balance?: boolean;
          notifications_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          phone?: string | null;
          currency?: Currency;
          language?: Language;
          dark_mode?: boolean;
          hide_balance?: boolean;
          notifications_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: number;
          user_id: string;
          name: string;
          color: string;
          budget: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          name: string;
          color?: string;
          budget?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
          budget?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      debts: {
        Row: {
          id: number;
          user_id: string;
          title: string;
          value: number;
          due_date: string;
          reminder_date: string | null;
          category_id: number | null;
          month_key: string;
          paid: boolean;
          paid_at: string | null;
          payment_method: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          title: string;
          value: number;
          due_date: string;
          reminder_date?: string | null;
          category_id?: number | null;
          month_key: string;
          paid?: boolean;
          paid_at?: string | null;
          payment_method?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          value?: number;
          due_date?: string;
          reminder_date?: string | null;
          category_id?: number | null;
          month_key?: string;
          paid?: boolean;
          paid_at?: string | null;
          payment_method?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "debts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "debts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      monthly_budgets: {
        Row: {
          id: number;
          user_id: string;
          month: string;
          amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          month: string;
          amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          month?: string;
          amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_budgets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      goals: {
        Row: {
          id: number;
          user_id: string;
          label: string;
          target: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          label: string;
          target: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          target?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      goal_deposits: {
        Row: {
          id: number;
          user_id: string;
          goal_id: number;
          month: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          goal_id: number;
          month: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          goal_id?: number;
          month?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_deposits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_deposits_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
