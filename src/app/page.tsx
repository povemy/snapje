'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useSocket } from '@/hooks/use-socket'
import type { AuthUser, AppRole, AppView, Deal, Order, Vendor, AppNotification } from '@/types'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Home, Compass, ShoppingBag, User, ChefHat, LayoutDashboard,
  PlusCircle, Package, CheckCircle, CreditCard, Shield, Users,
  BarChart3, MapPin, Bell, Search, ArrowLeft, Menu, X,
  Star, Clock, Flame, TrendingUp, Store, Settings, LogOut,
  ChevronRight, Heart, Filter, Zap, QrCode, Eye, Check,
  AlertTriangle, Ban, RefreshCw, DollarSign, ShoppingCart,
  Utensils, Bike, Building2, Crown, Sparkles, MoreVertical
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

// ============================================
// API Helper
// ============================================
async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })
    return await res.json()
  } catch {
    return { success: false, error: 'Network error' }
  }
}

// ============================================
// Page Transition Variants
// ============================================
// Performance: lightweight scale & opacity fades (Grab style)
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const pageTransition = {
  duration: 0.15,
  ease: 'easeOut',
}

// ============================================
// AUTH SCREEN
// ============================================
function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin
        ? { email, password }
        : { email, password, name, phone }

      const res = await apiFetch<AuthUser>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.success && res.data) {
        login(res.data)
        toast.success(isLogin ? 'Welcome back!' : 'Account created!')
      } else {
        toast.error(res.error || 'Authentication failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#f0f4f2] to-white px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ stiffness: 300, damping: 25 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#66d99a] to-[#00B14F] mb-4 shadow-card"
          >
            <Flame className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-[#1a1c1e] tracking-tight">FlashBite</h1>
          <p className="text-[#414841] mt-1 text-sm">Hyper-local food flash deals</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-[#e8edea] rounded-xl p-1 mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              isLogin ? 'bg-white text-[#00B14F] shadow-chip' : 'text-[#414841]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              !isLogin ? 'bg-white text-[#00B14F] shadow-chip' : 'text-[#414841]'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <Label htmlFor="name" className="text-sm font-semibold text-[#1a1c1e]">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5 h-12 rounded-xl"
                required={!isLogin}
              />
            </div>
          )}
          <div>
            <Label htmlFor="email" className="text-sm font-semibold text-[#1a1c1e]">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 h-12 rounded-xl"
              required
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-sm font-semibold text-[#1a1c1e]">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 h-12 rounded-xl"
              required
              minLength={6}
            />
          </div>
          {!isLogin && (
            <div>
              <Label htmlFor="phone" className="text-sm font-semibold text-[#1a1c1e]">Phone (optional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60 12 345 6789"
                className="mt-1.5 h-12 rounded-xl"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white hover:opacity-90 active:scale-95 transition-all shadow-card"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </Button>
        </form>

        {/* Demo hint */}
        <div className="mt-6 p-3 bg-[#f0f4f2] rounded-xl text-center">
          <p className="text-xs text-[#414841]">
            🎯 Demo: <span className="font-semibold">foodie@test.com</span> / <span className="font-semibold">vendor@test.com</span> / <span className="font-semibold">admin@test.com</span>
          </p>
          <p className="text-xs text-[#717971] mt-0.5">Password: <span className="font-semibold">password123</span></p>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================
// CONSTANTS
// ============================================
const FOOD_CATEGORIES_LIST = ['All', 'Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Vegan', 'Dessert', 'Beverage']

// ============================================
// COUNTDOWN TIMER COMPONENT
// ============================================
const CountdownTimer = memo(function CountdownTimer({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Expired')
        return
      }
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)

      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`)
      } else if (mins > 0) {
        setTimeLeft(`${mins}m ${secs}s`)
      } else {
        setTimeLeft(`${secs}s`)
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const isUrgent = timeLeft !== 'Expired' && !timeLeft.includes('h')

  return (
    <span className={`inline-flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} font-bold ${
      timeLeft === 'Expired' ? 'text-[#717971]' : isUrgent ? 'text-[#FB923C] animate-pulse-urgent' : 'text-[#00B14F]'
    }`}>
      <Clock className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {timeLeft}
    </span>
  )
})

// ============================================
// DEAL CARD COMPONENT - Grab/Foodpanda Style
// ============================================
type CardSize = 'featured' | 'large' | 'medium' | 'small'

const DealCard = memo(function DealCard({ deal, onSelect, size = 'medium' }: { 
  deal: Deal & { distance?: number; vendor?: { businessName: string; address: string; logoUrl: string | null } }; 
  onSelect: () => void;
  size?: CardSize;
}) {
  const isLowStock = deal.availableQuantity <= 5 && deal.availableQuantity > 0
  const isSoldOut = deal.availableQuantity <= 0 || deal.status === 'sold_out'
  const isHalfWidth = size === 'medium' || size === 'small'

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer group"
    >
      <div className="overflow-hidden rounded-xl bg-white shadow-card group-hover:shadow-card-hover transition-shadow duration-150">
        {/* Image - 16:9 dominant aspect ratio, h-44 for featured */}
        <div className={`relative overflow-hidden ${size === 'featured' ? 'h-44' : size === 'large' ? 'h-36' : isHalfWidth ? 'h-28' : 'h-32'} bg-[#f0f4f2]`}>
          {deal.imageUrl ? (
            <Image
              src={deal.imageUrl}
              alt={deal.title}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              fill
              sizes={isHalfWidth ? "(max-width: 640px) 50vw, 200px" : "(max-width: 640px) 100vw, 400px"}
              loading={size === 'featured' ? 'eager' : 'lazy'}
              priority={size === 'featured'}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Utensils className={isHalfWidth ? 'w-8 h-8 text-[#c1c9c0]' : 'w-12 h-12 text-[#c1c9c0]'} />
            </div>
          )}
          
          {/* Promo Badge - Top Left, overlapping image */}
          <div className="absolute top-1.5 left-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#00B14F] text-white text-[10px] font-bold shadow-sm">
              Promo
            </span>
          </div>
          
          {/* Discount % Badge - Below Promo */}
          <div className="absolute top-7 left-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FB923C] text-white text-[9px] font-bold">
              -{deal.discountPercent}%
            </span>
          </div>
          
          {/* Distance - Top Right */}
          {deal.distance !== undefined && (
            <div className="absolute top-1.5 right-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/90 text-[#1a1c1e] text-[10px] font-medium shadow-sm">
                <MapPin className="w-2.5 h-2.5 text-[#00B14F]" />
                {deal.distance.toFixed(1)}km
              </span>
            </div>
          )}
          
          {/* Countdown Timer Overlay - Below distance, right */}
          <div className="absolute top-7 right-1.5">
            <CountdownTimerOverlay expiresAt={deal.expiresAt} />
          </div>
          
          {/* Sold Out overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
              <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-lg">SOLD OUT</span>
            </div>
          )}
        </div>
        
        {/* Card Content - tight padding (p-4), Grab style */}
        <div className="p-3">
          {/* Title + Vendor */}
          <h3 className={`font-bold text-[#1a1c1e] truncate leading-tight ${isHalfWidth ? 'text-xs' : 'text-sm'}`}>
            {deal.title}
          </h3>
          <p className="text-[11px] text-[#717971] truncate mt-0.5">
            {deal.vendor?.businessName || 'Vendor'}
          </p>
          
          {/* Price Row - heavy emphasis on deal price, minimized original */}
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className={`font-black text-[#00B14F] ${isHalfWidth ? 'text-sm' : 'text-lg'}`}>
              RM{deal.dealPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-[#717971] line-through">
              RM{deal.originalPrice.toFixed(2)}
            </span>
          </div>
          
          {/* Stock indicator */}
          <div className={`text-[10px] font-bold mt-1 ${isLowStock ? 'text-[#FB923C]' : isSoldOut ? 'text-[#717971]' : 'text-[#00B14F]'}`}>
            {isSoldOut ? 'Sold out' : isLowStock ? `🔥 ${deal.availableQuantity} left` : `${deal.availableQuantity} left`}
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================
// COUNTDOWN TIMER OVERLAY (compact, for cards)
// ============================================
const CountdownTimerOverlay = memo(function CountdownTimerOverlay({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Expired'); return }
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      if (hours > 0) setTimeLeft(`${hours}h ${mins}m`)
      else if (mins > 0) setTimeLeft(`${mins}m ${secs}s`)
      else setTimeLeft(`${secs}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const isUrgent = timeLeft !== 'Expired' && !timeLeft.includes('h')

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm ${
      timeLeft === 'Expired' 
        ? 'bg-black/40 text-white/70' 
        : isUrgent 
        ? 'bg-[#FB923C]/90 text-white animate-pulse-urgent' 
        : 'bg-black/40 text-white/90'
    }`}>
      <Clock className="w-2.5 h-2.5" />
      {timeLeft}
    </span>
  )
})

// ============================================
// CATEGORY ICON GRID - Grab/Foodpanda Style
// ============================================
const CATEGORY_ICONS = [
  { key: 'All', label: 'Flash Deals', icon: Zap, color: '#00B14F', bg: '#e6f9ef' },
  { key: 'Malay', label: 'Malay', icon: Utensils, color: '#e74c3c', bg: '#fde8e8' },
  { key: 'Chinese', label: 'Chinese', icon: Utensils, color: '#f39c12', bg: '#fef3e2' },
  { key: 'Indian', label: 'Indian', icon: Utensils, color: '#e67e22', bg: '#fef0e0' },
  { key: 'Western', label: 'Western', icon: Utensils, color: '#3498db', bg: '#e8f4fd' },
  { key: 'Japanese', label: 'Japanese', icon: Utensils, color: '#e91e63', bg: '#fce4ec' },
  { key: 'Korean', label: 'Korean', icon: Utensils, color: '#9b59b6', bg: '#f3e5f5' },
  { key: 'Dessert', label: 'Dessert', icon: Utensils, color: '#ff6b81', bg: '#ffe8ed' },
]

// ============================================
// FOODIE: HOME VIEW - Grab/Foodpanda Style
// ============================================
function FoodieHomeView() {
  const { navigate, setShowAuthModal } = useAppStore()
  const { selectedCategory, setSelectedCategory, searchQuery, setSearchQuery } = useAppStore()
  const { isAuthenticated } = useAuthStore()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchDeals = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'active' })
    if (selectedCategory && selectedCategory !== 'All') params.set('category', selectedCategory)
    if (debouncedSearch) params.set('search', debouncedSearch)
    params.set('lat', '3.1390')
    params.set('lng', '101.6869')
    params.set('maxDistance', '20')

    const res = await apiFetch<{ deals: Deal[]; total: number }>(`/api/deals?${params}`)
    if (res.success && res.data) {
      setDeals(res.data.deals)
    }
    setLoading(false)
  }, [selectedCategory, debouncedSearch])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  // Assign card sizes for visual variety
  const getCardSize = (index: number): CardSize => {
    if (index === 0) return 'featured'     // First: hero card
    if (index % 5 === 0) return 'large'    // Every 5th: full-width
    return 'medium'                         // Default: 2-column
  }

  return (
    <div className="pb-28 bg-[#F4F7F6]">
      {/* ===== Sticky Header - Grab/Foodpanda Style ===== */}
      <div 
        className="sticky top-0 z-30 bg-white" 
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 8px))' }}
      >
        {/* Delivery Address Bar */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#00B14F] flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[#717971] font-medium leading-tight">Deliver to</p>
                <p className="text-xs font-bold text-[#1a1c1e] truncate leading-tight">
                  Kuala Lumpur, Malaysia
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#717971] flex-shrink-0" />
            </button>
            <div className="flex items-center gap-2 ml-2">
              {isAuthenticated ? (
                <NotificationBell />
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="h-8 px-4 rounded-full text-xs font-bold bg-[#00B14F] text-white hover:bg-[#008e3e] active:scale-95 transition-all"
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717971]" />
            <Input
              placeholder="Search flash deals, restaurants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-full text-sm bg-[#F4F7F6] border-0 focus:bg-white focus:border-[#00B14F]"
            />
          </div>
        </div>
      </div>

      {/* ===== Category Icon Grid (grid-cols-4) ===== */}
      <div className="bg-white px-4 py-3 mb-2">
        <div className="grid grid-cols-4 gap-2">
          {CATEGORY_ICONS.map((cat) => {
            const isActive = selectedCategory === cat.key || (cat.key === 'All' && !selectedCategory)
            const Icon = cat.icon
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key === 'All' ? null : cat.key)}
                className={`flex flex-col items-center gap-1.5 py-2 rounded-xl transition-all duration-150 ${
                  isActive ? 'bg-[#00B14F]/10 ring-1 ring-[#00B14F]/30' : ''
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: cat.bg }}
                >
                  <Icon className="w-5 h-5" style={{ color: cat.color }} />
                </div>
                <span className={`text-[10px] font-bold leading-tight ${
                  isActive ? 'text-[#00B14F]' : 'text-[#1a1c1e]'
                }`}>
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ===== Flash Deals Section Header ===== */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-[#FB923C]" />
          <h2 className="text-base font-extrabold text-[#1a1c1e]">Flash Deals</h2>
          <span className="text-xs text-[#717971] font-medium">{deals.length} available</span>
        </div>
      </div>

      {/* ===== Deals Grid ===== */}
      <div className="px-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-52 rounded-xl" />
              <Skeleton className="h-52 rounded-xl" />
            </div>
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[#f0f4f2] flex items-center justify-center mx-auto mb-4">
              <Utensils className="w-10 h-10 text-[#c1c9c0]" />
            </div>
            <h3 className="text-base font-bold text-[#1a1c1e]">No deals found</h3>
            <p className="text-sm text-[#717971] mt-1">Check back soon for new flash deals!</p>
          </div>
        ) : (
          deals.map((deal, index) => {
            const size = getCardSize(index)
            const isFullWidth = size === 'featured' || size === 'large'
            
            const nextDeal = deals[index + 1]
            const isPairStart = size === 'medium' && nextDeal && getCardSize(index + 1) === 'medium'
            const isPairSecond = index > 0 && getCardSize(index) === 'medium' && getCardSize(index - 1) === 'medium'
            
            return (
              <div key={deal.id}>
                {isFullWidth ? (
                  <DealCard
                    deal={deal}
                    onSelect={() => navigate('deal-detail', { id: deal.id })}
                    size={size}
                  />
                ) : isPairStart ? (
                  <div className="grid grid-cols-2 gap-3">
                    <DealCard
                      deal={deal}
                      onSelect={() => navigate('deal-detail', { id: deal.id })}
                      size="medium"
                    />
                    <DealCard
                      deal={nextDeal}
                      onSelect={() => navigate('deal-detail', { id: nextDeal.id })}
                      size="medium"
                    />
                  </div>
                ) : isPairSecond ? null : (
                  <DealCard
                    deal={deal}
                    onSelect={() => navigate('deal-detail', { id: deal.id })}
                    size="medium"
                  />
                )}
                <div className="h-3" />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================
// FOODIE: DEAL DETAIL VIEW
// ============================================
function DealDetailView() {
  const { viewParams, goBack, setShowAuthModal, navigate } = useAppStore()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const { user, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!viewParams.id) return
    setLoading(true)
    apiFetch<Deal>(`/api/deals/${viewParams.id}`).then((res) => {
      if (res.success && res.data) setDeal(res.data)
    }).finally(() => setLoading(false))
  }, [viewParams.id])

  const handleClaim = async () => {
    if (!deal) return
    if (!isAuthenticated || !user) {
      setShowAuthModal(true)
      return
    }
    setClaiming(true)
    try {
      // Step 1: Claim (create reservation)
      const claimRes = await apiFetch<{ reservation: { id: string } }>(`/api/deals/${deal.id}/claim`, {
        method: 'POST',
        body: JSON.stringify({ quantity: 1 }),
      })
      if (!claimRes.success) {
        toast.error(claimRes.error || 'Failed to claim deal')
        return
      }

      const reservationId = claimRes.data?.reservation?.id

      // Step 2: Confirm reservation → Order
      const confirmRes = await apiFetch<Order>(`/api/deals/${deal.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ reservationId }),
      })
      if (confirmRes.success && confirmRes.data) {
        setOrder(confirmRes.data)
        setClaimed(true)
        toast.success('Deal claimed! Check your orders for the QR code.')

        // Refresh deal to show updated stock
        const refreshRes = await apiFetch<Deal>(`/api/deals/${deal.id}`)
        if (refreshRes.success && refreshRes.data) setDeal(refreshRes.data)
      } else {
        toast.error(confirmRes.error || 'Failed to confirm claim')
      }
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="pb-28">
        <Skeleton className="aspect-[16/10] rounded-none" />
        <div className="px-5 py-4 space-y-4">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-[#414841]">Deal not found</p>
      </div>
    )
  }

  const isSoldOut = deal.availableQuantity <= 0 || deal.status === 'sold_out'

  return (
    <div className="pb-28">
      {/* Back button */}
      <button onClick={goBack} className="fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-card">
        <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
      </button>

      {/* Hero Image */}
      <div className="relative aspect-[16/10] bg-gradient-to-br from-[#dfe5e1] to-[#f0f4f2]">
        {deal.imageUrl ? (
          <Image src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover" fill sizes="(max-width: 640px) 100vw, 400px" priority />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="w-20 h-20 text-[#66d99a]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5">
          <Badge className="bg-gradient-to-r from-[#FB923C] to-[#F97316] text-white font-bold border-0 rounded-lg">
            -{deal.discountPercent}% OFF
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pt-4">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e]">{deal.title}</h1>
        <p className="text-[#414841] mt-1 flex items-center gap-1.5">
          <Store className="w-4 h-4" />
          {deal.vendor?.businessName || 'Vendor'}
        </p>

        {/* Price */}
        <div className="flex items-end gap-3 mt-4">
          <span className="text-3xl font-extrabold text-[#00B14F]">RM{deal.dealPrice.toFixed(2)}</span>
          <span className="text-lg text-[#717971] line-through mb-0.5">RM{deal.originalPrice.toFixed(2)}</span>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Clock className="w-5 h-5 text-[#00B14F] mx-auto mb-1" />
            <p className="text-xs text-[#414841]">Ends in</p>
            <CountdownTimer expiresAt={deal.expiresAt} compact />
          </div>
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Flame className={`w-5 h-5 mx-auto mb-1 ${deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#00B14F]'}`} />
            <p className="text-xs text-[#414841]">Stock</p>
            <p className={`text-sm font-bold ${deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#1a1c1e]'}`}>
              {deal.availableQuantity} left
            </p>
          </div>
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <MapPin className="w-5 h-5 text-[#00B14F] mx-auto mb-1" />
            <p className="text-xs text-[#414841]">Distance</p>
            <p className="text-sm font-bold text-[#1a1c1e]">
              {deal.distance ? `${deal.distance.toFixed(1)}km` : 'Nearby'}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <h3 className="font-bold text-[#1a1c1e] mb-2">About this deal</h3>
          <p className="text-sm text-[#414841] leading-relaxed">{deal.description}</p>
        </div>

        {/* Pickup Info */}
        <div className="mt-5">
          <h3 className="font-bold text-[#1a1c1e] mb-2">Pickup Details</h3>
          <div className="bg-[#f0f4f2] rounded-xl p-4">
            <p className="text-sm text-[#414841] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#00B14F]" />
              Pickup only
            </p>
            {deal.pickupInstructions && (
              <p className="text-sm text-[#414841] mt-2">{deal.pickupInstructions}</p>
            )}
          </div>
        </div>

        {/* Claimed Success */}
        {claimed && order && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-5 bg-[#ecfdf5] border border-[#34D399]/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-[#059669]" />
              <span className="font-bold text-[#059669]">Deal Claimed!</span>
            </div>
            <p className="text-sm text-[#065f46]">
              Order #{order.orderNumber}
            </p>
            {order.pickupDeadline && (
              <p className="text-xs text-[#065f46] mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Pickup by {new Date(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <Button
              onClick={() => navigate('orders')}
              className="mt-3 w-full h-10 rounded-xl text-sm font-bold bg-gradient-to-b from-[#059669] to-[#047857] text-white hover:opacity-90 active:scale-95 transition-all"
            >
              <QrCode className="w-4 h-4 mr-1.5" />
              View QR Code & Pickup Details
            </Button>
          </motion.div>
        )}
      </div>

      {/* Sticky Bottom Action - Claim Deal Now (Grab Style) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8edea] px-5 py-3 z-50 pb-[max(12px,env(safe-area-inset-bottom,12px))]">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div>
            <p className="text-[10px] text-[#717971] font-medium">Flash Deal Price</p>
            <p className="text-2xl font-black text-[#00B14F]">RM{deal.dealPrice.toFixed(2)}</p>
          </div>
          <Button
            onClick={handleClaim}
            disabled={claiming || (isSoldOut && isAuthenticated) || (claimed && isAuthenticated)}
            className={`h-12 px-8 rounded-xl font-bold text-base transition-all active:scale-95 ${
              claimed && isAuthenticated
                ? 'bg-[#00B14F] hover:bg-[#00B14F] text-white'
                : isSoldOut && isAuthenticated
                ? 'bg-[#c1c9c0] text-white cursor-not-allowed'
                : 'bg-[#00B14F] hover:bg-[#008e3e] text-white'
            }`}
          >
            {claiming ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : claimed && isAuthenticated ? (
              <>
                <Check className="w-5 h-5 mr-1" /> Claimed
              </>
            ) : isSoldOut && isAuthenticated ? (
              'Sold Out'
            ) : !isAuthenticated ? (
              <>
                <Zap className="w-5 h-5 mr-1" /> Claim Deal Now
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-1" /> Claim Deal
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// FOODIE: ORDERS VIEW
// ============================================
function FoodieOrdersView() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const { navigate } = useAppStore()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }
    setLoading(true)
    apiFetch<{ orders: Order[] }>('/api/orders').then((res) => {
      if (res.success && res.data) setOrders(res.data.orders || [])
    }).finally(() => setLoading(false))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="pb-28 px-5 pt-2">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">My Orders</h1>
        <div className="text-center py-16">
          <ShoppingBag className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">Sign in to view orders</h3>
          <p className="text-sm text-[#414841] mt-1">You need an account to track your orders</p>
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const activeOrders = orders.filter(o => o.status === 'pending_pickup')
  const completedOrders = orders.filter(o => o.status === 'completed')

  return (
    <div className="pb-28 px-5 pt-2">
      <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">My Orders</h1>

      {loading ? (
        Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="mb-3 border-0 shadow-card rounded-2xl">
            <CardContent className="p-4"><Skeleton className="h-16 w-full rounded-xl" /></CardContent>
          </Card>
        ))
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">No orders yet</h3>
          <p className="text-sm text-[#414841] mt-1">Claim your first flash deal!</p>
          <Button onClick={() => navigate('home')} className="mt-4 bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white rounded-xl">
            Browse Deals
          </Button>
        </div>
      ) : (
        <>
          {activeOrders.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-[#1a1c1e] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FB923C]" /> Active Orders
              </h2>
              <div className="space-y-3">
                {activeOrders.map((order) => (
                  <motion.div key={order.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
                    <Card className="border-0 shadow-card rounded-2xl overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-[#1a1c1e]">{order.deal?.title || 'Deal'}</p>
                            <p className="text-xs text-[#414841] mt-0.5">#{order.orderNumber}</p>
                          </div>
                          <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg font-bold">
                            Pending Pickup
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#d7ddd9]">
                          <span className="text-lg font-extrabold text-[#00B14F]">RM{order.totalPrice.toFixed(2)}</span>
                          <span className="text-xs text-[#414841] flex items-center gap-1">
                            <QrCode className="w-3.5 h-3.5" /> Tap to view QR
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {completedOrders.length > 0 && (
            <div>
              <h2 className="font-bold text-[#1a1c1e] mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#34D399]" /> Completed
              </h2>
              <div className="space-y-3">
                {completedOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-card rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-[#1a1c1e]">{order.deal?.title || 'Deal'}</p>
                          <p className="text-xs text-[#414841] mt-0.5">#{order.orderNumber}</p>
                        </div>
                        <Badge className="bg-[#34D399]/10 text-[#059669] border-0 rounded-lg font-bold">
                          Completed
                        </Badge>
                      </div>
                      <p className="text-sm font-bold text-[#00B14F] mt-2">RM{order.totalPrice.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* QR Code Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Pickup QR Code</DialogTitle>
            <DialogDescription className="text-center">Show this code to the vendor</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="text-center py-4">
              <div className="bg-[#f0f4f2] rounded-2xl p-6 inline-block">
                <QrCode className="w-40 h-40 text-[#00B14F]" />
              </div>
              <p className="mt-4 font-bold text-[#1a1c1e]">Order #{selectedOrder.orderNumber}</p>
              <p className="text-sm text-[#414841] mt-1">RM{selectedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs text-[#717971] mt-2">
                Pickup before: {new Date(selectedOrder.pickupDeadline).toLocaleTimeString()}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// FOODIE: PROFILE VIEW
// ============================================
function FoodieProfileView() {
  const { user, updateActiveRole, logout, isAuthenticated } = useAuthStore()
  const { setActiveRole, navigate } = useAppStore()

  if (!isAuthenticated || !user) {
    return (
      <div className="pb-28 px-5 pt-2">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Profile</h1>
        <div className="text-center py-16">
          <User className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">Sign in to your profile</h3>
          <p className="text-sm text-[#414841] mt-1">Access your account settings and more</p>
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const roles = user?.roles || []

  const handleRoleSwitch = (role: AppRole) => {
    if (roles.includes(role)) {
      updateActiveRole(role)
      setActiveRole(role)
    }
  }

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    logout()
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Profile</h1>

      {/* User Card */}
      <Card className="border-0 shadow-card rounded-2xl mb-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-14 h-14 border-2 border-[#66d99a]">
              <AvatarFallback className="bg-[#00B14F] text-white text-lg font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[#1a1c1e] text-base truncate">{user?.name}</h2>
              <p className="text-xs text-[#414841] truncate">{user?.email}</p>
              <Badge className="mt-1 bg-[#00B14F]/10 text-[#00B14F] border-0 rounded-lg text-[10px]">
                {user?.activeRole === 'foodie' ? '🍽️ Foodie' : user?.activeRole === 'vendor' ? '🏪 Vendor' : '🛡️ Admin'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Switching */}
      <h3 className="font-bold text-[#1a1c1e] text-sm mb-2">Switch Mode</h3>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['foodie', 'vendor', 'admin'] as AppRole[]).map((role) => {
          const isAvailable = roles.includes(role)
          const isActive = user?.activeRole === role
          const icons = { foodie: Utensils, vendor: Store, admin: Shield }
          const labels = { foodie: 'Foodie', vendor: 'Vendor', admin: 'Admin' }
          const Icon = icons[role]
          return (
            <button
              key={role}
              onClick={() => handleRoleSwitch(role)}
              disabled={!isAvailable}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                isActive ? 'bg-[#00B14F] text-white shadow-card' : 'bg-[#f0f4f2] text-[#1a1c1e]'
              } ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-bold">{labels[role]}</span>
              {isActive && <Check className="w-3 h-3" />}
            </button>
          )
        })}
      </div>

      {/* Quick Links */}
      <div className="space-y-2 mb-4">
        {roles.includes('vendor') && (
          <button onClick={() => navigate('subscription')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
            <CreditCard className="w-5 h-5 text-[#00B14F]" />
            <div className="text-left flex-1">
              <p className="font-bold text-sm text-[#1a1c1e]">Subscription Plan</p>
              <p className="text-[11px] text-[#414841]">Manage your vendor subscription</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#717971]" />
          </button>
        )}
        {!roles.includes('vendor') && (
          <button onClick={() => navigate('home', {})} className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#66d99a]/20 to-[#00B14F]/5 hover:from-[#66d99a]/30 hover:to-[#00B14F]/10 transition-colors">
            <Sparkles className="w-5 h-5 text-[#00B14F]" />
            <div className="text-left flex-1">
              <p className="font-bold text-sm text-[#1a1c1e]">Become a Vendor</p>
              <p className="text-[11px] text-[#414841]">Turn unsold meals into revenue</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#717971]" />
          </button>
        )}
      </div>

      {/* Sign Out */}
      <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 text-[#EF4444] hover:bg-red-100 transition-colors">
        <LogOut className="w-5 h-5" />
        <span className="font-bold text-sm">Sign Out</span>
      </button>
    </div>
  )
}

// ============================================
// VENDOR: DASHBOARD VIEW
// ============================================
function VendorDashboardView() {
  const { navigate } = useAppStore()
  const { user } = useAuthStore()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch<{ vendors: Vendor[]; total: number }>('/api/vendors?my=true'),
      apiFetch<{ deals: Deal[]; total: number }>('/api/deals?status=active&pageSize=50'),
      apiFetch<{ orders: Order[] }>('/api/orders'),
    ]).then(([vRes, dRes, oRes]) => {
      if (vRes.success && vRes.data) {
        const vData = vRes.data.vendors?.[0] || null
        if (vData) setVendor(vData)
      }
      if (dRes.success && dRes.data) {
        const d = dRes.data.deals || []
        setDeals(Array.isArray(d) ? d : [])
      }
      if (oRes.success && oRes.data) {
        const o = (oRes.data as { orders?: Order[] }).orders || oRes.data
        setOrders(Array.isArray(o) ? o : [])
      }
    }).finally(() => setLoading(false))
  }, [])

  const vendorDeals = deals.filter(d => d.vendorId === vendor?.id)
  const activeDeals = vendorDeals.filter(d => d.status === 'active')
  const pendingOrders = orders.filter(o => o.status === 'pending_pickup' && vendorDeals.some(d => d.id === o.dealId))
  const todayRevenue = orders
    .filter(o => o.vendorId === vendor?.id && o.status === 'completed')
    .reduce((sum, o) => sum + o.totalPrice, 0)

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a1c1e]">Dashboard</h1>
          <p className="text-sm text-[#414841]">{vendor?.businessName || 'Your Store'}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => navigate('profile')} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors" aria-label="Account">
            <User className="w-5 h-5 text-[#00B14F]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <DollarSign className="w-6 h-6 text-[#00B14F] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Revenue</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">RM{todayRevenue.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#FB923C] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{activeDeals.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#34D399] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Pending Pickup</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{pendingOrders.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 text-[#506350] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Sold</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{vendor?.totalSales || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <h3 className="font-bold text-[#1a1c1e] mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('create-deal')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#66d99a]/20 to-[#00B14F]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#00B14F] flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Create Deal</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('inventory')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#34D399]/20 to-[#059669]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Inventory</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('fulfillment')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FB923C] flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Fulfillment</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('subscription')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#d3e8d0]/40 to-[#506350]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#506350] flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Subscription</span>
            </motion.button>
          </div>

          {/* Active Deals List */}
          <h3 className="font-bold text-[#1a1c1e] mb-3">Your Active Deals</h3>
          {activeDeals.length === 0 ? (
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-6 text-center">
                <Flame className="w-10 h-10 text-[#c1c9c0] mx-auto mb-2" />
                <p className="text-sm text-[#414841]">No active deals. Create one now!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeDeals.map((deal) => (
                <Card key={deal.id} className="border-0 shadow-card rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-[#1a1c1e]">{deal.title}</p>
                        <p className="text-xs text-[#414841] mt-0.5">RM{deal.dealPrice.toFixed(2)} • {deal.availableQuantity} left</p>
                      </div>
                      <Badge className="bg-[#34D399]/10 text-[#059669] border-0 rounded-lg text-xs">Active</Badge>
                    </div>
                    <div className="mt-2">
                      <Progress value={(deal.soldQuantity / deal.totalQuantity) * 100} className="h-2" />
                      <p className="text-xs text-[#717971] mt-1">{deal.soldQuantity}/{deal.totalQuantity} sold</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================
// VENDOR: CREATE DEAL VIEW
// ============================================
function VendorCreateDealView() {
  const { goBack } = useAppStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', category: 'Malay',
    originalPrice: '', dealPrice: '', totalQuantity: '',
    expiresAt: '', pickupInstructions: '',
  })

  const discountPercent = form.originalPrice && form.dealPrice
    ? Math.round(((parseFloat(form.originalPrice) - parseFloat(form.dealPrice)) / parseFloat(form.originalPrice)) * 100)
    : 0

  const handleSubmit = async () => {
    if (!form.title || !form.description || !form.originalPrice || !form.dealPrice || !form.totalQuantity || !form.expiresAt) {
      toast.error('Please fill in all required fields')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<Deal>('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          originalPrice: parseFloat(form.originalPrice),
          dealPrice: parseFloat(form.dealPrice),
          totalQuantity: parseInt(form.totalQuantity),
          maxClaimsPerUser: 1,
        }),
      })
      if (res.success) {
        toast.success('Deal created successfully!')
        goBack()
      } else {
        toast.error(res.error || 'Failed to create deal')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Create Flash Deal</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              s <= step ? 'bg-[#00B14F] text-white' : 'bg-[#e8edea] text-[#717971]'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 rounded ${s < step ? 'bg-[#00B14F]' : 'bg-[#e8edea]'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Food Info */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Food Name *</Label>
            <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="e.g. Nasi Lemak Bunga Telang" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Description *</Label>
            <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Describe your meal..." className="mt-1.5 rounded-xl min-h-[100px]" />
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
              <SelectTrigger className="h-12 rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Vegan', 'Dessert', 'Beverage', 'Other'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setStep(2)} className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white">
            Next: Pricing <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      )}

      {/* Step 2: Pricing & Inventory */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-semibold text-[#1a1c1e]">Original Price (RM) *</Label>
              <Input type="number" value={form.originalPrice} onChange={(e) => setForm({...form, originalPrice: e.target.value})} placeholder="15.00" className="mt-1.5 h-12 rounded-xl" />
            </div>
            <div>
              <Label className="font-semibold text-[#1a1c1e]">Deal Price (RM) *</Label>
              <Input type="number" value={form.dealPrice} onChange={(e) => setForm({...form, dealPrice: e.target.value})} placeholder="8.00" className="mt-1.5 h-12 rounded-xl" />
            </div>
          </div>
          {discountPercent > 0 && (
            <div className="bg-[#ecfdf5] rounded-xl p-3 text-center">
              <p className="text-sm text-[#059669] font-bold">🔥 {discountPercent}% Discount</p>
            </div>
          )}
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Available Quantity *</Label>
            <Input type="number" value={form.totalQuantity} onChange={(e) => setForm({...form, totalQuantity: e.target.value})} placeholder="20" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Deal Expires At *</Label>
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({...form, expiresAt: e.target.value})} className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)} variant="outline" className="flex-1 h-12 rounded-xl font-bold">Back</Button>
            <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white">
              Next: Review <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Review & Publish */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <Card className="border-0 shadow-card rounded-2xl">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-lg text-[#1a1c1e]">{form.title || 'Untitled Deal'}</h3>
              <p className="text-sm text-[#414841]">{form.description}</p>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#00B14F]/10 text-[#00B14F] border-0 rounded-lg">{form.category}</Badge>
                <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg">-{discountPercent}%</Badge>
              </div>
              <Separator className="bg-[#d7ddd9]" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#717971]">Original</p>
                  <p className="font-bold text-[#1a1c1e] line-through">RM{form.originalPrice}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Deal Price</p>
                  <p className="font-bold text-[#00B14F] text-lg">RM{form.dealPrice}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Quantity</p>
                  <p className="font-bold text-[#1a1c1e]">{form.totalQuantity}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Pickup</p>
                  <p className="font-bold text-[#1a1c1e]">Only</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button onClick={() => setStep(2)} variant="outline" className="flex-1 h-12 rounded-xl font-bold">Back</Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white active:scale-95 transition-transform"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>
                <Zap className="w-5 h-5 mr-1" /> Publish Deal
              </>}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ============================================
// VENDOR: INVENTORY VIEW
// ============================================
function VendorInventoryView() {
  const { goBack } = useAppStore()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch<{ deals: Deal[] }>('/api/deals?status=active&pageSize=50').then((res) => {
      if (res.success && res.data) {
        setDeals(res.data.deals || [])
      }
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Inventory</h1>
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-3" />)
      ) : deals.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">No active inventory</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <Card key={deal.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-[#1a1c1e]">{deal.title}</p>
                    <p className="text-xs text-[#414841]">RM{deal.dealPrice.toFixed(2)} per meal</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    deal.status === 'active' ? 'bg-[#34D399]/10 text-[#059669]' : 'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {deal.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{deal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#FB923C]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#FB923C]">{deal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#34D399]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#059669]">{deal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#00B14F]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Available</p>
                    <p className="font-bold text-[#00B14F]">{deal.availableQuantity}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// VENDOR: FULFILLMENT VIEW
// ============================================
function VendorFulfillmentView() {
  const { goBack } = useAppStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [qrInput, setQrInput] = useState('')

  useEffect(() => {
    setLoading(true)
    apiFetch<{ orders: Order[] }>('/api/orders').then((res) => {
      if (res.success && res.data) setOrders(res.data.orders || [])
    }).finally(() => setLoading(false))
  }, [])

  const pendingPickup = orders.filter(o => o.status === 'pending_pickup')
  const completed = orders.filter(o => o.status === 'completed')

  const handleVerify = async () => {
    if (!qrInput.trim()) return
    setVerifying(true)
    // Find order by QR code
    const order = orders.find(o => o.qrCode === qrInput.trim())
    if (!order) {
      toast.error('Order not found for this QR code')
      setVerifying(false)
      return
    }
    const res = await apiFetch(`/api/orders/${order.id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ qrCode: qrInput.trim() }),
    })
    if (res.success) {
      toast.success('Pickup verified successfully!')
      setQrInput('')
      // Refresh orders
      apiFetch<{ orders: Order[] }>('/api/orders').then((r) => {
        if (r.success && r.data) setOrders(r.data.orders || [])
      })
    } else {
      toast.error(res.error || 'Verification failed')
    }
    setVerifying(false)
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Fulfillment</h1>
      </div>

      {/* QR Verify */}
      <Card className="border-0 shadow-card rounded-2xl mb-5">
        <CardContent className="p-5">
          <h3 className="font-bold text-[#1a1c1e] mb-3 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#00B14F]" /> Verify Pickup
          </h3>
          <div className="flex gap-2">
            <Input
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Enter QR code or scan..."
              className="h-12 rounded-xl flex-1"
            />
            <Button
              onClick={handleVerify}
              disabled={verifying || !qrInput.trim()}
              className="h-12 px-5 rounded-xl font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white"
            >
              {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending */}
      <h3 className="font-bold text-[#1a1c1e] mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#FB923C]" /> Pending Pickup ({pendingPickup.length})
      </h3>
      {pendingPickup.length === 0 ? (
        <p className="text-sm text-[#717971] mb-6">No pending pickups</p>
      ) : (
        <div className="space-y-2 mb-6">
          {pendingPickup.map((order) => (
            <Card key={order.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-[#1a1c1e]">#{order.orderNumber}</p>
                  <p className="text-xs text-[#414841]">RM{order.totalPrice.toFixed(2)} • Qty: {order.quantity}</p>
                </div>
                <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg text-xs">Pending</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed */}
      <h3 className="font-bold text-[#1a1c1e] mb-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#34D399]" /> Completed ({completed.length})
      </h3>
      {completed.length === 0 ? (
        <p className="text-sm text-[#717971]">No completed orders yet</p>
      ) : (
        <div className="space-y-2">
          {completed.map((order) => (
            <Card key={order.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-[#1a1c1e]">#{order.orderNumber}</p>
                  <p className="text-xs text-[#414841]">RM{order.totalPrice.toFixed(2)}</p>
                </div>
                <Badge className="bg-[#34D399]/10 text-[#059669] border-0 rounded-lg text-xs">Done</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// VENDOR: SUBSCRIPTION VIEW
// ============================================
function VendorSubscriptionView() {
  const { goBack } = useAppStore()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    apiFetch<{ vendors: Vendor[] }>('/api/vendors?my=true').then((res) => {
      if (res.success && res.data) {
        const v = res.data.vendors?.[0] || null
        if (v) setVendor(v)
      }
    })
  }, [])

  const handleActivate = async (plan: string) => {
    setActivating(true)
    // Simulated payment - in real app would redirect to Stripe/Billplz
    await new Promise(resolve => setTimeout(resolve, 1500))
    toast.success(`${plan === 'vendor_basic' ? 'Basic' : 'Premium'} plan activated! (Simulated)`)
    setActivating(false)
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Subscription</h1>
      </div>

      {/* Current Plan */}
      {vendor && vendor.subscriptionPlan !== 'none' && (
        <Card className="border-0 shadow-card rounded-2xl mb-5 bg-gradient-to-br from-[#00B14F] to-[#008e3e]">
          <CardContent className="p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5" />
              <span className="font-bold">Current Plan: {vendor.subscriptionPlan === 'vendor_basic' ? 'Basic' : 'Premium'}</span>
            </div>
            <p className="text-sm text-white/70">Status: {vendor.subscriptionStatus}</p>
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <div className="space-y-4">
        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_basic' ? 'ring-2 ring-[#00B14F]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-[#1a1c1e]">Basic</h3>
                <p className="text-2xl font-extrabold text-[#00B14F]">RM99<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_basic' && (
                <Badge className="bg-[#00B14F] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Unlimited flash deals</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Inventory management</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> QR fulfillment</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Basic statistics</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_basic' && (
              <Button onClick={() => handleActivate('vendor_basic')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white">
                {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Choose Basic'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_premium' ? 'ring-2 ring-[#00B14F]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-[#1a1c1e]">Premium</h3>
                  <Sparkles className="w-4 h-4 text-[#FB923C]" />
                </div>
                <p className="text-2xl font-extrabold text-[#00B14F]">RM199<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_premium' && (
                <Badge className="bg-[#00B14F] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Everything in Basic</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Advanced analytics</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Priority ranking</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Marketing tools</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#717971]" /> Siren Push (coming)</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#717971]" /> Auto-Drop (coming)</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_premium' && (
              <Button onClick={() => handleActivate('vendor_premium')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#FB923C] to-[#F97316] text-white">
                {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Choose Premium'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================
// ADMIN: DASHBOARD VIEW
// ============================================
function AdminDashboardView() {
  const { navigate } = useAppStore()
  const [analytics, setAnalytics] = useState<{ overview: Record<string, number>; dealsByStatus: Record<string, number>; ordersByStatus: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch<Record<string, unknown>>('/api/admin/analytics').then((res) => {
      if (res.success && res.data) setAnalytics(res.data)
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e]">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => navigate('profile')} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors" aria-label="Account">
            <User className="w-5 h-5 text-[#00B14F]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 text-[#00B14F] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Users</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalUsers as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Store className="w-6 h-6 text-[#34D399] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Vendors</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalVendors as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#FB923C] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.dealsByStatus as Record<string, number>)?.active || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#506350] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Orders</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalOrders as number) || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Nav */}
          <div className="space-y-2">
            {[
              { icon: Store, label: 'Vendor Management', view: 'vendors' as AppView, color: 'text-[#34D399]' },
              { icon: Users, label: 'User Management', view: 'users' as AppView, color: 'text-[#00B14F]' },
              { icon: BarChart3, label: 'Analytics', view: 'analytics' as AppView, color: 'text-[#FB923C]' },
            ].map((item) => (
              <motion.button
                key={item.view}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(item.view)}
                className="w-full flex items-center gap-3 p-4 bg-white shadow-card rounded-2xl"
              >
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className="font-bold text-sm text-[#1a1c1e]">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-[#717971] ml-auto" />
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================
// ADMIN: VENDOR MANAGEMENT VIEW
// ============================================
function AdminVendorsView() {
  const { goBack } = useAppStore()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    apiFetch<{ vendors: Vendor[] }>('/api/admin/vendors').then((res) => {
      if (res.success && res.data) setVendors(res.data.vendors || [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? vendors : vendors.filter(v => v.verificationStatus === filter)

  const handleAction = async (vendorId: string, action: string, reason?: string) => {
    const res = await apiFetch(`/api/admin/vendors/${vendorId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    })
    if (res.success) {
      toast.success(`Vendor ${action} successful`)
      // Refresh
      apiFetch<{ vendors: Vendor[] }>('/api/admin/vendors').then((r) => {
        if (r.success && r.data) setVendors(r.data.vendors || [])
      })
    } else {
      toast.error(res.error || 'Action failed')
    }
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Vendor Management</h1>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'pending', 'approved', 'rejected', 'suspended'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize flex-shrink-0 transition-all ${
              filter === f ? 'bg-[#00B14F] text-white' : 'bg-[#e8edea] text-[#414841]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl mb-3" />)
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#717971] text-center py-8">No vendors found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card key={v.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-[#1a1c1e]">{v.businessName}</p>
                    <p className="text-xs text-[#414841]">{v.address}</p>
                    <p className="text-xs text-[#717971] mt-1">{v.contactEmail}</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    v.verificationStatus === 'approved' ? 'bg-[#34D399]/10 text-[#059669]' :
                    v.verificationStatus === 'pending' ? 'bg-[#FB923C]/10 text-[#FB923C]' :
                    v.verificationStatus === 'rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                    'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {v.verificationStatus}
                  </Badge>
                </div>
                {v.verificationStatus === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => handleAction(v.id, 'approve')} className="flex-1 h-9 rounded-xl bg-[#34D399] hover:bg-[#059669] text-white text-xs font-bold">
                      Approve
                    </Button>
                    <Button size="sm" onClick={() => handleAction(v.id, 'reject', 'Does not meet requirements')} variant="outline" className="flex-1 h-9 rounded-xl text-xs font-bold text-[#EF4444] border-[#EF4444]/30">
                      Reject
                    </Button>
                  </div>
                )}
                {v.verificationStatus === 'approved' && (
                  <Button size="sm" onClick={() => handleAction(v.id, 'suspend', 'Policy violation')} variant="outline" className="mt-3 h-9 rounded-xl text-xs font-bold text-[#EF4444] border-[#EF4444]/30">
                    <Ban className="w-3 h-3 mr-1" /> Suspend
                  </Button>
                )}
                {v.verificationStatus === 'suspended' && (
                  <Button size="sm" onClick={() => handleAction(v.id, 'restore')} className="mt-3 h-9 rounded-xl text-xs font-bold bg-[#00B14F] text-white">
                    <RefreshCw className="w-3 h-3 mr-1" /> Restore
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// ADMIN: USERS VIEW
// ============================================
function AdminUsersView() {
  const { goBack } = useAppStore()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    apiFetch<{ users: AuthUser[] }>('/api/admin/users').then((res) => {
      if (res.success && res.data) setUsers(res.data.users || [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = search ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) : users

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">User Management</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717971]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="pl-9 h-10 rounded-xl" />
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl mb-2" />)
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-[#00B14F] text-white text-sm font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[#1a1c1e] truncate">{u.name}</p>
                  <p className="text-xs text-[#414841] truncate">{u.email}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {u.roles.map((r) => (
                    <Badge key={r} className="bg-[#e8edea] text-[#00B14F] border-0 rounded-md text-[10px] px-1.5">
                      {r}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// ADMIN: ANALYTICS VIEW
// ============================================
function AdminAnalyticsView() {
  const { goBack } = useAppStore()
  const [analytics, setAnalytics] = useState<{ overview: Record<string, number>; dealsByStatus: Record<string, number>; ordersByStatus: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch<Record<string, unknown>>('/api/admin/analytics').then((res) => {
      if (res.success && res.data) setAnalytics(res.data)
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Analytics</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: 'Total Users', value: analytics?.overview?.totalUsers || 0, icon: Users, color: 'text-[#00B14F]' },
            { label: 'Total Vendors', value: analytics?.overview?.totalVendors || 0, icon: Store, color: 'text-[#34D399]' },
            { label: 'Active Deals', value: (analytics?.dealsByStatus as Record<string, number>)?.active || 0, icon: Flame, color: 'text-[#FB923C]' },
            { label: 'Total Orders', value: analytics?.overview?.totalOrders || 0, icon: ShoppingBag, color: 'text-[#506350]' },
            { label: 'Pending Vendors', value: (analytics?.dealsByStatus as Record<string, number>)?.pending || 0, icon: Clock, color: 'text-[#FB923C]' },
            { label: 'Meals Saved from Waste', value: analytics?.overview?.totalOrders || 0, icon: Heart, color: 'text-[#34D399]' },
          ].map((item) => (
            <Card key={item.label} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-[#f0f4f2] flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-[#414841]">{item.label}</p>
                  <p className="text-2xl font-extrabold text-[#1a1c1e]">{String(item.value)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// NOTIFICATION BELL
// ============================================
const NotificationBell = memo(function NotificationBell() {
  const { unreadCount } = useNotificationStore()
  const { navigate } = useAppStore()

  return (
    <button
      onClick={() => navigate('orders')}
      className="relative p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors"
    >
      <Bell className="w-5 h-5 text-[#00B14F]" />
      {unreadCount > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </motion.span>
      )}
    </button>
  )
})

// ============================================
// BOTTOM NAVIGATION - FOODIE (Grab Style)
// ============================================
function FoodieBottomNav() {
  const { currentView, navigate, setShowAuthModal } = useAppStore()
  const { isAuthenticated } = useAuthStore()

  const protectedViews: AppView[] = ['orders', 'profile', 'subscriptions']

  const tabs = [
    { view: 'home' as AppView, icon: Home, label: 'Home' },
    { view: 'explore' as AppView, icon: Compass, label: 'Explore' },
    { view: 'orders' as AppView, icon: ShoppingBag, label: 'Orders' },
    { view: 'profile' as AppView, icon: User, label: 'Me' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8edea] z-40 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around max-w-lg mx-auto h-14">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view || (tab.view === 'home' && currentView === 'deal-detail')
          return (
            <button
              key={tab.view}
              onClick={() => {
                if (!isAuthenticated && protectedViews.includes(tab.view)) {
                  setShowAuthModal(true)
                } else {
                  navigate(tab.view)
                }
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 transition-all min-w-[56px] ${
                isActive ? 'text-[#00B14F]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#00B14F]" />
                )}
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-[#00B14F]' : ''}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ============================================
// BOTTOM NAVIGATION - VENDOR
// ============================================
function VendorBottomNav() {
  const { currentView, navigate } = useAppStore()

  const tabs = [
    { view: 'dashboard' as AppView, icon: LayoutDashboard, label: 'Dashboard' },
    { view: 'create-deal' as AppView, icon: PlusCircle, label: 'Create' },
    { view: 'inventory' as AppView, icon: Package, label: 'Inventory' },
    { view: 'fulfillment' as AppView, icon: CheckCircle, label: 'Fulfill' },
    { view: 'profile' as AppView, icon: User, label: 'More' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8edea] z-50 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around max-w-lg mx-auto h-14">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view
          return (
            <button
              key={tab.view}
              onClick={() => navigate(tab.view)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 transition-all min-w-[52px] ${
                isActive ? 'text-[#00B14F]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#00B14F]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#00B14F]' : ''}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ============================================
// BOTTOM NAVIGATION - ADMIN
// ============================================
function AdminBottomNav() {
  const { currentView, navigate } = useAppStore()

  const tabs = [
    { view: 'dashboard' as AppView, icon: LayoutDashboard, label: 'Dashboard' },
    { view: 'vendors' as AppView, icon: Store, label: 'Vendors' },
    { view: 'users' as AppView, icon: Users, label: 'Users' },
    { view: 'analytics' as AppView, icon: BarChart3, label: 'Analytics' },
    { view: 'profile' as AppView, icon: User, label: 'More' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8edea] z-50 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around max-w-lg mx-auto h-14">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view
          return (
            <button
              key={tab.view}
              onClick={() => navigate(tab.view)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 transition-all min-w-[52px] ${
                isActive ? 'text-[#00B14F]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#00B14F]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#00B14F]' : ''}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ============================================
// VIEW ROUTER
// ============================================
function ViewRouter() {
  const { activeRole, currentView, setActiveRole } = useAppStore()
  const { user } = useAuthStore()

  // Sync activeRole from auth store to app store
  useEffect(() => {
    if (user?.activeRole && user.activeRole !== activeRole) {
      setActiveRole(user.activeRole)
    }
  }, [user?.activeRole, activeRole, setActiveRole])

  const renderView = () => {
    // Foodie views
    if (activeRole === 'foodie') {
      switch (currentView) {
        case 'home': return <FoodieHomeView />
        case 'explore': return <FoodieHomeView /> // Same as home for MVP
        case 'deal-detail': return <DealDetailView />
        case 'orders': return <FoodieOrdersView />
        case 'profile': return <FoodieProfileView />
        default: return <FoodieHomeView />
      }
    }

    // Vendor views
    if (activeRole === 'vendor') {
      switch (currentView) {
        case 'dashboard': return <VendorDashboardView />
        case 'create-deal': return <VendorCreateDealView />
        case 'inventory': return <VendorInventoryView />
        case 'fulfillment': return <VendorFulfillmentView />
        case 'subscription': return <VendorSubscriptionView />
        case 'profile': return <FoodieProfileView />
        default: return <VendorDashboardView />
      }
    }

    // Admin views
    if (activeRole === 'admin') {
      switch (currentView) {
        case 'dashboard': return <AdminDashboardView />
        case 'vendors': return <AdminVendorsView />
        case 'users': return <AdminUsersView />
        case 'analytics': return <AdminAnalyticsView />
        case 'profile': return <FoodieProfileView />
        default: return <AdminDashboardView />
      }
    }

    return <FoodieHomeView />
  }

  const renderBottomNav = () => {
    // Don't show bottom nav on deal-detail view (has its own sticky action bar)
    if (currentView === 'deal-detail') return null
    switch (activeRole) {
      case 'foodie': return <FoodieBottomNav />
      case 'vendor': return <VendorBottomNav />
      case 'admin': return <AdminBottomNav />
      default: return <FoodieBottomNav />
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background max-w-lg mx-auto">
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeRole}-${currentView}`}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
      {renderBottomNav()}
    </div>
  )
}

// ============================================
// AUTH MODAL (Login/Register Dialog)
// ============================================
function AuthModal() {
  const { showAuthModal, setShowAuthModal } = useAppStore()
  const { login } = useAuthStore()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showAuthModal) {
      setEmail('')
      setPassword('')
      setName('')
      setPhone('')
    }
  }, [showAuthModal])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin
        ? { email, password }
        : { email, password, name, phone }

      const res = await apiFetch<AuthUser>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.success && res.data) {
        login(res.data)
        setShowAuthModal(false)
        toast.success(isLogin ? 'Welcome back!' : 'Account created!')
      } else {
        toast.error(res.error || 'Authentication failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
      <DialogContent className="rounded-2xl max-w-sm p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-[#66d99a]/20 to-[#00B14F]/10 px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[#1a1c1e]">
              {isLogin ? 'Welcome Back' : 'Join FlashBite'}
            </DialogTitle>
            <DialogDescription className="text-[#414841]">
              {isLogin ? 'Sign in to claim deals and track orders' : 'Create an account to start saving on food'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          {/* Toggle */}
          <div className="flex bg-[#e8edea] rounded-xl p-1 mb-5">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                isLogin ? 'bg-white text-[#00B14F] shadow-chip' : 'text-[#414841]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                !isLogin ? 'bg-white text-[#00B14F] shadow-chip' : 'text-[#414841]'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <Label htmlFor="modal-name" className="text-sm font-semibold text-[#1a1c1e]">Full Name</Label>
                <Input
                  id="modal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1 h-11 rounded-xl"
                  required={!isLogin}
                />
              </div>
            )}
            <div>
              <Label htmlFor="modal-email" className="text-sm font-semibold text-[#1a1c1e]">Email</Label>
              <Input
                id="modal-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 h-11 rounded-xl"
                required
              />
            </div>
            <div>
              <Label htmlFor="modal-password" className="text-sm font-semibold text-[#1a1c1e]">Password</Label>
              <Input
                id="modal-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 h-11 rounded-xl"
                required
                minLength={6}
              />
            </div>
            {!isLogin && (
              <div>
                <Label htmlFor="modal-phone" className="text-sm font-semibold text-[#1a1c1e]">Phone (optional)</Label>
                <Input
                  id="modal-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+60 12 345 6789"
                  className="mt-1 h-11 rounded-xl"
                />
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-base font-bold bg-gradient-to-b from-[#66d99a] to-[#00B14F] text-white hover:opacity-90 active:scale-95 transition-all"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          {/* Demo hint */}
          <div className="mt-4 p-3 bg-[#f0f4f2] rounded-xl text-center">
            <p className="text-xs text-[#414841]">
              🎯 Demo: <span className="font-semibold">foodie@test.com</span> / <span className="font-semibold">vendor@test.com</span> / <span className="font-semibold">admin@test.com</span>
            </p>
            <p className="text-xs text-[#717971] mt-0.5">Password: <span className="font-semibold">password123</span></p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// MAIN APP
// ============================================
export default function FlashBiteApp() {
  const { isAuthenticated, isLoading, login, setLoading } = useAuthStore()

  // Initialize socket connection
  useSocket()

  // Check auth on mount
  useEffect(() => {
    setLoading(true)
    apiFetch<AuthUser>('/api/auth/me').then((res) => {
      if (res.success && res.data) {
        login(res.data)
      }
    }).finally(() => setLoading(false))
  }, [login, setLoading])

  // Fetch notifications (only as fallback - socket.io handles real-time)
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchNotifications = async () => {
      const res = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications?unReadOnly=true')
      if (res.success && res.data) {
        const count = res.data.unreadCount ?? res.data.notifications?.length ?? 0
        useAppStore.getState().setUnreadCount(count)
      }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 120000) // Reduced from 60s to 120s - socket handles real-time
    return () => clearInterval(interval)
  }, [isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f0f4f2] to-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#66d99a] to-[#00B14F] mb-4 shadow-card">
            <Flame className="w-10 h-10 text-white" />
          </div>
          <p className="text-[#414841] text-sm">Loading FlashBite...</p>
        </motion.div>
      </div>
    )
  }

  // Always render ViewRouter (public access to homepage), with AuthModal for protected features
  return (
    <>
      <ViewRouter />
      <AuthModal />
    </>
  )
}
