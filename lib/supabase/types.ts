export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          display_name: string | null
          locale: string
          theme: string
        }
        Insert: {
          id: string
          display_name?: string | null
          locale?: string
          theme?: string
        }
        Update: {
          display_name?: string | null
          locale?: string
          theme?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          bank: string
          qr_image_path: string | null
          opening_balance_satang: number
          number_hint: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          bank: string
          qr_image_path?: string | null
          opening_balance_satang?: number
          number_hint?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          bank?: string
          qr_image_path?: string | null
          opening_balance_satang?: number
          number_hint?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: 'income' | 'expense' | 'transfer'
          amount_satang: number
          account_id: string
          to_account_id: string | null
          category: string | null
          ref_code: string | null
          bank_code: string | null
          counterparty: string | null
          datetime: string
          group_id: string | null
          recurring_rule_id: string | null
          occurrence_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'income' | 'expense' | 'transfer'
          amount_satang: number
          account_id: string
          to_account_id?: string | null
          category?: string | null
          ref_code?: string | null
          bank_code?: string | null
          counterparty?: string | null
          datetime: string
          group_id?: string | null
          recurring_rule_id?: string | null
          occurrence_date?: string | null
          created_at?: string
        }
        Update: {
          type?: 'income' | 'expense' | 'transfer'
          amount_satang?: number
          account_id?: string
          to_account_id?: string | null
          category?: string | null
          ref_code?: string | null
          bank_code?: string | null
          counterparty?: string | null
          datetime?: string
          group_id?: string | null
        }
        Relationships: []
      }
      groups: {
        Row: { id: string; user_id: string; title: string; note: string | null }
        Insert: { id?: string; user_id: string; title: string; note?: string | null }
        Update: { title?: string; note?: string | null }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          id: string
          user_id: string
          type: 'income' | 'expense'
          amount_satang: number
          category: string | null
          account_id: string
          freq: 'weekly' | 'monthly' | 'yearly'
          interval: number
          by_weekday: number[] | null
          start_date: string
          end_date: string | null
          materialized_through: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: 'income' | 'expense'
          amount_satang: number
          category?: string | null
          account_id: string
          freq: 'weekly' | 'monthly' | 'yearly'
          interval?: number
          by_weekday?: number[] | null
          start_date: string
          end_date?: string | null
          materialized_through?: string | null
        }
        Update: {
          type?: 'income' | 'expense'
          amount_satang?: number
          category?: string | null
          account_id?: string
          freq?: 'weekly' | 'monthly' | 'yearly'
          interval?: number
          by_weekday?: number[] | null
          start_date?: string
          end_date?: string | null
          materialized_through?: string | null
        }
        Relationships: []
      }
      recurring_exceptions: {
        Row: { id: string; rule_id: string; skipped_date: string }
        Insert: { id?: string; rule_id: string; skipped_date: string }
        Update: { [_ in never]: never }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          period: 'day' | 'month'
          scope: 'overall' | 'category'
          category: string | null
          amount_satang: number
        }
        Insert: {
          id?: string
          user_id: string
          period: 'day' | 'month'
          scope: 'overall' | 'category'
          category?: string | null
          amount_satang: number
        }
        Update: {
          period?: 'day' | 'month'
          scope?: 'overall' | 'category'
          category?: string | null
          amount_satang?: number
        }
        Relationships: []
      }
      payment_sessions: {
        Row: {
          id: string
          owner: string
          account_id: string | null
          title: string
          target_amount_satang: number | null
          type: 'collect' | 'trip'
          status: 'open' | 'closed'
          created_at: string
        }
        Insert: {
          id: string
          owner: string
          account_id?: string | null
          title: string
          target_amount_satang?: number | null
          type?: 'collect' | 'trip'
          status?: 'open' | 'closed'
          created_at?: string
        }
        Update: {
          title?: string
          target_amount_satang?: number | null
          type?: 'collect' | 'trip'
          status?: 'open' | 'closed'
        }
        Relationships: []
      }
      session_participants: {
        Row: {
          id: string
          session_id: string
          nickname: string
          participant_token: string
          user_id: string | null
          is_owner: boolean
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          nickname: string
          participant_token: string
          user_id?: string | null
          is_owner?: boolean
          created_at?: string
        }
        Update: {
          nickname?: string
        }
        Relationships: []
      }
      session_expenses: {
        Row: {
          id: string
          session_id: string
          payer_participant_id: string
          title: string
          total_amount_satang: number
          split_among: number
          qr_image_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          payer_participant_id: string
          title: string
          total_amount_satang: number
          split_among: number
          qr_image_path?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          total_amount_satang?: number
          split_among?: number
          qr_image_path?: string | null
        }
        Relationships: []
      }
      session_slips: {
        Row: {
          id: string
          session_id: string
          amount_satang: number
          ref_code: string | null
          paid_at: string
          confirmed: boolean
          expense_id: string | null
          payer_participant_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          amount_satang: number
          ref_code?: string | null
          paid_at: string
          confirmed?: boolean
          expense_id?: string | null
          payer_participant_id?: string | null
          created_at?: string
        }
        Update: {
          confirmed?: boolean
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          symbol: string | null
          name: string
          asset_class: 'us_equity' | 'etf' | 'thai_set' | 'thai_fund' | 'gold' | 'crypto'
          region: string | null
          currency: string
          proxy_class: string | null
          lookthrough: Json | null
          is_system: boolean
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          symbol?: string | null
          name: string
          asset_class: 'us_equity' | 'etf' | 'thai_set' | 'thai_fund' | 'gold' | 'crypto'
          region?: string | null
          currency: string
          proxy_class?: string | null
          lookthrough?: Json | null
          is_system?: boolean
          user_id?: string | null
          created_at?: string
        }
        Update: {
          symbol?: string | null
          name?: string
          asset_class?: 'us_equity' | 'etf' | 'thai_set' | 'thai_fund' | 'gold' | 'crypto'
          region?: string | null
          currency?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          id: string
          user_id: string
          asset_id: string
          sleeve: 'core' | 'satellite' | 'risk_capital'
          broker: string | null
          // bigint columns come back from PostgREST as strings (JS number can't
          // hold a full int64 precisely) — every *_minor field here is a string.
          current_value_minor: string | null
          current_value_currency: string | null
          current_fx_to_display: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          asset_id: string
          sleeve?: 'core' | 'satellite' | 'risk_capital'
          broker?: string | null
          current_value_minor?: string | null
          current_value_currency?: string | null
          current_fx_to_display?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          sleeve?: 'core' | 'satellite' | 'risk_capital'
          broker?: string | null
          current_value_minor?: string | null
          current_value_currency?: string | null
          current_fx_to_display?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      asset_transactions: {
        Row: {
          id: string
          user_id: string
          holding_id: string
          type: 'buy' | 'sell' | 'dividend' | 'fee'
          qty: string | null
          price_minor: string | null
          currency: string
          fees_minor: string
          fx_rate: string | null
          datetime: string
          ref: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          holding_id: string
          type: 'buy' | 'sell' | 'dividend' | 'fee'
          qty?: string | null
          price_minor?: string | null
          currency: string
          fees_minor?: string
          fx_rate?: string | null
          datetime: string
          ref?: string | null
          created_at?: string
        }
        Update: {
          qty?: string | null
          price_minor?: string | null
          fees_minor?: string
          fx_rate?: string | null
          datetime?: string
          ref?: string | null
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          id: string
          user_id: string
          taken_at: string
          display_currency: string
          holdings: Json
          totals: Json
          allocation: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          taken_at?: string
          display_currency: string
          holdings: Json
          totals: Json
          allocation: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          taken_at?: string
          display_currency?: string
          holdings?: Json
          totals?: Json
          allocation?: Json
          created_at?: string
        }
        Relationships: []
      }
      slip_account_map: {
        Row: {
          id: string
          user_id: string
          fingerprint: string
          account_id: string
          hits: number
          last_used_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fingerprint: string
          account_id: string
          hits?: number
          last_used_at?: string
          created_at?: string
        }
        Update: {
          account_id?: string
          hits?: number
          last_used_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      account_balances: {
        Args: Record<PropertyKey, never>
        Returns: { account_id: string; balance_satang: number }[]
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
