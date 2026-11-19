/**
 * Hand-maintained to match supabase/migrations. Shape follows the output of
 * `supabase gen types typescript`, so it can be regenerated with the CLI.
 */
export type Database = {
  public: {
    Tables: {
      dealers: {
        Row: {
          id: string;
          dealer_name: string;
          city: string;
          province: string | null;
          reporting_region: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dealer_name: string;
          city: string;
          province?: string | null;
          reporting_region: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["dealers"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_groups: {
        Row: {
          id: string;
          group_name: string;
          dealer_id: string | null;
          reporting_region: string;
          group_link: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_name: string;
          dealer_id?: string | null;
          reporting_region: string;
          group_link?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_groups"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      region_mappings: {
        Row: {
          id: string;
          normalized_name: string;
          city: string | null;
          province: string | null;
          reporting_region: string | null;
          source: string;
          confidence: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          normalized_name: string;
          city?: string | null;
          province?: string | null;
          reporting_region?: string | null;
          source: string;
          confidence?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["region_mappings"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          submission_id: string;
          name: string;
          phone: string;
          domicile: string;
          city: string | null;
          province: string | null;
          reporting_region: string;
          classification_status: string;
          lead_date: string | null;
          report_date: string;
          created_at: string;
          updated_at: string;
          dealer_id: string;
          unit: string;
          source: string;
          customer_note: string | null;
        };
        Insert: {
          id?: string;
          submission_id: string;
          name: string;
          phone: string;
          domicile: string;
          city?: string | null;
          province?: string | null;
          reporting_region: string;
          classification_status: string;
          lead_date?: string | null;
          /** Set by trigger; any value sent is overwritten. */
          report_date?: string;
          dealer_id: string;
          unit: string;
          source: string;
          customer_note?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["leads"]["Insert"], "submission_id">>;
        Relationships: [
          {
            foreignKeyName: "leads_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      service_entries: {
        Row: {
          id: string;
          submission_id: string;
          dealer_id: string;
          name: string;
          location: string;
          unit: string;
          source: string;
          final_note: string | null;
          entry_date: string | null;
          report_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          dealer_id: string;
          name: string;
          location: string;
          unit: string;
          source: string;
          final_note?: string | null;
          entry_date?: string | null;
          /** Set by trigger; any value sent is overwritten. */
          report_date?: string;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["service_entries"]["Insert"], "submission_id">>;
        Relationships: [
          {
            foreignKeyName: "service_entries_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      sheet_months: {
        Row: {
          month_key: string;
          sheet_id: number | null;
          revision: number;
          synced_revision: number;
          last_attempt_at: string | null;
          last_synced_at: string | null;
          last_error: string | null;
          lock_token: string | null;
          locked_until: string | null;
          created_at: string;
        };
        Insert: { month_key: string };
        Update: { sheet_id?: number | null };
        Relationships: [];
      };
      spreadsheet_sync_logs: {
        Row: {
          id: string;
          lead_id: string | null;
          service_id: string | null;
          spreadsheet_month: string;
          sync_status: string;
          error_message: string | null;
          retry_count: number;
          change_seq: number;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "spreadsheet_sync_logs_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spreadsheet_sync_logs_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: true;
            referencedRelation: "service_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_handovers: {
        Row: {
          id: string;
          lead_id: string;
          whatsapp_group_id: string;
          copied_at: string | null;
          opened_at: string | null;
          sent_marked_at: string | null;
          created_at: string;
          auto_status: string | null;
          auto_error: string | null;
          auto_attempts: number;
          auto_queued_at: string | null;
          auto_updated_at: string | null;
        };
        Insert: {
          id?: string;
          lead_id: string;
          whatsapp_group_id: string;
        };
        Update: {
          copied_at?: string | null;
          opened_at?: string | null;
          sent_marked_at?: string | null;
          auto_status?: string | null;
          auto_queued_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_handovers_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_handovers_whatsapp_group_id_fkey";
            columns: ["whatsapp_group_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_groups";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      try_acquire_sheet_lock: {
        Args: { p_month: string; p_token: string; p_ttl_seconds: number };
        Returns: boolean;
      };
      release_sheet_lock: {
        Args: { p_month: string; p_token: string };
        Returns: undefined;
      };
      complete_sheet_sync: {
        Args: { p_month: string; p_token: string; p_revision: number; p_sheet_id: number; p_logs: { id: string; change_seq: number }[] };
        Returns: undefined;
      };
      fail_sheet_sync: {
        Args: { p_month: string; p_error: string };
        Returns: undefined;
      };
      claim_whatsapp_sends: {
        Args: { p_limit: number; p_stale_seconds: number };
        Returns: {
          handover_id: string;
          group_name: string;
          lead_name: string;
          domicile: string;
          unit: string;
          source: string;
          phone: string;
          customer_note: string | null;
        }[];
      };
      finish_whatsapp_send: {
        Args: { p_handover: string; p_ok: boolean; p_error: string | null };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
