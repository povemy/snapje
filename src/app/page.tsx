'use client'

import { useEffect, useState, useCallback } from 'react'
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
const pageVariants = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -8 },
}

const pageTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
  duration: 0.2,
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#eef4ff] to-white px-5">
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
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#89cff0] to-[#0d6683] mb-4 shadow-card"
          >
            <Flame className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-[#0d1c2d] tracking-tight">FlashBite</h1>
          <p className="text-[#40484d] mt-1 text-sm">Hyper-local food flash deals</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-[#e5efff] rounded-xl p-1 mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              isLogin ? 'bg-white text-[#0d6683] shadow-chip' : 'text-[#40484d]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              !isLogin ? 'bg-white text-[#0d6683] shadow-chip' : 'text-[#40484d]'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <Label htmlFor="name" className="text-sm font-semibold text-[#0d1c2d]">Full Name</Label>
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
            <Label htmlFor="email" className="text-sm font-semibold text-[#0d1c2d]">Email</Label>
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
            <Label htmlFor="password" className="text-sm font-semibold text-[#0d1c2d]">Password</Label>
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
              <Label htmlFor="phone" className="text-sm font-semibold text-[#0d1c2d]">Phone (optional)</Label>
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
            className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white hover:opacity-90 active:scale-95 transition-all shadow-card"
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
        <div className="mt-6 p-3 bg-[#eef4ff] rounded-xl text-center">
          <p className="text-xs text-[#40484d]">
            🎯 Demo: <span className="font-semibold">foodie@test.com</span> / <span className="font-semibold">vendor@test.com</span> / <span className="font-semibold">admin@test.com</span>
          </p>
          <p className="text-xs text-[#70787d] mt-0.5">Password: <span className="font-semibold">password123</span></p>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================
// COUNTDOWN TIMER COMPONENT
// ============================================
function CountdownTimer({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
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
      timeLeft === 'Expired' ? 'text-[#70787d]' : isUrgent ? 'text-[#FB923C] animate-pulse-urgent' : 'text-[#0d6683]'
    }`}>
      <Clock className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {timeLeft}
    </span>
  )
}

// ============================================
// DEAL CARD COMPONENT
// ============================================
function DealCard({ deal, onSelect }: { deal: Deal & { distance?: number; vendor?: { businessName: string; address: string; logoUrl: string | null } }; onSelect: () => void }) {
  const isLowStock = deal.availableQuantity <= 5 && deal.availableQuantity > 0
  const isSoldOut = deal.availableQuantity <= 0 || deal.status === 'sold_out'

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="cursor-pointer"
    >
      <Card className="overflow-hidden border-0 shadow-card hover:shadow-card-hover transition-shadow duration-200 rounded-2xl">
        {/* Image */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-[#dbe9ff] to-[#eef4ff] overflow-hidden">
          {deal.imageUrl ? (
            <img
              src={deal.imageUrl}
              alt={deal.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Utensils className="w-12 h-12 text-[#89cff0]" />
            </div>
          )}
          {/* Discount Badge */}
          <div className="absolute top-3 left-3">
            <Badge className="bg-gradient-to-r from-[#FB923C] to-[#F97316] text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow-chip border-0">
              -{deal.discountPercent}%
            </Badge>
          </div>
          {/* Distance */}
          {deal.distance !== undefined && (
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="bg-white/90 text-[#0d1c2d] text-xs px-2 py-1 rounded-lg shadow-chip">
                <MapPin className="w-3 h-3 mr-0.5" />
                {deal.distance.toFixed(1)}km
              </Badge>
            </div>
          )}
          {/* Stock overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-bold text-lg">SOLD OUT</span>
            </div>
          )}
        </div>
        {/* Info */}
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[#0d1c2d] text-base truncate">{deal.title}</h3>
              <p className="text-sm text-[#40484d] truncate mt-0.5">
                {deal.vendor?.businessName || 'Vendor'}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-extrabold text-[#0d6683]">RM{deal.dealPrice.toFixed(2)}</p>
              <p className="text-xs text-[#70787d] line-through">RM{deal.originalPrice.toFixed(2)}</p>
            </div>
          </div>
          {/* Bottom row */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#d4e4fa]">
            <CountdownTimer expiresAt={deal.expiresAt} compact />
            <div className={`text-xs font-bold ${isLowStock ? 'text-[#FB923C] animate-pulse-urgent' : isSoldOut ? 'text-[#70787d]' : 'text-[#34D399]'}`}>
              {isSoldOut ? 'Sold out' : isLowStock ? `🔥 Only ${deal.availableQuantity} left` : `${deal.availableQuantity} left`}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ============================================
// FOODIE: HOME VIEW
// ============================================
function FoodieHomeView() {
  const { navigate } = useAppStore()
  const { selectedCategory, setSelectedCategory, searchQuery, setSearchQuery } = useAppStore()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const categories = ['All', 'Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Vegan', 'Dessert', 'Beverage']

  const fetchDeals = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'active' })
    if (selectedCategory && selectedCategory !== 'All') params.set('category', selectedCategory)
    if (searchQuery) params.set('search', searchQuery)
    // Use default KL location
    params.set('lat', '3.1390')
    params.set('lng', '101.6869')
    params.set('maxDistance', '20')

    const res = await apiFetch<{ deals: Deal[]; total: number }>(`/api/deals?${params}`)
    if (res.success && res.data) {
      setDeals(res.data.deals)
    }
    setLoading(false)
  }, [selectedCategory, searchQuery])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[#d4e4fa] px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0d1c2d]">FlashBite</h1>
            <p className="text-sm text-[#40484d] flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#0d6683]" />
              Kuala Lumpur
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#70787d]" />
          <Input
            placeholder="Search deals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl text-sm"
          />
        </div>
        {/* Categories */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === 'All' ? null : cat)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                (cat === 'All' && !selectedCategory) || selectedCategory === cat
                  ? 'bg-[#0d6683] text-white'
                  : 'bg-[#e5efff] text-[#40484d] hover:bg-[#dbe9ff]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Deals Feed */}
      <div className="px-5 mt-4 space-y-4">
        {loading ? (
          // Skeleton loaders
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden border-0 shadow-card rounded-2xl">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </Card>
          ))
        ) : deals.length === 0 ? (
          <div className="text-center py-16">
            <Utensils className="w-16 h-16 text-[#bfc8cd] mx-auto mb-4" />
            <h3 className="text-lg font-bold text-[#0d1c2d]">No deals found</h3>
            <p className="text-sm text-[#40484d] mt-1">Check back soon for new flash deals!</p>
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onSelect={() => navigate('deal-detail', { id: deal.id })}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================
// FOODIE: DEAL DETAIL VIEW
// ============================================
function DealDetailView() {
  const { viewParams, goBack } = useAppStore()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const { user } = useAuthStore()

  useEffect(() => {
    if (!viewParams.id) return
    setLoading(true)
    apiFetch<Deal>(`/api/deals/${viewParams.id}`).then((res) => {
      if (res.success && res.data) setDeal(res.data)
    }).finally(() => setLoading(false))
  }, [viewParams.id])

  const handleClaim = async () => {
    if (!deal || !user) return
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
        <p className="text-[#40484d]">Deal not found</p>
      </div>
    )
  }

  const isSoldOut = deal.availableQuantity <= 0 || deal.status === 'sold_out'

  return (
    <div className="pb-28">
      {/* Back button */}
      <button onClick={goBack} className="fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-card">
        <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
      </button>

      {/* Hero Image */}
      <div className="relative aspect-[16/10] bg-gradient-to-br from-[#dbe9ff] to-[#eef4ff]">
        {deal.imageUrl ? (
          <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="w-20 h-20 text-[#89cff0]" />
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
        <h1 className="text-2xl font-extrabold text-[#0d1c2d]">{deal.title}</h1>
        <p className="text-[#40484d] mt-1 flex items-center gap-1.5">
          <Store className="w-4 h-4" />
          {deal.vendor?.businessName || 'Vendor'}
        </p>

        {/* Price */}
        <div className="flex items-end gap-3 mt-4">
          <span className="text-3xl font-extrabold text-[#0d6683]">RM{deal.dealPrice.toFixed(2)}</span>
          <span className="text-lg text-[#70787d] line-through mb-0.5">RM{deal.originalPrice.toFixed(2)}</span>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-[#eef4ff] rounded-xl p-3 text-center">
            <Clock className="w-5 h-5 text-[#0d6683] mx-auto mb-1" />
            <p className="text-xs text-[#40484d]">Ends in</p>
            <CountdownTimer expiresAt={deal.expiresAt} compact />
          </div>
          <div className="bg-[#eef4ff] rounded-xl p-3 text-center">
            <Flame className={`w-5 h-5 mx-auto mb-1 ${deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#0d6683]'}`} />
            <p className="text-xs text-[#40484d]">Stock</p>
            <p className={`text-sm font-bold ${deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#0d1c2d]'}`}>
              {deal.availableQuantity} left
            </p>
          </div>
          <div className="bg-[#eef4ff] rounded-xl p-3 text-center">
            <MapPin className="w-5 h-5 text-[#0d6683] mx-auto mb-1" />
            <p className="text-xs text-[#40484d]">Distance</p>
            <p className="text-sm font-bold text-[#0d1c2d]">
              {deal.distance ? `${deal.distance.toFixed(1)}km` : 'Nearby'}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <h3 className="font-bold text-[#0d1c2d] mb-2">About this deal</h3>
          <p className="text-sm text-[#40484d] leading-relaxed">{deal.description}</p>
        </div>

        {/* Pickup Info */}
        <div className="mt-5">
          <h3 className="font-bold text-[#0d1c2d] mb-2">Pickup Details</h3>
          <div className="bg-[#eef4ff] rounded-xl p-4">
            <p className="text-sm text-[#40484d] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0d6683]" />
              Pickup only
            </p>
            {deal.pickupInstructions && (
              <p className="text-sm text-[#40484d] mt-2">{deal.pickupInstructions}</p>
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
              Order #{order.orderNumber}. Check your Orders for the pickup QR code.
            </p>
          </motion.div>
        )}
      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#d4e4fa] px-5 py-3 z-40">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div>
            <p className="text-xs text-[#40484d]">Flash Deal Price</p>
            <p className="text-2xl font-extrabold text-[#0d6683]">RM{deal.dealPrice.toFixed(2)}</p>
          </div>
          <Button
            onClick={handleClaim}
            disabled={claiming || isSoldOut || claimed}
            className={`h-12 px-8 rounded-xl font-bold text-base transition-all active:scale-95 ${
              claimed
                ? 'bg-[#34D399] hover:bg-[#34D399] text-white'
                : isSoldOut
                ? 'bg-[#70787d] text-white cursor-not-allowed'
                : 'bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white hover:opacity-90'
            }`}
          >
            {claiming ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : claimed ? (
              <>
                <Check className="w-5 h-5 mr-1" /> Claimed
              </>
            ) : isSoldOut ? (
              'Sold Out'
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

  useEffect(() => {
    setLoading(true)
    apiFetch<{ orders: Order[] }>('/api/orders').then((res) => {
      if (res.success && res.data) setOrders(res.data.orders || [])
    }).finally(() => setLoading(false))
  }, [])

  const activeOrders = orders.filter(o => o.status === 'pending_pickup')
  const completedOrders = orders.filter(o => o.status === 'completed')

  return (
    <div className="pb-24 px-5">
      <h1 className="text-2xl font-extrabold text-[#0d1c2d] mb-4">My Orders</h1>

      {loading ? (
        Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="mb-3 border-0 shadow-card rounded-2xl">
            <CardContent className="p-4"><Skeleton className="h-16 w-full rounded-xl" /></CardContent>
          </Card>
        ))
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="w-16 h-16 text-[#bfc8cd] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#0d1c2d]">No orders yet</h3>
          <p className="text-sm text-[#40484d] mt-1">Claim your first flash deal!</p>
          <Button onClick={() => navigate('home')} className="mt-4 bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white rounded-xl">
            Browse Deals
          </Button>
        </div>
      ) : (
        <>
          {activeOrders.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-[#0d1c2d] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FB923C]" /> Active Orders
              </h2>
              <div className="space-y-3">
                {activeOrders.map((order) => (
                  <motion.div key={order.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
                    <Card className="border-0 shadow-card rounded-2xl overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-[#0d1c2d]">{order.deal?.title || 'Deal'}</p>
                            <p className="text-xs text-[#40484d] mt-0.5">#{order.orderNumber}</p>
                          </div>
                          <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg font-bold">
                            Pending Pickup
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#d4e4fa]">
                          <span className="text-lg font-extrabold text-[#0d6683]">RM{order.totalPrice.toFixed(2)}</span>
                          <span className="text-xs text-[#40484d] flex items-center gap-1">
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
              <h2 className="font-bold text-[#0d1c2d] mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#34D399]" /> Completed
              </h2>
              <div className="space-y-3">
                {completedOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-card rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-[#0d1c2d]">{order.deal?.title || 'Deal'}</p>
                          <p className="text-xs text-[#40484d] mt-0.5">#{order.orderNumber}</p>
                        </div>
                        <Badge className="bg-[#34D399]/10 text-[#059669] border-0 rounded-lg font-bold">
                          Completed
                        </Badge>
                      </div>
                      <p className="text-sm font-bold text-[#0d6683] mt-2">RM{order.totalPrice.toFixed(2)}</p>
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
              <div className="bg-[#eef4ff] rounded-2xl p-6 inline-block">
                <QrCode className="w-40 h-40 text-[#0d6683]" />
              </div>
              <p className="mt-4 font-bold text-[#0d1c2d]">Order #{selectedOrder.orderNumber}</p>
              <p className="text-sm text-[#40484d] mt-1">RM{selectedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs text-[#70787d] mt-2">
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
  const { user, updateActiveRole, logout } = useAuthStore()
  const { setActiveRole } = useAppStore()
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
    <div className="pb-24 px-5">
      <h1 className="text-2xl font-extrabold text-[#0d1c2d] mb-6">Profile</h1>

      {/* User Card */}
      <Card className="border-0 shadow-card rounded-2xl mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 border-2 border-[#89cff0]">
              <AvatarFallback className="bg-[#0d6683] text-white text-xl font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-bold text-[#0d1c2d] text-lg">{user?.name}</h2>
              <p className="text-sm text-[#40484d]">{user?.email}</p>
              <Badge className="mt-1 bg-[#0d6683]/10 text-[#0d6683] border-0 rounded-lg text-xs">
                {user?.activeRole === 'foodie' ? '🍽️ Foodie' : user?.activeRole === 'vendor' ? '🏪 Vendor' : '🛡️ Admin'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Switching */}
      <h3 className="font-bold text-[#0d1c2d] mb-3">Switch Mode</h3>
      <div className="space-y-2 mb-6">
        <button
          onClick={() => handleRoleSwitch('foodie')}
          disabled={!roles.includes('foodie')}
          className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${
            user?.activeRole === 'foodie' ? 'bg-[#0d6683] text-white shadow-card' : 'bg-[#eef4ff] text-[#0d1c2d]'
          } ${!roles.includes('foodie') ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Utensils className="w-5 h-5" />
          <div className="text-left">
            <p className="font-bold text-sm">Foodie Mode</p>
            <p className={`text-xs ${user?.activeRole === 'foodie' ? 'text-white/70' : 'text-[#40484d]'}`}>Discover & claim deals</p>
          </div>
          {user?.activeRole === 'foodie' && <Check className="w-5 h-5 ml-auto" />}
        </button>

        <button
          onClick={() => handleRoleSwitch('vendor')}
          disabled={!roles.includes('vendor')}
          className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${
            user?.activeRole === 'vendor' ? 'bg-[#0d6683] text-white shadow-card' : 'bg-[#eef4ff] text-[#0d1c2d]'
          } ${!roles.includes('vendor') ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Store className="w-5 h-5" />
          <div className="text-left">
            <p className="font-bold text-sm">Vendor Command Center</p>
            <p className={`text-xs ${user?.activeRole === 'vendor' ? 'text-white/70' : 'text-[#40484d]'}`}>Manage your deals</p>
          </div>
          {user?.activeRole === 'vendor' && <Check className="w-5 h-5 ml-auto" />}
        </button>

        <button
          onClick={() => handleRoleSwitch('admin')}
          disabled={!roles.includes('admin')}
          className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${
            user?.activeRole === 'admin' ? 'bg-[#0d6683] text-white shadow-card' : 'bg-[#eef4ff] text-[#0d1c2d]'
          } ${!roles.includes('admin') ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Shield className="w-5 h-5" />
          <div className="text-left">
            <p className="font-bold text-sm">Admin Control Center</p>
            <p className={`text-xs ${user?.activeRole === 'admin' ? 'text-white/70' : 'text-[#40484d]'}`}>Platform management</p>
          </div>
          {user?.activeRole === 'admin' && <Check className="w-5 h-5 ml-auto" />}
        </button>
      </div>

      {/* Become a Vendor */}
      {!roles.includes('vendor') && (
        <Card className="border-0 shadow-card rounded-2xl mb-6 bg-gradient-to-br from-[#89cff0]/20 to-[#0d6683]/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-5 h-5 text-[#0d6683]" />
              <h3 className="font-bold text-[#0d1c2d]">Become a Vendor</h3>
            </div>
            <p className="text-sm text-[#40484d] mb-3">Turn your unsold meals into revenue. Start selling on FlashBite today.</p>
            <Button className="bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white rounded-xl font-bold"
              onClick={() => navigate('home', {})}>
              Register Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-50 text-[#EF4444] hover:bg-red-100 transition-colors">
          <LogOut className="w-5 h-5" />
          <span className="font-bold text-sm">Sign Out</span>
        </button>
      </div>
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
    <div className="pb-24 px-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0d1c2d]">Dashboard</h1>
          <p className="text-sm text-[#40484d]">{vendor?.businessName || 'Your Store'}</p>
        </div>
        <NotificationBell />
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
                <DollarSign className="w-6 h-6 text-[#0d6683] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Revenue</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">RM{todayRevenue.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#FB923C] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{activeDeals.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#34D399] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Pending Pickup</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{pendingOrders.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 text-[#4e6073] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Total Sold</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{vendor?.totalSales || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <h3 className="font-bold text-[#0d1c2d] mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('create-deal')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#89cff0]/20 to-[#0d6683]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0d6683] flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#0d1c2d]">Create Deal</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('inventory')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#34D399]/20 to-[#059669]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#0d1c2d]">Inventory</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('fulfillment')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FB923C] flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#0d1c2d]">Fulfillment</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('subscription')}
              className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#cfe2f9]/40 to-[#4e6073]/10 rounded-2xl shadow-chip"
            >
              <div className="w-10 h-10 rounded-xl bg-[#4e6073] flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#0d1c2d]">Subscription</span>
            </motion.button>
          </div>

          {/* Active Deals List */}
          <h3 className="font-bold text-[#0d1c2d] mb-3">Your Active Deals</h3>
          {activeDeals.length === 0 ? (
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-6 text-center">
                <Flame className="w-10 h-10 text-[#bfc8cd] mx-auto mb-2" />
                <p className="text-sm text-[#40484d]">No active deals. Create one now!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeDeals.map((deal) => (
                <Card key={deal.id} className="border-0 shadow-card rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-[#0d1c2d]">{deal.title}</p>
                        <p className="text-xs text-[#40484d] mt-0.5">RM{deal.dealPrice.toFixed(2)} • {deal.availableQuantity} left</p>
                      </div>
                      <Badge className="bg-[#34D399]/10 text-[#059669] border-0 rounded-lg text-xs">Active</Badge>
                    </div>
                    <div className="mt-2">
                      <Progress value={(deal.soldQuantity / deal.totalQuantity) * 100} className="h-2" />
                      <p className="text-xs text-[#70787d] mt-1">{deal.soldQuantity}/{deal.totalQuantity} sold</p>
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Create Flash Deal</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              s <= step ? 'bg-[#0d6683] text-white' : 'bg-[#e5efff] text-[#70787d]'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 rounded ${s < step ? 'bg-[#0d6683]' : 'bg-[#e5efff]'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Food Info */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div>
            <Label className="font-semibold text-[#0d1c2d]">Food Name *</Label>
            <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="e.g. Nasi Lemak Bunga Telang" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#0d1c2d]">Description *</Label>
            <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Describe your meal..." className="mt-1.5 rounded-xl min-h-[100px]" />
          </div>
          <div>
            <Label className="font-semibold text-[#0d1c2d]">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
              <SelectTrigger className="h-12 rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Vegan', 'Dessert', 'Beverage', 'Other'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setStep(2)} className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white">
            Next: Pricing <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      )}

      {/* Step 2: Pricing & Inventory */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-semibold text-[#0d1c2d]">Original Price (RM) *</Label>
              <Input type="number" value={form.originalPrice} onChange={(e) => setForm({...form, originalPrice: e.target.value})} placeholder="15.00" className="mt-1.5 h-12 rounded-xl" />
            </div>
            <div>
              <Label className="font-semibold text-[#0d1c2d]">Deal Price (RM) *</Label>
              <Input type="number" value={form.dealPrice} onChange={(e) => setForm({...form, dealPrice: e.target.value})} placeholder="8.00" className="mt-1.5 h-12 rounded-xl" />
            </div>
          </div>
          {discountPercent > 0 && (
            <div className="bg-[#ecfdf5] rounded-xl p-3 text-center">
              <p className="text-sm text-[#059669] font-bold">🔥 {discountPercent}% Discount</p>
            </div>
          )}
          <div>
            <Label className="font-semibold text-[#0d1c2d]">Available Quantity *</Label>
            <Input type="number" value={form.totalQuantity} onChange={(e) => setForm({...form, totalQuantity: e.target.value})} placeholder="20" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#0d1c2d]">Deal Expires At *</Label>
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({...form, expiresAt: e.target.value})} className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)} variant="outline" className="flex-1 h-12 rounded-xl font-bold">Back</Button>
            <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white">
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
              <h3 className="font-bold text-lg text-[#0d1c2d]">{form.title || 'Untitled Deal'}</h3>
              <p className="text-sm text-[#40484d]">{form.description}</p>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#0d6683]/10 text-[#0d6683] border-0 rounded-lg">{form.category}</Badge>
                <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg">-{discountPercent}%</Badge>
              </div>
              <Separator className="bg-[#d4e4fa]" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#70787d]">Original</p>
                  <p className="font-bold text-[#0d1c2d] line-through">RM{form.originalPrice}</p>
                </div>
                <div>
                  <p className="text-[#70787d]">Deal Price</p>
                  <p className="font-bold text-[#0d6683] text-lg">RM{form.dealPrice}</p>
                </div>
                <div>
                  <p className="text-[#70787d]">Quantity</p>
                  <p className="font-bold text-[#0d1c2d]">{form.totalQuantity}</p>
                </div>
                <div>
                  <p className="text-[#70787d]">Pickup</p>
                  <p className="font-bold text-[#0d1c2d]">Only</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button onClick={() => setStep(2)} variant="outline" className="flex-1 h-12 rounded-xl font-bold">Back</Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white active:scale-95 transition-transform"
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Inventory</h1>
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-3" />)
      ) : deals.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-[#bfc8cd] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#0d1c2d]">No active inventory</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <Card key={deal.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-[#0d1c2d]">{deal.title}</p>
                    <p className="text-xs text-[#40484d]">RM{deal.dealPrice.toFixed(2)} per meal</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    deal.status === 'active' ? 'bg-[#34D399]/10 text-[#059669]' : 'bg-[#70787d]/10 text-[#70787d]'
                  }`}>
                    {deal.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#eef4ff] rounded-lg p-2">
                    <p className="text-[#70787d]">Total</p>
                    <p className="font-bold text-[#0d1c2d]">{deal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#FB923C]/10 rounded-lg p-2">
                    <p className="text-[#70787d]">Reserved</p>
                    <p className="font-bold text-[#FB923C]">{deal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#34D399]/10 rounded-lg p-2">
                    <p className="text-[#70787d]">Sold</p>
                    <p className="font-bold text-[#059669]">{deal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#0d6683]/10 rounded-lg p-2">
                    <p className="text-[#70787d]">Available</p>
                    <p className="font-bold text-[#0d6683]">{deal.availableQuantity}</p>
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Fulfillment</h1>
      </div>

      {/* QR Verify */}
      <Card className="border-0 shadow-card rounded-2xl mb-5">
        <CardContent className="p-5">
          <h3 className="font-bold text-[#0d1c2d] mb-3 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#0d6683]" /> Verify Pickup
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
              className="h-12 px-5 rounded-xl font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white"
            >
              {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending */}
      <h3 className="font-bold text-[#0d1c2d] mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#FB923C]" /> Pending Pickup ({pendingPickup.length})
      </h3>
      {pendingPickup.length === 0 ? (
        <p className="text-sm text-[#70787d] mb-6">No pending pickups</p>
      ) : (
        <div className="space-y-2 mb-6">
          {pendingPickup.map((order) => (
            <Card key={order.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-[#0d1c2d]">#{order.orderNumber}</p>
                  <p className="text-xs text-[#40484d]">RM{order.totalPrice.toFixed(2)} • Qty: {order.quantity}</p>
                </div>
                <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg text-xs">Pending</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed */}
      <h3 className="font-bold text-[#0d1c2d] mb-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#34D399]" /> Completed ({completed.length})
      </h3>
      {completed.length === 0 ? (
        <p className="text-sm text-[#70787d]">No completed orders yet</p>
      ) : (
        <div className="space-y-2">
          {completed.map((order) => (
            <Card key={order.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-[#0d1c2d]">#{order.orderNumber}</p>
                  <p className="text-xs text-[#40484d]">RM{order.totalPrice.toFixed(2)}</p>
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Subscription</h1>
      </div>

      {/* Current Plan */}
      {vendor && vendor.subscriptionPlan !== 'none' && (
        <Card className="border-0 shadow-card rounded-2xl mb-5 bg-gradient-to-br from-[#0d6683] to-[#005974]">
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
        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_basic' ? 'ring-2 ring-[#0d6683]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-[#0d1c2d]">Basic</h3>
                <p className="text-2xl font-extrabold text-[#0d6683]">RM99<span className="text-sm font-normal text-[#70787d]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_basic' && (
                <Badge className="bg-[#0d6683] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#40484d]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Unlimited flash deals</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Inventory management</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> QR fulfillment</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Basic statistics</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_basic' && (
              <Button onClick={() => handleActivate('vendor_basic')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#89cff0] to-[#0d6683] text-white">
                {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Choose Basic'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_premium' ? 'ring-2 ring-[#0d6683]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-[#0d1c2d]">Premium</h3>
                  <Sparkles className="w-4 h-4 text-[#FB923C]" />
                </div>
                <p className="text-2xl font-extrabold text-[#0d6683]">RM199<span className="text-sm font-normal text-[#70787d]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_premium' && (
                <Badge className="bg-[#0d6683] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#40484d]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Everything in Basic</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Advanced analytics</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Priority ranking</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#34D399]" /> Marketing tools</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#70787d]" /> Siren Push (coming)</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#70787d]" /> Auto-Drop (coming)</li>
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
    <div className="pb-24 px-5">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold text-[#0d1c2d]">Admin Dashboard</h1>
        <NotificationBell />
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
                <Users className="w-6 h-6 text-[#0d6683] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Total Users</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{(analytics?.overview?.totalUsers as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Store className="w-6 h-6 text-[#34D399] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Vendors</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{(analytics?.overview?.totalVendors as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#FB923C] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{(analytics?.dealsByStatus as Record<string, number>)?.active || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#4e6073] mx-auto mb-1" />
                <p className="text-xs text-[#40484d]">Total Orders</p>
                <p className="text-lg font-extrabold text-[#0d1c2d]">{(analytics?.overview?.totalOrders as number) || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Nav */}
          <div className="space-y-2">
            {[
              { icon: Store, label: 'Vendor Management', view: 'vendors' as AppView, color: 'text-[#34D399]' },
              { icon: Users, label: 'User Management', view: 'users' as AppView, color: 'text-[#0d6683]' },
              { icon: BarChart3, label: 'Analytics', view: 'analytics' as AppView, color: 'text-[#FB923C]' },
            ].map((item) => (
              <motion.button
                key={item.view}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(item.view)}
                className="w-full flex items-center gap-3 p-4 bg-white shadow-card rounded-2xl"
              >
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className="font-bold text-sm text-[#0d1c2d]">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-[#70787d] ml-auto" />
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff]">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Vendor Management</h1>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'pending', 'approved', 'rejected', 'suspended'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize flex-shrink-0 transition-all ${
              filter === f ? 'bg-[#0d6683] text-white' : 'bg-[#e5efff] text-[#40484d]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl mb-3" />)
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#70787d] text-center py-8">No vendors found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card key={v.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-[#0d1c2d]">{v.businessName}</p>
                    <p className="text-xs text-[#40484d]">{v.address}</p>
                    <p className="text-xs text-[#70787d] mt-1">{v.contactEmail}</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    v.verificationStatus === 'approved' ? 'bg-[#34D399]/10 text-[#059669]' :
                    v.verificationStatus === 'pending' ? 'bg-[#FB923C]/10 text-[#FB923C]' :
                    v.verificationStatus === 'rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                    'bg-[#70787d]/10 text-[#70787d]'
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
                  <Button size="sm" onClick={() => handleAction(v.id, 'restore')} className="mt-3 h-9 rounded-xl text-xs font-bold bg-[#0d6683] text-white">
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff]">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">User Management</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#70787d]" />
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
                  <AvatarFallback className="bg-[#0d6683] text-white text-sm font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[#0d1c2d] truncate">{u.name}</p>
                  <p className="text-xs text-[#40484d] truncate">{u.email}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {u.roles.map((r) => (
                    <Badge key={r} className="bg-[#e5efff] text-[#0d6683] border-0 rounded-md text-[10px] px-1.5">
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
    <div className="pb-24 px-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff]">
          <ArrowLeft className="w-5 h-5 text-[#0d1c2d]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#0d1c2d]">Analytics</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: 'Total Users', value: analytics?.overview?.totalUsers || 0, icon: Users, color: 'text-[#0d6683]' },
            { label: 'Total Vendors', value: analytics?.overview?.totalVendors || 0, icon: Store, color: 'text-[#34D399]' },
            { label: 'Active Deals', value: (analytics?.dealsByStatus as Record<string, number>)?.active || 0, icon: Flame, color: 'text-[#FB923C]' },
            { label: 'Total Orders', value: analytics?.overview?.totalOrders || 0, icon: ShoppingBag, color: 'text-[#4e6073]' },
            { label: 'Pending Vendors', value: (analytics?.dealsByStatus as Record<string, number>)?.pending || 0, icon: Clock, color: 'text-[#FB923C]' },
            { label: 'Meals Saved from Waste', value: analytics?.overview?.totalOrders || 0, icon: Heart, color: 'text-[#34D399]' },
          ].map((item) => (
            <Card key={item.label} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-[#eef4ff] flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-[#40484d]">{item.label}</p>
                  <p className="text-2xl font-extrabold text-[#0d1c2d]">{String(item.value)}</p>
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
function NotificationBell() {
  const { unreadCount } = useNotificationStore()
  const { navigate } = useAppStore()

  return (
    <button
      onClick={() => navigate('orders')}
      className="relative p-2 rounded-xl bg-[#eef4ff] hover:bg-[#dbe9ff] transition-colors"
    >
      <Bell className="w-5 h-5 text-[#0d6683]" />
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
}

// ============================================
// BOTTOM NAVIGATION - FOODIE
// ============================================
function FoodieBottomNav() {
  const { currentView, navigate } = useAppStore()

  const tabs = [
    { view: 'home' as AppView, icon: Home, label: 'Home' },
    { view: 'explore' as AppView, icon: Compass, label: 'Explore' },
    { view: 'orders' as AppView, icon: ShoppingBag, label: 'Orders' },
    { view: 'profile' as AppView, icon: User, label: 'Profile' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#d4e4fa] z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view || (tab.view === 'home' && currentView === 'deal-detail')
          return (
            <button
              key={tab.view}
              onClick={() => navigate(tab.view)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all min-w-[64px] ${
                isActive ? 'text-[#0d6683]' : 'text-[#70787d]'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? 'text-[#0d6683]' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] font-bold ${isActive ? 'text-[#0d6683]' : ''}`}>{tab.label}</span>
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
    { view: 'subscription' as AppView, icon: CreditCard, label: 'Plan' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#d4e4fa] z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view
          return (
            <button
              key={tab.view}
              onClick={() => navigate(tab.view)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[56px] ${
                isActive ? 'text-[#0d6683]' : 'text-[#70787d]'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? 'text-[#0d6683]' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] font-bold ${isActive ? 'text-[#0d6683]' : ''}`}>{tab.label}</span>
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
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#d4e4fa] z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = currentView === tab.view
          return (
            <button
              key={tab.view}
              onClick={() => navigate(tab.view)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all min-w-[64px] ${
                isActive ? 'text-[#0d6683]' : 'text-[#70787d]'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? 'text-[#0d6683]' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] font-bold ${isActive ? 'text-[#0d6683]' : ''}`}>{tab.label}</span>
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
        default: return <AdminDashboardView />
      }
    }

    return <FoodieHomeView />
  }

  const renderBottomNav = () => {
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

  // Fetch notifications
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchNotifications = () => {
      apiFetch<AppNotification[]>('/api/notifications?unreadOnly=true').then(() => {
        // Handled by socket mainly
      })
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#eef4ff] to-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#89cff0] to-[#0d6683] mb-4 shadow-card">
            <Flame className="w-10 h-10 text-white" />
          </div>
          <p className="text-[#40484d] text-sm">Loading FlashBite...</p>
        </motion.div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  return <ViewRouter />
}
