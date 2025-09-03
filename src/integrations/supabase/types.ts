export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          operation: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          archive_reason: string | null
          archived: boolean
          archived_at: string | null
          attachments: string[] | null
          budget_date: string | null
          created_at: string
          created_by: string
          email: string
          gallery_date: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          preview_date: string | null
          return_date: string | null
          session_date: string | null
          stage: string
          updated_at: string
          voucher_date: string | null
          workflow_status: string | null
        }
        Insert: {
          archive_reason?: string | null
          archived?: boolean
          archived_at?: string | null
          attachments?: string[] | null
          budget_date?: string | null
          created_at?: string
          created_by: string
          email: string
          gallery_date?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          preview_date?: string | null
          return_date?: string | null
          session_date?: string | null
          stage?: string
          updated_at?: string
          voucher_date?: string | null
          workflow_status?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived?: boolean
          archived_at?: string | null
          attachments?: string[] | null
          budget_date?: string | null
          created_at?: string
          created_by?: string
          email?: string
          gallery_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          preview_date?: string | null
          return_date?: string | null
          session_date?: string | null
          stage?: string
          updated_at?: string
          voucher_date?: string | null
          workflow_status?: string | null
        }
        Relationships: []
      }
      filiais: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          cliente_nome: string
          created_at: string
          data_criacao: string
          data_fechamento: string | null
          filial: string
          id: string
          status: string
          task_id: string
          updated_at: string
          valor_total_oportunidade: number
          valor_venda_fechada: number
        }
        Insert: {
          cliente_nome: string
          created_at?: string
          data_criacao?: string
          data_fechamento?: string | null
          filial: string
          id?: string
          status?: string
          task_id: string
          updated_at?: string
          valor_total_oportunidade?: number
          valor_venda_fechada?: number
        }
        Update: {
          cliente_nome?: string
          created_at?: string
          data_criacao?: string
          data_fechamento?: string | null
          filial?: string
          id?: string
          status?: string
          task_id?: string
          updated_at?: string
          valor_total_oportunidade?: number
          valor_venda_fechada?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_opportunities_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_new"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_items: {
        Row: {
          created_at: string
          id: string
          opportunity_id: string
          preco_unit: number
          produto: string
          qtd_ofertada: number
          qtd_vendida: number
          sku: string | null
          subtotal_ofertado: number | null
          subtotal_vendido: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opportunity_id: string
          preco_unit: number
          produto: string
          qtd_ofertada: number
          qtd_vendida?: number
          sku?: string | null
          subtotal_ofertado?: number | null
          subtotal_vendido?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          opportunity_id?: string
          preco_unit?: number
          produto?: string
          qtd_ofertada?: number
          qtd_vendida?: number
          sku?: string | null
          subtotal_ofertado?: number | null
          subtotal_vendido?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_opportunity_items_opportunity"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          observations: string | null
          photos: string[] | null
          price: number | null
          quantity: number | null
          selected: boolean | null
          task_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          observations?: string | null
          photos?: string[] | null
          price?: number | null
          quantity?: number | null
          selected?: boolean | null
          task_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
          photos?: string[] | null
          price?: number | null
          quantity?: number | null
          selected?: boolean | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string
          avatar: string | null
          created_at: string
          email: string
          filial_id: string | null
          id: string
          name: string
          registration_date: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string
          avatar?: string | null
          created_at?: string
          email: string
          filial_id?: string | null
          id?: string
          name: string
          registration_date?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string
          avatar?: string | null
          created_at?: string
          email?: string
          filial_id?: string | null
          id?: string
          name?: string
          registration_date?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_filial"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          completed: boolean | null
          created_at: string
          date: string
          description: string | null
          id: string
          task_id: string
          time: string
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          task_id: string
          time: string
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          task_id?: string
          time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reminders_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          blocked: boolean | null
          created_at: string
          event_type: string
          id: string
          ip_address: unknown | null
          metadata: Json | null
          risk_score: number | null
          session_id: string | null
          target_user_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          blocked?: boolean | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          risk_score?: number | null
          session_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          blocked?: boolean | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          risk_score?: number | null
          session_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      task_creation_log: {
        Row: {
          client: string | null
          created_at: string | null
          created_by: string | null
          id: string
          logged_at: string | null
          property: string | null
          responsible: string | null
          start_date: string | null
          task_id: string
        }
        Insert: {
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          logged_at?: string | null
          property?: string | null
          responsible?: string | null
          start_date?: string | null
          task_id: string
        }
        Update: {
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          logged_at?: string | null
          property?: string | null
          responsible?: string | null
          start_date?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_task_creation_log_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          check_in_location: Json | null
          client: string
          clientcode: string | null
          created_at: string
          created_by: string
          documents: string[] | null
          email: string | null
          end_date: string
          end_time: string
          equipment_list: Json | null
          equipment_quantity: number | null
          family_product: string | null
          filial: string | null
          final_km: number | null
          id: string
          initial_km: number | null
          is_prospect: boolean | null
          name: string
          observations: string | null
          partial_sales_value: number | null
          phone: string | null
          photos: string[] | null
          priority: string
          property: string
          propertyhectares: number | null
          prospect_notes: string | null
          prospect_notes_justification: string | null
          responsible: string
          sales_confirmed: boolean | null
          sales_type: string | null
          sales_value: number | null
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          check_in_location?: Json | null
          client: string
          clientcode?: string | null
          created_at?: string
          created_by: string
          documents?: string[] | null
          email?: string | null
          end_date: string
          end_time: string
          equipment_list?: Json | null
          equipment_quantity?: number | null
          family_product?: string | null
          filial?: string | null
          final_km?: number | null
          id?: string
          initial_km?: number | null
          is_prospect?: boolean | null
          name: string
          observations?: string | null
          partial_sales_value?: number | null
          phone?: string | null
          photos?: string[] | null
          priority: string
          property: string
          propertyhectares?: number | null
          prospect_notes?: string | null
          prospect_notes_justification?: string | null
          responsible: string
          sales_confirmed?: boolean | null
          sales_type?: string | null
          sales_value?: number | null
          start_date: string
          start_time: string
          status?: string
          task_type?: string
          updated_at?: string
        }
        Update: {
          check_in_location?: Json | null
          client?: string
          clientcode?: string | null
          created_at?: string
          created_by?: string
          documents?: string[] | null
          email?: string | null
          end_date?: string
          end_time?: string
          equipment_list?: Json | null
          equipment_quantity?: number | null
          family_product?: string | null
          filial?: string | null
          final_km?: number | null
          id?: string
          initial_km?: number | null
          is_prospect?: boolean | null
          name?: string
          observations?: string | null
          partial_sales_value?: number | null
          phone?: string | null
          photos?: string[] | null
          priority?: string
          property?: string
          propertyhectares?: number | null
          prospect_notes?: string | null
          prospect_notes_justification?: string | null
          responsible?: string
          sales_confirmed?: boolean | null
          sales_type?: string | null
          sales_value?: number | null
          start_date?: string
          start_time?: string
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks_backup: {
        Row: {
          check_in_location: Json | null
          client: string | null
          clientcode: string | null
          created_at: string | null
          created_by: string | null
          documents: string[] | null
          email: string | null
          end_date: string | null
          end_time: string | null
          equipment_list: Json | null
          equipment_quantity: number | null
          family_product: string | null
          filial: string | null
          final_km: number | null
          id: string | null
          initial_km: number | null
          is_prospect: boolean | null
          name: string | null
          observations: string | null
          partial_sales_value: number | null
          phone: string | null
          photos: string[] | null
          priority: string | null
          property: string | null
          propertyhectares: number | null
          prospect_notes: string | null
          prospect_notes_justification: string | null
          responsible: string | null
          sales_confirmed: boolean | null
          sales_type: string | null
          sales_value: number | null
          start_date: string | null
          start_time: string | null
          status: string | null
          task_type: string | null
          updated_at: string | null
        }
        Insert: {
          check_in_location?: Json | null
          client?: string | null
          clientcode?: string | null
          created_at?: string | null
          created_by?: string | null
          documents?: string[] | null
          email?: string | null
          end_date?: string | null
          end_time?: string | null
          equipment_list?: Json | null
          equipment_quantity?: number | null
          family_product?: string | null
          filial?: string | null
          final_km?: number | null
          id?: string | null
          initial_km?: number | null
          is_prospect?: boolean | null
          name?: string | null
          observations?: string | null
          partial_sales_value?: number | null
          phone?: string | null
          photos?: string[] | null
          priority?: string | null
          property?: string | null
          propertyhectares?: number | null
          prospect_notes?: string | null
          prospect_notes_justification?: string | null
          responsible?: string | null
          sales_confirmed?: boolean | null
          sales_type?: string | null
          sales_value?: number | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          task_type?: string | null
          updated_at?: string | null
        }
        Update: {
          check_in_location?: Json | null
          client?: string | null
          clientcode?: string | null
          created_at?: string | null
          created_by?: string | null
          documents?: string[] | null
          email?: string | null
          end_date?: string | null
          end_time?: string | null
          equipment_list?: Json | null
          equipment_quantity?: number | null
          family_product?: string | null
          filial?: string | null
          final_km?: number | null
          id?: string | null
          initial_km?: number | null
          is_prospect?: boolean | null
          name?: string | null
          observations?: string | null
          partial_sales_value?: number | null
          phone?: string | null
          photos?: string[] | null
          priority?: string | null
          property?: string | null
          propertyhectares?: number | null
          prospect_notes?: string | null
          prospect_notes_justification?: string | null
          responsible?: string | null
          sales_confirmed?: boolean | null
          sales_type?: string | null
          sales_value?: number | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          task_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks_new: {
        Row: {
          cliente_email: string | null
          cliente_nome: string
          created_at: string
          data: string
          filial: string
          id: string
          notas: string | null
          tipo: string
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          cliente_email?: string | null
          cliente_nome: string
          created_at?: string
          data: string
          filial: string
          id?: string
          notas?: string | null
          tipo: string
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          cliente_email?: string | null
          cliente_nome?: string
          created_at?: string
          data?: string
          filial?: string
          id?: string
          notas?: string | null
          tipo?: string
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: []
      }
      user_directory_cache: {
        Row: {
          approval_status: string
          email: string | null
          filial_id: string | null
          filial_nome: string | null
          id: string
          last_updated: string | null
          name: string
          profile_id: string
          role: string
          user_id: string
        }
        Insert: {
          approval_status: string
          email?: string | null
          filial_id?: string | null
          filial_nome?: string | null
          id?: string
          last_updated?: string | null
          name: string
          profile_id: string
          role: string
          user_id: string
        }
        Update: {
          approval_status?: string
          email?: string | null
          filial_id?: string | null
          filial_nome?: string | null
          id?: string
          last_updated?: string | null
          name?: string
          profile_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          status: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          status?: string
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          status?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_task_partial_sales_value: {
        Args: { task_id: string }
        Returns: number
      }
      can_access_customer_data: {
        Args: { task_owner_id: string }
        Returns: boolean
      }
      can_modify_user_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: boolean
      }
      can_perform_admin_action: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      check_bi_security_alerts: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_type: string
          count: number
          description: string
          recommendation: string
          severity: string
        }[]
      }
      check_client_operation_rate_limit: {
        Args: { operation_type?: string }
        Returns: boolean
      }
      check_customer_data_access_alerts: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_type: string
          count: number
          description: string
          recommendation: string
          severity: string
        }[]
      }
      check_data_integrity: {
        Args: Record<PropertyKey, never>
        Returns: {
          issue_count: number
          issue_type: string
          severity: string
          table_name: string
        }[]
      }
      check_login_rate_limit: {
        Args: { user_email: string }
        Returns: boolean
      }
      check_sensitive_data_rate_limit: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      check_suspicious_login_pattern: {
        Args: { ip_address?: unknown; user_email: string }
        Returns: boolean
      }
      clean_duplicate_tasks: {
        Args: Record<PropertyKey, never>
        Returns: {
          action: string
          client: string
          created_at: string
          responsible: string
          task_id: string
        }[]
      }
      cleanup_old_security_logs: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_orphaned_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          action: string
          count: number
          table_name: string
        }[]
      }
      create_secure_profile: {
        Args: {
          email_param: string
          filial_id_param?: string
          name_param: string
          role_param?: string
          user_id_param: string
        }
        Returns: string
      }
      detect_customer_data_theft_attempts: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_level: string
          event_count: number
          recommended_action: string
          threat_description: string
        }[]
      }
      get_completely_secure_tasks: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          check_in_location: Json
          client: string
          clientcode: string
          created_at: string
          created_by: string
          documents: string[]
          email: string
          end_date: string
          end_time: string
          equipment_list: Json
          equipment_quantity: number
          family_product: string
          filial: string
          final_km: number
          id: string
          initial_km: number
          is_customer_data_protected: boolean
          is_prospect: boolean
          name: string
          observations: string
          partial_sales_value: number
          phone: string
          photos: string[]
          priority: string
          property: string
          propertyhectares: number
          prospect_notes: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }[]
      }
      get_filiais_for_registration: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          nome: string
        }[]
      }
      get_filial_user_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          id: string
          nome: string
          updated_at: string
          user_count: number
        }[]
      }
      get_filial_users: {
        Args: { filial_uuid: string }
        Returns: {
          approval_status: string
          created_at: string
          email: string
          id: string
          name: string
          role: string
        }[]
      }
      get_secure_client_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          created_at: string
          email: string
          id: string
          is_masked: boolean
          name: string
          notes: string
          phone: string
          session_date: string
          stage: string
        }[]
      }
      get_secure_clients: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          created_at: string
          created_by: string
          email: string
          id: string
          is_masked: boolean
          name: string
          notes: string
          phone: string
          session_date: string
          stage: string
        }[]
      }
      get_secure_clients_enhanced: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          created_at: string
          created_by: string
          email: string
          id: string
          is_masked: boolean
          name: string
          notes: string
          phone: string
          session_date: string
          stage: string
        }[]
      }
      get_secure_customer_data_enhanced: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          check_in_location: Json
          client: string
          clientcode: string
          created_at: string
          created_by: string
          documents: string[]
          email: string
          end_date: string
          end_time: string
          equipment_list: Json
          equipment_quantity: number
          family_product: string
          filial: string
          final_km: number
          id: string
          initial_km: number
          is_masked: boolean
          is_prospect: boolean
          name: string
          observations: string
          partial_sales_value: number
          phone: string
          photos: string[]
          priority: string
          property: string
          propertyhectares: number
          prospect_notes: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }[]
      }
      get_secure_customer_data_with_rls: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          check_in_location: Json
          client: string
          clientcode: string
          created_at: string
          created_by: string
          documents: string[]
          email: string
          end_date: string
          end_time: string
          equipment_list: Json
          equipment_quantity: number
          family_product: string
          filial: string
          final_km: number
          id: string
          initial_km: number
          is_masked: boolean
          is_prospect: boolean
          name: string
          observations: string
          partial_sales_value: number
          phone: string
          photos: string[]
          priority: string
          property: string
          propertyhectares: number
          prospect_notes: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }[]
      }
      get_secure_sales_data: {
        Args: { include_high_value?: boolean }
        Returns: {
          access_granted: boolean
          is_high_value: boolean
          masked_value: string
          sales_type: string
          sales_value: number
          task_id: string
        }[]
      }
      get_secure_task_data: {
        Args: { task_id_param: string }
        Returns: {
          client: string
          email: string
          filial: string
          id: string
          is_masked: boolean
          name: string
          property: string
          responsible: string
          sales_value: number
        }[]
      }
      get_secure_tasks_enhanced: {
        Args: { limit_count?: number; offset_count?: number }
        Returns: {
          access_level: string
          client: string
          created_at: string
          created_by: string
          email: string
          end_date: string
          filial: string
          id: string
          is_masked: boolean
          is_prospect: boolean
          name: string
          observations: string
          phone: string
          priority: string
          property: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          status: string
          task_type: string
        }[]
      }
      get_secure_tasks_new_with_customer_protection: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          cliente_email: string
          cliente_nome: string
          created_at: string
          data: string
          filial: string
          id: string
          is_customer_data_masked: boolean
          notas: string
          tipo: string
          updated_at: string
          vendedor_id: string
        }[]
      }
      get_secure_tasks_with_customer_protection: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          check_in_location: Json
          client: string
          clientcode: string
          created_at: string
          created_by: string
          documents: string[]
          email: string
          end_date: string
          end_time: string
          equipment_list: Json
          equipment_quantity: number
          family_product: string
          filial: string
          final_km: number
          id: string
          initial_km: number
          is_customer_data_masked: boolean
          is_prospect: boolean
          name: string
          observations: string
          partial_sales_value: number
          phone: string
          photos: string[]
          priority: string
          property: string
          propertyhectares: number
          prospect_notes: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }[]
      }
      get_secure_user_directory: {
        Args: Record<PropertyKey, never>
        Returns: {
          approval_status: string
          created_at: string
          email: string
          filial_id: string
          filial_nome: string
          id: string
          is_masked: boolean
          name: string
          role: string
          updated_at: string
          user_id: string
        }[]
      }
      get_security_dashboard_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_level: string
          description: string
          metric_name: string
          metric_value: number
        }[]
      }
      get_supervisor_filial_tasks: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          check_in_location: Json
          client: string
          clientcode: string
          created_at: string
          created_by: string
          documents: string[]
          email: string
          end_date: string
          end_time: string
          equipment_list: Json
          equipment_quantity: number
          family_product: string
          filial: string
          final_km: number
          id: string
          initial_km: number
          is_customer_data_protected: boolean
          is_prospect: boolean
          name: string
          observations: string
          partial_sales_value: number
          phone: string
          photos: string[]
          priority: string
          property: string
          propertyhectares: number
          prospect_notes: string
          responsible: string
          sales_confirmed: boolean
          sales_type: string
          sales_value: number
          start_date: string
          start_time: string
          status: string
          task_type: string
          updated_at: string
        }[]
      }
      get_user_directory_with_fallback: {
        Args: Record<PropertyKey, never>
        Returns: {
          approval_status: string
          created_at: string
          email: string
          filial_id: string
          filial_nome: string
          id: string
          is_masked: boolean
          name: string
          role: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_filial_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_security_level: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_admin_by_email: {
        Args: { check_email: string }
        Returns: boolean
      }
      is_high_value_task: {
        Args: { sales_value: number }
        Returns: boolean
      }
      log_client_data_access: {
        Args: {
          access_type?: string
          accessed_fields?: string[]
          client_id: string
        }
        Returns: undefined
      }
      log_customer_contact_access: {
        Args: {
          access_type?: string
          customer_count?: number
          masked_count?: number
        }
        Returns: undefined
      }
      log_customer_data_access: {
        Args: {
          access_type?: string
          customer_count?: number
          masked_count?: number
        }
        Returns: undefined
      }
      log_high_risk_activity: {
        Args: {
          activity_type: string
          additional_data?: Json
          risk_level?: number
        }
        Returns: undefined
      }
      log_security_event: {
        Args: { event_type: string; metadata?: Json; target_user_id?: string }
        Returns: undefined
      }
      log_sensitive_data_access: {
        Args: {
          access_type?: string
          resource_id?: string
          resource_type: string
        }
        Returns: undefined
      }
      log_sensitive_data_operation: {
        Args: {
          additional_metadata?: Json
          operation_type: string
          resource_id?: string
          resource_type: string
        }
        Returns: undefined
      }
      log_sensitive_operation: {
        Args: {
          additional_metadata?: Json
          operation_type: string
          resource_id?: string
          resource_type: string
        }
        Returns: undefined
      }
      mask_customer_email: {
        Args: {
          email: string
          is_owner: boolean
          is_same_filial: boolean
          user_role: string
        }
        Returns: string
      }
      mask_customer_name: {
        Args: {
          is_owner: boolean
          is_same_filial: boolean
          name: string
          user_role: string
        }
        Returns: string
      }
      mask_phone_number: {
        Args: { is_owner: boolean; phone: string; user_role: string }
        Returns: string
      }
      mask_sensitive_data: {
        Args: {
          data_value: string
          field_type: string
          user_has_access: boolean
        }
        Returns: string
      }
      migrate_tasks_to_new_structure: {
        Args: Record<PropertyKey, never>
        Returns: {
          action: string
          client_name: string
          new_task_id: string
          old_task_id: string
          status: string
        }[]
      }
      monitor_customer_data_access: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      monitor_high_risk_customer_access: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      monitor_high_value_access: {
        Args: Record<PropertyKey, never>
        Returns: {
          event_type: string
          last_24h: number
          risk_level: string
          user_count: number
        }[]
      }
      monitor_session_security: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      monitor_tasks_new_unauthorized_access: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      monitor_unauthorized_customer_access: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      secure_delete_task: {
        Args: { task_id_param: string }
        Returns: Json
      }
      secure_log_security_event: {
        Args: {
          event_type_param: string
          metadata_param?: Json
          risk_score_param?: number
          user_id_param?: string
        }
        Returns: undefined
      }
      secure_update_profile: {
        Args: { profile_id_param: string; updates: Json }
        Returns: Json
      }
      simple_is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      simple_is_manager: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      simple_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      update_user_filial_secure: {
        Args: { new_filial_id: string; target_user_id: string }
        Returns: Json
      }
      update_user_role_secure: {
        Args: { new_role: string; target_user_id: string }
        Returns: Json
      }
      user_same_filial: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      validate_and_sanitize_input: {
        Args: { input_data: Json; validation_rules?: Json }
        Returns: Json
      }
      validate_and_sanitize_task_input: {
        Args: { input_data: Json }
        Returns: Json
      }
      validate_client_input: {
        Args: { input_data: Json }
        Returns: boolean
      }
      validate_data_integrity: {
        Args: Record<PropertyKey, never>
        Returns: {
          check_name: string
          count: number
          details: string
          status: string
        }[]
      }
      validate_task_input: {
        Args: { input_data: Json }
        Returns: boolean
      }
      verify_customer_data_security: {
        Args: Record<PropertyKey, never>
        Returns: {
          has_rls: boolean
          is_secure: boolean
          policy_count: number
          recommendation: string
          table_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
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
  public: {
    Enums: {},
  },
} as const
