export type AdminRole = 'admin' | 'operator' | 'gestor' | 'moderador';
export type CustomerRole = 'customer' | 'moderador' | 'gestor' | 'admin';

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  telegram_linked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  telegram_linked: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  brand?: string;
  model?: string;
  description?: string;
  short_description?: string;
  price?: number;
  currency: string;
  stock_quantity?: number;
  stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
  specifications?: string;
  warranty_months?: number;
  compatibility?: string;
  purchase_url?: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  r2_key: string;
  url?: string;
  alt_text?: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description?: string;
  scope?: string;
  price?: number;
  price_type: 'fixed' | 'quote' | 'free';
  duration_minutes?: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FAQ {
  id: string;
  category_id?: string;
  question: string;
  answer: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssistantConfig {
  id: string;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export interface AssistantSession {
  id: string;
  customer_id?: string;
  channel: 'web' | 'telegram';
  telegram_chat_id?: string;
  context: string;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
  updated_at: string;
}

export interface AssistantMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  metadata?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  password_hash?: string | null;
  role: CustomerRole;
  phone_verified: boolean;
  address?: string;
  city?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Request {
  id: string;
  customer_id?: string;
  type: 'installation' | 'maintenance' | 'repair' | 'consultation' | 'complaint' | 'suggestion';
  title: string;
  description?: string;
  status: 'pending' | 'quoted' | 'approved' | 'scheduled' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  location?: string;
  preferred_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  customer_id?: string;
  service_id?: string;
  request_id?: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  technician_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkGallery {
  id: string;
  title: string;
  description?: string;
  r2_key?: string;
  url?: string;
  video_url?: string;
  category?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  admin_user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ENVIRONMENT: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_PASSWORD_HASH?: string;
  JWT_SECRET?: string;
  ADMIN_TOKEN?: string;
  SITE_URL?: string;
  YOUTUBE_CHANNEL_URL?: string;
  WORKERS_AI_ENABLED?: string;
  WORKERS_AI_MODEL?: string;
  /** Binding opcional de Workers AI. Si no existe, el asistente usa el motor determinista. */
  AI?: Ai;
  /** Proveedor compatible con la API de chat de OpenAI (opcional). */
  AI_API_BASE?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  /** Token privado de la API de tasas de elTOQUE; configurar con wrangler secret put. */
  ELTOQUE_API_TOKEN?: string;
}

// === Auth request/response types ===

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCustomerRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AdminLoginResponse {
  user: { id: string; email: string; role: AdminRole };
  token: string;
  access_token: string;
  refresh_token: string;
}

export interface CustomerLoginResponse {
  user: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    role: CustomerRole;
    phone_verified: boolean;
  };
  access_token: string;
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

// === Telegram login flow ===

export interface TelegramLink {
  id: string;
  customer_id: string;
  link_code: string;
  used: boolean;
  expires_at: string;
  created_at: string;
}

export interface PhoneVerification {
  id: string;
  customer_id: string;
  phone: string;
  code: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

// === Giveaway system ===

export type GiveawayStatus = 'draft' | 'active' | 'ended' | 'cancelled';
export type GiveawayEntryType = 'any' | 'telegram' | 'phone' | 'customer';

export interface Giveaway {
  id: string;
  title: string;
  description?: string | null;
  prize: string;
  prize_image_url?: string | null;
  entry_type: GiveawayEntryType;
  requires_email: boolean;
  requires_phone: boolean;
  requires_telegram: boolean;
  start_date: string;
  end_date: string;
  max_participants?: number | null;
  max_winner_entries: number;
  num_winners: number;
  status: GiveawayStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GiveawayParticipant {
  id: string;
  giveaway_id: string;
  customer_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  entry_count: number;
  created_at: string;
}

export interface GiveawayWinner {
  id: string;
  giveaway_id: string;
  participant_id: string;
  customer_id?: string | null;
  position: number;
  prize: string;
  notified: boolean;
  claimed: boolean;
  claimed_at?: string | null;
  created_at: string;
}

// === Reward system ===

export interface RewardCatalogItem {
  id: string;
  name: string;
  description?: string | null;
  cost: number;
  stock_quantity?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RewardRedemption {
  id: string;
  customer_id: string;
  reward_id: string;
  points_spent: number;
  status: 'pending' | 'redeemed' | 'cancelled';
  redemption_code?: string | null;
  created_at: string;
  updated_at: string;
}

// === Customer points ===

export interface CustomerPoints {
  customer_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
}

// === Notifications ===

export type NotificationType =
  | 'welcome'
  | 'telegram_login'
  | 'phone_verified'
  | 'giveaway_win'
  | 'giveaway_reminder'
  | 'reward_available'
  | 'points_earned'
  | 'admin_message'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  user_type: 'customer' | 'admin';
  type: NotificationType;
  title: string;
  message: string;
  data?: string | null;
  is_read: boolean;
  created_at: string;
}

// === Ticket assignments ===

export interface TicketAssignment {
  id: string;
  ticket_id: string;
  assignee_id: string;
  assignee_type: 'admin' | 'customer';
  assigned_by: string;
  notes?: string | null;
  created_at: string;
}

// === Refresh token blacklist ===

export interface RefreshTokenBlacklist {
  id: string;
  token: string;
  user_id: string;
  user_type: 'customer' | 'admin';
  expires_at: string;
  created_at: string;
}

// === Giveaway draw result ===

export interface GiveawayDrawResult {
  winners: GiveawayWinner[];
  participants_count: number;
}