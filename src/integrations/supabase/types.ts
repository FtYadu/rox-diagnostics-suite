export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      dealers: {
        Row: {
          created_at: string;
          id: string;
          logo_path: string | null;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          logo_path?: string | null;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          logo_path?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      job_attachments: {
        Row: {
          created_at: string;
          dealer_id: string;
          id: string;
          job_id: string;
          kind: string;
          path: string;
          size_bytes: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dealer_id: string;
          id?: string;
          job_id: string;
          kind: string;
          path: string;
          size_bytes?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dealer_id?: string;
          id?: string;
          job_id?: string;
          kind?: string;
          path?: string;
          size_bytes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_attachments_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_attachments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_events: {
        Row: {
          client_event_id: string;
          created_at: string;
          detail: string;
          ecu_id: string | null;
          id: string;
          job_id: string;
          kind: string;
          occurred_at: string;
          payload: Json | null;
          status: string;
          title: string;
          user_id: string;
        };
        Insert: {
          client_event_id: string;
          created_at?: string;
          detail?: string;
          ecu_id?: string | null;
          id?: string;
          job_id: string;
          kind: string;
          occurred_at?: string;
          payload?: Json | null;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          client_event_id?: string;
          created_at?: string;
          detail?: string;
          ecu_id?: string | null;
          id?: string;
          job_id?: string;
          kind?: string;
          occurred_at?: string;
          payload?: Json | null;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          actions_count: number;
          created_at: string;
          dealer_id: string | null;
          dtc_critical: number;
          dtc_total: number;
          ended_at: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          started_at: string;
          status: string;
          summary: string;
          summary_data: Json;
          technician: string;
          title: string;
          updated_at: string;
          user_id: string;
          vin: string;
        };
        Insert: {
          actions_count?: number;
          created_at?: string;
          dealer_id?: string | null;
          dtc_critical?: number;
          dtc_total?: number;
          ended_at?: string | null;
          finished_at?: string | null;
          id: string;
          kind: string;
          started_at?: string;
          status?: string;
          summary?: string;
          summary_data?: Json;
          technician: string;
          title: string;
          updated_at?: string;
          user_id: string;
          vin: string;
        };
        Update: {
          actions_count?: number;
          created_at?: string;
          dealer_id?: string | null;
          dtc_critical?: number;
          dtc_total?: number;
          ended_at?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          started_at?: string;
          status?: string;
          summary?: string;
          summary_data?: Json;
          technician?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          vin?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          dealer_id: string;
          display_name: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dealer_id: string;
          display_name?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dealer_id?: string;
          display_name?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          environment: string;
          id: string;
          price_id: string;
          product_id: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id: string;
          product_id: string;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id?: string;
          product_id?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_dealer_id: { Args: never; Returns: string };
      current_role_name: { Args: never; Returns: string };
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
