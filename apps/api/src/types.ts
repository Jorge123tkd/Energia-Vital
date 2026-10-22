export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'operator';
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  telegram_chat_id?: string;
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
}