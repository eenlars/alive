// Auto-generated app schema types
// Generated from Supabase database
// DO NOT EDIT MANUALLY - Run 'bun run gen:types' to regenerate
//
// Schema: app
// Project: qnvprftdorualkdyogka

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  app: {
    Tables: {
      automation_jobs: {
        Row: {
          action_format_prompt: string | null
          action_model: string | null
          action_prompt: string | null
          action_source: Json | null
          action_target_page: string | null
          action_thinking: string | null
          action_timeout_seconds: number | null
          action_type: Database["app"]["Enums"]["automation_action_type"]
          claimed_by: string | null
          consecutive_failures: number | null
          created_at: string
          cron_schedule: string | null
          cron_timezone: string | null
          delete_after_run: boolean | null
          description: string | null
          email_address: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_duration_ms: number | null
          last_run_error: string | null
          last_run_status: Database["app"]["Enums"]["automation_run_status"] | null
          lease_expires_at: string | null
          name: string
          next_run_at: string | null
          org_id: string
          run_at: string | null
          run_id: string | null
          running_at: string | null
          site_id: string
          skills: string[] | null
          status: Database["app"]["Enums"]["automation_job_status"]
          trigger_type: Database["app"]["Enums"]["automation_trigger_type"]
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          action_format_prompt?: string | null
          action_model?: string | null
          action_prompt?: string | null
          action_source?: Json | null
          action_target_page?: string | null
          action_thinking?: string | null
          action_timeout_seconds?: number | null
          action_type: Database["app"]["Enums"]["automation_action_type"]
          claimed_by?: string | null
          consecutive_failures?: number | null
          created_at?: string
          cron_schedule?: string | null
          cron_timezone?: string | null
          delete_after_run?: boolean | null
          description?: string | null
          email_address?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_duration_ms?: number | null
          last_run_error?: string | null
          last_run_status?: Database["app"]["Enums"]["automation_run_status"] | null
          lease_expires_at?: string | null
          name: string
          next_run_at?: string | null
          org_id: string
          run_at?: string | null
          run_id?: string | null
          running_at?: string | null
          site_id: string
          skills?: string[] | null
          status?: Database["app"]["Enums"]["automation_job_status"]
          trigger_type: Database["app"]["Enums"]["automation_trigger_type"]
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          action_format_prompt?: string | null
          action_model?: string | null
          action_prompt?: string | null
          action_source?: Json | null
          action_target_page?: string | null
          action_thinking?: string | null
          action_timeout_seconds?: number | null
          action_type?: Database["app"]["Enums"]["automation_action_type"]
          claimed_by?: string | null
          consecutive_failures?: number | null
          created_at?: string
          cron_schedule?: string | null
          cron_timezone?: string | null
          delete_after_run?: boolean | null
          description?: string | null
          email_address?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_duration_ms?: number | null
          last_run_error?: string | null
          last_run_status?: Database["app"]["Enums"]["automation_run_status"] | null
          lease_expires_at?: string | null
          name?: string
          next_run_at?: string | null
          org_id?: string
          run_at?: string | null
          run_id?: string | null
          running_at?: string | null
          site_id?: string
          skills?: string[] | null
          status?: Database["app"]["Enums"]["automation_job_status"]
          trigger_type?: Database["app"]["Enums"]["automation_trigger_type"]
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          changes_made: string[] | null
          completed_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          job_id: string
          messages: Json | null
          messages_uri: string | null
          result: Json | null
          started_at: string
          status: Database["app"]["Enums"]["automation_run_status"]
          trigger_context: Json | null
          triggered_by: string | null
        }
        Insert: {
          changes_made?: string[] | null
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job_id: string
          messages?: Json | null
          messages_uri?: string | null
          result?: Json | null
          started_at?: string
          status?: Database["app"]["Enums"]["automation_run_status"]
          trigger_context?: Json | null
          triggered_by?: string | null
        }
        Update: {
          changes_made?: string[] | null
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          job_id?: string
          messages?: Json | null
          messages_uri?: string | null
          result?: Json | null
          started_at?: string
          status?: Database["app"]["Enums"]["automation_run_status"]
          trigger_context?: Json | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tabs: {
        Row: {
          closed_at: string | null
          conversation_id: string
          created_at: string
          last_message_at: string | null
          message_count: number
          name: string
          position: number
          tab_id: string
        }
        Insert: {
          closed_at?: string | null
          conversation_id: string
          created_at?: string
          last_message_at?: string | null
          message_count?: number
          name?: string
          position?: number
          tab_id?: string
        }
        Update: {
          closed_at?: string | null
          conversation_id?: string
          created_at?: string
          last_message_at?: string | null
          message_count?: number
          name?: string
          position?: number
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tabs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          auto_title_set: boolean
          conversation_id: string
          created_at: string
          deleted_at: string | null
          first_user_message_id: string | null
          last_message_at: string | null
          message_count: number
          org_id: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
          workspace: string
        }
        Insert: {
          archived_at?: string | null
          auto_title_set?: boolean
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          first_user_message_id?: string | null
          last_message_at?: string | null
          message_count?: number
          org_id: string
          title?: string
          updated_at?: string
          user_id: string
          visibility?: string
          workspace: string
        }
        Update: {
          archived_at?: string | null
          auto_title_set?: boolean
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          first_user_message_id?: string | null
          last_message_at?: string | null
          message_count?: number
          org_id?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
          workspace?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          created_at: string
          domain_id: string
          hostname: string
          is_test_env: boolean | null
          org_id: string | null
          port: number
          server_id: string | null
          test_run_id: string | null
        }
        Insert: {
          created_at?: string
          domain_id?: string
          hostname: string
          is_test_env?: boolean | null
          org_id?: string | null
          port: number
          server_id?: string | null
          test_run_id?: string | null
        }
        Update: {
          created_at?: string
          domain_id?: string
          hostname?: string
          is_test_env?: boolean | null
          org_id?: string | null
          port?: number
          server_id?: string | null
          test_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["server_id"]
          },
        ]
      }
      errors: {
        Row: {
          clerk_id: string | null
          created_at: string
          env: string
          error: Json | null
          hash: string
          id: number
          last_seen: string
          location: string
          message: string
          severity: Database["app"]["Enums"]["severity_level"]
          stack: string | null
          total_count: number
        }
        Insert: {
          clerk_id?: string | null
          created_at?: string
          env: string
          error?: Json | null
          hash: string
          id?: number
          last_seen?: string
          location: string
          message: string
          severity?: Database["app"]["Enums"]["severity_level"]
          stack?: string | null
          total_count?: number
        }
        Update: {
          clerk_id?: string | null
          created_at?: string
          env?: string
          error?: Json | null
          hash?: string
          id?: number
          last_seen?: string
          location?: string
          message?: string
          severity?: Database["app"]["Enums"]["severity_level"]
          stack?: string | null
          total_count?: number
        }
        Relationships: []
      }
      feedback: {
        Row: {
          content: string
          context: Json | null
          created_at: string | null
          feedback_id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          context?: Json | null
          created_at?: string | null
          feedback_id?: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string | null
          feedback_id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gateway_settings: {
        Row: {
          clerk_id: string
          created_at: string
          enabled_models: Json
          gateway: string
          gateway_setting_id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          clerk_id: string
          created_at?: string
          enabled_models?: Json
          gateway: string
          gateway_setting_id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          clerk_id?: string
          created_at?: string
          enabled_models?: Json
          gateway?: string
          gateway_setting_id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          aborted_at: string | null
          content: Json
          created_at: string
          error_code: string | null
          message_id: string
          seq: number
          status: string
          tab_id: string
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          aborted_at?: string | null
          content: Json
          created_at?: string
          error_code?: string | null
          message_id?: string
          seq: number
          status?: string
          tab_id: string
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          aborted_at?: string | null
          content?: Json
          created_at?: string
          error_code?: string | null
          message_id?: string
          seq?: number
          status?: string
          tab_id?: string
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "conversation_tabs"
            referencedColumns: ["tab_id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string
          hostname: string | null
          ip: string
          name: string
          server_id: string
        }
        Insert: {
          created_at?: string
          hostname?: string | null
          ip: string
          name: string
          server_id: string
        }
        Update: {
          created_at?: string
          hostname?: string | null
          ip?: string
          name?: string
          server_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          ai_description: string | null
          deploy_count: number | null
          description: string | null
          image_url: string | null
          is_active: boolean | null
          name: string
          preview_url: string | null
          source_path: string
          template_id: string
        }
        Insert: {
          ai_description?: string | null
          deploy_count?: number | null
          description?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name: string
          preview_url?: string | null
          source_path: string
          template_id?: string
        }
        Update: {
          ai_description?: string | null
          deploy_count?: number | null
          description?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          preview_url?: string | null
          source_path?: string
          template_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          approval_rules: Json
          autonomy: string
          completed_at: string | null
          created_at: string
          data_sources: string[]
          experience: string
          industry: string | null
          ip_address: string | null
          locale: string | null
          marketing_opt_in: boolean
          notify_channels: string[]
          org_id: string | null
          preferred_apps: string[]
          primary_goal: string | null
          privacy_accepted_at: string | null
          role: string | null
          status: string
          success_metric: string | null
          team_size: number | null
          time_budget_min_per_week: number | null
          timezone: string | null
          top_tasks: string[]
          tos_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_rules?: Json
          autonomy?: string
          completed_at?: string | null
          created_at?: string
          data_sources?: string[]
          experience?: string
          industry?: string | null
          ip_address?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          notify_channels?: string[]
          org_id?: string | null
          preferred_apps?: string[]
          primary_goal?: string | null
          privacy_accepted_at?: string | null
          role?: string | null
          status?: string
          success_metric?: string | null
          team_size?: number | null
          time_budget_min_per_week?: number | null
          timezone?: string | null
          top_tasks?: string[]
          tos_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_rules?: Json
          autonomy?: string
          completed_at?: string | null
          created_at?: string
          data_sources?: string[]
          experience?: string
          industry?: string | null
          ip_address?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          notify_channels?: string[]
          org_id?: string | null
          preferred_apps?: string[]
          primary_goal?: string | null
          privacy_accepted_at?: string | null
          role?: string | null
          status?: string
          success_metric?: string | null
          team_size?: number | null
          time_budget_min_per_week?: number | null
          timezone?: string | null
          top_tasks?: string[]
          tos_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profile: {
        Row: {
          about: string | null
          clerk_id: string
          created_at: string
          goals: string | null
          user_profile_id: string
        }
        Insert: {
          about?: string | null
          clerk_id: string
          created_at?: string
          goals?: string | null
          user_profile_id?: string
        }
        Update: {
          about?: string | null
          clerk_id?: string
          created_at?: string
          goals?: string | null
          user_profile_id?: string
        }
        Relationships: []
      }
      user_quotas: {
        Row: {
          created_at: string
          max_custom_domains: number | null
          max_monthly_builds: number | null
          max_sites: number
          max_storage_mb: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          max_custom_domains?: number | null
          max_monthly_builds?: number | null
          max_sites?: number
          max_storage_mb?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          max_custom_domains?: number | null
          max_monthly_builds?: number | null
          max_sites?: number
          max_storage_mb?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_due_jobs: {
        Args: { p_claimed_by?: string; p_limit: number; p_server_id: string }
        Returns: {
          action_format_prompt: string | null
          action_model: string | null
          action_prompt: string | null
          action_source: Json | null
          action_target_page: string | null
          action_thinking: string | null
          action_timeout_seconds: number | null
          action_type: Database["app"]["Enums"]["automation_action_type"]
          claimed_by: string | null
          consecutive_failures: number | null
          created_at: string
          cron_schedule: string | null
          cron_timezone: string | null
          delete_after_run: boolean | null
          description: string | null
          email_address: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_duration_ms: number | null
          last_run_error: string | null
          last_run_status: Database["app"]["Enums"]["automation_run_status"] | null
          lease_expires_at: string | null
          name: string
          next_run_at: string | null
          org_id: string
          run_at: string | null
          run_id: string | null
          running_at: string | null
          site_id: string
          skills: string[] | null
          status: Database["app"]["Enums"]["automation_job_status"]
          trigger_type: Database["app"]["Enums"]["automation_trigger_type"]
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sub: { Args: never; Returns: string }
    }
    Enums: {
      automation_action_type: "prompt" | "sync" | "publish"
      automation_job_status: "idle" | "running" | "paused" | "disabled"
      automation_run_status: "pending" | "running" | "success" | "failure" | "skipped"
      automation_trigger_type: "cron" | "webhook" | "one-time" | "email"
      severity_level: "info" | "warn" | "error" | "debug" | "fatal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals["app"]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  app: {
    Enums: {
      automation_action_type: ["prompt", "sync", "publish"],
      automation_job_status: ["idle", "running", "paused", "disabled"],
      automation_run_status: ["pending", "running", "success", "failure", "skipped"],
      automation_trigger_type: ["cron", "webhook", "one-time", "email"],
      severity_level: ["info", "warn", "error", "debug", "fatal"],
    },
  },
} as const
