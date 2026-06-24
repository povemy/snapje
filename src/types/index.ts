/**
 * SnapJe TypeScript Type Definitions
 */

// ============================================
// Auth Types
// ============================================

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string | null
  avatarUrl: string | null
  roles: string[]
  activeRole: string
  emailVerified: boolean
  isBanned?: boolean
  vipFlag?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  name: string
  phone?: string
}

// ============================================
// View/Routing Types
// ============================================

export type AppRole = 'foodie' | 'vendor' | 'admin'

export type FoodieView = 
  | 'home'
  | 'explore'
  | 'deal-detail'
  | 'orders'
  | 'order-detail'
  | 'profile'
  | 'subscriptions'
  | 'register-vendor'
  | 'vendor-public'

export type VendorView =
  | 'dashboard'
  | 'create-deal'
  | 'edit-deal'
  | 'inventory'
  | 'fulfillment'
  | 'subscription'

export type AdminView =
  | 'dashboard'
  | 'vendors'
  | 'vendor-detail'
  | 'users'
  | 'user-detail'
  | 'analytics'
  | 'admin-deals'
  | 'upload-settings'
  | 'media'
  | 'broadcast-log'

export type AppView = FoodieView | VendorView | AdminView

export interface ViewState {
  currentView: AppView
  viewParams: Record<string, string>
  previousView: AppView | null
}

// ============================================
// Deal Types
// ============================================

export interface Deal {
  id: string
  vendorId: string
  vendor?: Vendor
  title: string
  description: string
  category: string
  imageUrl: string | null
  originalPrice: number
  dealPrice: number
  discountPercent: number
  totalQuantity: number
  reservedQuantity: number
  soldQuantity: number
  availableQuantity: number
  maxClaimsPerUser: number
  status: DealStatus
  pickupOnly: boolean
  pickupInstructions: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
  distance?: number
}

export type DealStatus = 'draft' | 'active' | 'paused' | 'sold_out' | 'expired' | 'cancelled'

export type FoodCategory = 
  | 'Malay' | 'Chinese' | 'Indian' | 'Western' 
  | 'Japanese' | 'Korean' | 'Thai' | 'Vegan' 
  | 'Dessert' | 'Beverage' | 'Other'

export const FOOD_CATEGORIES: FoodCategory[] = [
  'Malay', 'Chinese', 'Indian', 'Western',
  'Japanese', 'Korean', 'Thai', 'Vegan',
  'Dessert', 'Beverage', 'Other'
]

export const FOOD_CATEGORY_COLORS: Record<FoodCategory, string> = {
  Malay: 'bg-amber-100 text-amber-800',
  Chinese: 'bg-red-100 text-red-800',
  Indian: 'bg-orange-100 text-orange-800',
  Western: 'bg-blue-100 text-blue-800',
  Japanese: 'bg-pink-100 text-pink-800',
  Korean: 'bg-purple-100 text-purple-800',
  Thai: 'bg-green-100 text-green-800',
  Vegan: 'bg-emerald-100 text-emerald-800',
  Dessert: 'bg-fuchsia-100 text-fuchsia-800',
  Beverage: 'bg-cyan-100 text-cyan-800',
  Other: 'bg-gray-100 text-gray-800',
}

// ============================================
// Vendor Types
// ============================================

export interface Vendor {
  id: string
  userId: string
  businessName: string
  description: string | null
  contactEmail: string
  contactPhone: string
  address: string
  latitude: number
  longitude: number
  operatingHours: string
  foodCategories: string
  logoUrl: string | null
  coverImageUrl: string | null
  verificationDocs: string
  verificationStatus: VerificationStatus
  rejectionReason: string | null
  verifiedAt: string | null
  subscriptionPlan: string
  subscriptionStatus: string
  subscriptionStart: string | null
  subscriptionEnd: string | null
  rating: number
  totalSales: number
  createdAt: string
  updatedAt: string
  deals?: Deal[]
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface VendorRegistration {
  businessName: string
  description?: string
  contactEmail: string
  contactPhone: string
  address: string
  latitude: number
  longitude: number
  operatingHours?: Record<string, string>
  foodCategories: string[]
}

// ============================================
// Order Types
// ============================================

export interface Order {
  id: string
  orderNumber: string
  userId: string
  vendorId: string
  dealId: string
  deal?: Deal
  vendor?: Vendor
  quantity: number
  originalPrice: number
  dealPrice: number
  totalPrice: number
  status: OrderStatus
  qrCode: string
  qrVerifiedAt: string | null
  pickupDeadline: string
  createdAt: string
  updatedAt: string
}

export type OrderStatus = 
  | 'pending_pickup' 
  | 'picked_up' 
  | 'completed' 
  | 'cancelled' 
  | 'expired'

// ============================================
// Reservation Types
// ============================================

export interface Reservation {
  id: string
  dealId: string
  userId: string
  quantity: number
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled'
  expiresAt: string
  createdAt: string
}

// ============================================
// Notification Types
// ============================================

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data: string
  read: boolean
  createdAt: string
  dealId?: string
}

export type NotificationType = 
  | 'deal_sold_out' 
  | 'deal_expiring' 
  | 'claim_confirmed' 
  | 'pickup_reminder' 
  | 'vendor_approved' 
  | 'vendor_rejected' 
  | 'siren_push'
  | 'new_deal_nearby'
  | 'order_status_update'

// ============================================
// Socket.io Event Types
// ============================================

export interface SocketEvents {
  'deal:stock_update': (data: { dealId: string; available: number; reserved: number }) => void
  'deal:status_change': (data: { dealId: string; status: DealStatus }) => void
  'notification:new': (data: AppNotification) => void
  'order:status_update': (data: { orderId: string; status: OrderStatus }) => void
  'deal:subscribe': (dealId: string) => void
  'deal:unsubscribe': (dealId: string) => void
  'user:subscribe': (userId: string) => void
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ============================================
// Subscription Types
// ============================================

export interface SubscriptionPlan {
  id: string
  name: string
  price: number
  currency: string
  interval: 'month'
  features: string[]
}

export const VENDOR_PLANS: SubscriptionPlan[] = [
  {
    id: 'vendor_basic',
    name: 'Basic',
    price: 99,
    currency: 'RM',
    interval: 'month',
    features: [
      'Create unlimited flash deals',
      'Inventory management',
      'QR pickup fulfillment',
      'Basic statistics',
      'Customer claim tracking',
    ]
  },
  {
    id: 'vendor_premium',
    name: 'Premium',
    price: 199,
    currency: 'RM',
    interval: 'month',
    features: [
      'Everything in Basic',
      'Advanced analytics dashboard',
      'Priority discovery ranking',
      'Marketing tools',
      'Future Siren Push access',
      'Future Auto-Drop tools',
      'Featured placement',
    ]
  }
]

export const FIRST_DIBS_PLAN: SubscriptionPlan = {
  id: 'first_dibs',
  name: 'First Dibs Pass',
  price: 19,
  currency: 'RM',
  interval: 'month',
  features: [
    'Early access to flash deals',
    'Exclusive premium offers',
    'Priority in limited inventory events',
    'Premium badge on profile',
  ]
}
