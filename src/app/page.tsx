'use client'

import { useEffect, useState, useCallback, memo, useRef } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useSocket } from '@/hooks/use-socket'
import type { AuthUser, AppRole, AppView, Deal, Order, Vendor, AppNotification } from '@/types'
import { AnimatePresence, motion } from 'framer-motion'

// Dynamically import the QRScanner (SSR-safe — html5-qrcode requires window/camera)
const QRScanner = dynamic(() => import('@/components/QRScanner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-10 rounded-xl bg-[#f0f4f2] flex items-center justify-center text-xs text-[#717971]">
      Loading scanner…
    </div>
  ),
})
import {
  Home, Compass, ShoppingBag, User, ChefHat, LayoutDashboard,
  PlusCircle, Package, CheckCircle, CreditCard, Shield, Users,
  BarChart3, MapPin, Bell, Search, ArrowLeft, Menu, X,
  Star, Clock, Flame, TrendingUp, Store, Settings, LogOut,
  ChevronRight, Heart, Filter, Zap, QrCode, Eye, Check,
  AlertTriangle, AlertCircle, Ban, RefreshCw, DollarSign, ShoppingCart,
  Utensils, Bike, Building2, Crown, Sparkles, MoreVertical,
  Pencil, Trash2, Timer, Save, ScanLine, Camera, XCircle,
  Lock, Globe, Volume2, BellRing, KeyRound, Smartphone,
  Moon, Wallet, Megaphone, EyeOff,
  Plus, Minus, Navigation, Route, Footprints,
  Image as ImageIcon, HardDrive, FileImage, AlertOctagon,
  LocateFixed, Crosshair
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
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LocationPicker } from '@/components/map/LocationPicker'
import MapView from '@/components/map/MapView'
import { GeolocationGate } from '@/components/map/GeolocationGate'
import { useGeolocation } from '@/hooks/use-geolocation'
import {
  haversineDistance,
  formatDistance,
  walkingTimeMinutes,
  drivingTimeMinutes,
  DEFAULT_LOCATION,
} from '@/lib/distance'
import { parseDbDate, toDatetimeLocalString } from '@/lib/utils'
import { toast } from 'sonner'

// ============================================
// API Helper (Bearer-token auth with transparent refresh on 401)
// ============================================
// Auth uses Bearer tokens stored in localStorage (via the auth store) as the
// PRIMARY mechanism, because cookies are unreliable in preview iframes
// (third-party cookie blocking). The server's getAuthUser() checks the
// Authorization header first, then falls back to cookies.
//
// CRITICAL FIX (tokens in localStorage): only the short-lived accessToken
// (15 min) is kept in localStorage. The refresh token lives ONLY in the
// httpOnly cookie, so refresh requests use `credentials: 'include'` and let
// the browser attach the cookie automatically. This prevents refresh-token
// theft via XSS.
//
// Flow: every request gets `Authorization: Bearer <accessToken>`. On 401 we
// call /api/auth/refresh (sending credentials so the cookie is attached),
// store the new accessToken, and retry once. Concurrent 401s share a single refresh.
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      // CRITICAL FIX: do NOT send a refresh token in the body — it's in the
      // httpOnly cookie. `credentials: 'include'` ensures the cookie is sent.
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) return false
      const json = await res.json()
      if (json.success && json.tokens && json.tokens.accessToken) {
        useAuthStore.getState().setTokens({ accessToken: json.tokens.accessToken })
        return true
      }
      return false
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string; tokens?: { accessToken?: string } }> {
  const buildHeaders = (opts?: RequestInit) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts?.headers as Record<string, string> | undefined),
    }
    // Attach Bearer token from the auth store (localStorage-backed)
    const { accessToken } = useAuthStore.getState()
    if (accessToken && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    return headers
  }

  try {
    // CRITICAL FIX: always include credentials so the httpOnly refresh_token
    // cookie is available to the server on 401 → /api/auth/refresh flows.
    let res = await fetch(path, { ...options, headers: buildHeaders(options), credentials: 'include' })

    // If the access token has expired, transparently refresh + retry once.
    // Skip this for the refresh/logout endpoints themselves to avoid loops.
    if (
      res.status === 401 &&
      !path.includes('/api/auth/refresh') &&
      !path.includes('/api/auth/logout')
    ) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        // Retry the original request with the fresh Bearer token
        res = await fetch(path, { ...options, headers: buildHeaders(options), credentials: 'include' })
      } else {
        return { success: false, error: 'Session expired. Please sign in again.' }
      }
    }

    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { success: res.ok, error: res.ok ? undefined : 'Request failed' }
    }
  } catch {
    return { success: false, error: 'Network error' }
  }
}

// ============================================
// Notification polling reconciliation state (module-level)
// ============================================
// These three module-level values solve two related bugs in the notification
// polling logic:
//
// 1) "Badge comes back after closing the modal" — when the user clicks a
//    notification, NotificationBell optimistically calls markAsRead(id) which
//    decrements the local unreadCount by 1. But the server-side PUT takes
//    ~50-300ms to complete. If the 5-second polling fires DURING that window,
//    the server still returns the OLD (higher) unread count, which would
//    overwrite the optimistic decrement and make the badge re-appear.
//    FIX: `pendingReadsCount` tracks how many mark-as-read calls are in
//    flight. The polling subtracts this from the server count before calling
//    setUnreadCount, so the local badge stays at the optimistic value until
//    the server catches up.
//
// 2) "Toasts re-fire on every re-mount" — the old `lastSeenCount` closure
//    variable reset to 0 whenever the polling useEffect re-ran (e.g. on auth
//    state changes), causing EVERY existing unread notification to fire a
//    social-proof toast again on remount.
//    FIX: `shownToastNotifIds` is a module-level Set that dedupes toasts by
//    notification ID. A given notification ID will only ever fire one toast
//    per page session, no matter how many times the polling effect re-runs.
let pendingReadsCount = 0
const shownToastNotifIds = new Set<string>()

/** Called by NotificationBell when the user clicks an unread notification.
 *  Increments the pending-read counter so the polling knows to subtract it
 *  from the server's unread count. Decrements when the API call settles. */
function trackPendingRead(apiPromise: Promise<unknown>) {
  pendingReadsCount++
  apiPromise.finally(() => {
    pendingReadsCount = Math.max(0, pendingReadsCount - 1)
  })
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
  const [role, setRole] = useState<'foodie' | 'vendor'>('foodie')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin
        ? { email, password }
        : { email, password, name, phone, role }

      const res = await apiFetch<AuthUser>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.success && res.data) {
        login(res.data, res.tokens)
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
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#EF5350] to-[#E53935] mb-4 shadow-card"
          >
            <Flame className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-[#1a1c1e] tracking-tight">SnapJe</h1>
          <p className="text-[#414841] mt-1 text-sm">Hyper-local food flash deals</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-[#e8edea] rounded-xl p-1 mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              isLogin ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              !isLogin ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
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
          {!isLogin && (
            <div>
              <Label className="text-sm font-semibold text-[#1a1c1e] mb-2 block">I want to...</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('foodie')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    role === 'foodie'
                      ? 'border-[#E53935] bg-[#E53935]/10 shadow-chip'
                      : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                  }`}
                >
                  <Utensils className={`w-6 h-6 ${role === 'foodie' ? 'text-[#E53935]' : 'text-[#717971]'}`} />
                  <span className={`text-sm font-bold ${role === 'foodie' ? 'text-[#E53935]' : 'text-[#414841]'}`}>
                    Find Deals
                  </span>
                  <span className="text-[10px] text-[#717971]">Browse & claim food</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('vendor')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    role === 'vendor'
                      ? 'border-[#E53935] bg-[#E53935]/10 shadow-chip'
                      : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                  }`}
                >
                  <Store className={`w-6 h-6 ${role === 'vendor' ? 'text-[#E53935]' : 'text-[#717971]'}`} />
                  <span className={`text-sm font-bold ${role === 'vendor' ? 'text-[#E53935]' : 'text-[#414841]'}`}>
                    Sell Food
                  </span>
                  <span className="text-[10px] text-[#717971]">Post flash deals</span>
                </button>
              </div>
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white hover:opacity-90 active:scale-95 transition-all shadow-card"
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
      const diff = parseDbDate(expiresAt).getTime() - Date.now()
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
      timeLeft === 'Expired' ? 'text-[#717971]' : isUrgent ? 'text-[#E53935] animate-pulse-urgent' : 'text-[#E53935]'
    }`}>
      <Clock className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {timeLeft}
    </span>
  )
})

// ============================================
// DEAL CARD COMPONENT - Foodpanda Style
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
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#E53935] text-white text-[10px] font-bold shadow-sm">
              Promo
            </span>
          </div>
          
          {/* Discount % Badge - Below Promo */}
          <div className="absolute top-7 left-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#E53935] text-white text-[9px] font-bold">
              -{deal.discountPercent}%
            </span>
          </div>
          
          {/* Distance - Top Right */}
          {deal.distance !== undefined && (
            <div className="absolute top-1.5 right-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/90 text-[#1a1c1e] text-[10px] font-medium shadow-sm">
                <MapPin className="w-2.5 h-2.5 text-[#E53935]" />
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
            <span className={`font-black text-[#E53935] ${isHalfWidth ? 'text-sm' : 'text-lg'}`}>
              RM{deal.dealPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-[#717971] line-through">
              RM{deal.originalPrice.toFixed(2)}
            </span>
          </div>
          
          {/* Stock indicator */}
          <div className={`text-[10px] font-bold mt-1 ${isLowStock ? 'text-[#E53935]' : isSoldOut ? 'text-[#717971]' : 'text-[#E53935]'}`}>
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
    let interval: ReturnType<typeof setInterval> | null = null
    const update = () => {
      const diff = parseDbDate(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Expired')
        // LOW 9: once the deadline has passed, stop firing setInterval — the
        // value will never change again, so continuing to tick every second is
        // pure CPU/battery waste (especially on mobile).
        if (interval) {
          clearInterval(interval)
          interval = null
        }
        return
      }
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      if (hours > 0) setTimeLeft(`${hours}h ${mins}m`)
      else if (mins > 0) setTimeLeft(`${mins}m ${secs}s`)
      else setTimeLeft(`${secs}s`)
    }
    update()
    interval = setInterval(update, 1000)
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [expiresAt])

  const isUrgent = timeLeft !== 'Expired' && !timeLeft.includes('h')

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm ${
      timeLeft === 'Expired' 
        ? 'bg-black/40 text-white/70' 
        : isUrgent 
        ? 'bg-[#E53935]/90 text-white animate-pulse-urgent' 
        : 'bg-black/40 text-white/90'
    }`}>
      <Clock className="w-2.5 h-2.5" />
      {timeLeft}
    </span>
  )
})

// ============================================
// QR CODE IMAGE COMPONENT (generates real QR from qrCode string)
// ============================================
function QRCodeImage({ qrCode }: { qrCode: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      QRCode.toDataURL(qrCode, {
        width: 220,
        margin: 2,
        color: { dark: '#1a1c1e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).then((url: string) => {
        if (!cancelled) setSrc(url)
      }).catch(() => {
        if (!cancelled) setError(true)
      })
    }).catch(() => {
      if (!cancelled) setError(true)
    })
    return () => { cancelled = true }
  }, [qrCode])

  if (error || !src) {
    return (
      <div className="w-[220px] h-[220px] flex items-center justify-center bg-[#f0f4f2] rounded-xl">
        <QrCode className="w-20 h-20 text-[#E53935]" />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt="QR Code for order pickup"
      width={220}
      height={220}
      className="rounded-lg"
      unoptimized
    />
  )
}

// ============================================
// IMAGE UPLOADER COMPONENT
// High-tech drag-and-drop + camera upload with auto-resize
// ============================================
interface ImageUploaderProps {
  /** Which preset group to use for auto-sizing */
  group: 'profile' | 'vendor_logo' | 'vendor_banner' | 'deal' | 'notification'
  /** Current image URL (for preview) */
  currentUrl?: string | null
  /** Called with the new URL after successful upload */
  onUploadComplete: (url: string, urls: Record<string, string>) => void
  /** Optional label */
  label?: string
  /** Optional size hint */
  sizeHint?: string
  /** Circle crop for avatars */
  circular?: boolean
  /** Compact mode (no label, smaller) */
  compact?: boolean
}

function ImageUploader({
  group,
  currentUrl,
  onUploadComplete,
  label,
  sizeHint,
  circular = false,
  compact = false,
}: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const { validateImageFile } = await import('@/lib/image-utils')
    const validation = validateImageFile(file)
    if (!validation.valid) {
      setFileError(validation.error ?? 'Invalid file')
      return
    }
    setFileError(null)

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    setProgress(0)

    try {
      const { quickUpload } = await import('@/lib/image-utils')
      const { uploadImageVariants } = await import('@/lib/image-utils')
      const result = await uploadImageVariants(file, group, {
        onProgress: setProgress,
      })

      // Get the primary URL for this group
      const primaryKey: Record<string, string> = {
        profile: 'avatar',
        vendor_logo: 'logo',
        vendor_banner: 'banner',
        deal: 'medium',
        notification: 'notif',
      }
      const primaryUrl = result.urls[primaryKey[group]] || result.originalUrl
      onUploadComplete(primaryUrl, result.urls)
      toast.success('Image uploaded!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setPreview(null)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const displayUrl = preview || currentUrl

  if (compact) {
    return (
      <div>
        {fileError && (
          <p className="text-xs text-[#EF4444] font-medium mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {fileError}
          </p>
        )}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`relative cursor-pointer group ${circular ? 'rounded-full' : 'rounded-xl'} overflow-hidden ${dragging ? 'ring-2 ring-[#E53935]' : ''}`}
        >
          {displayUrl ? (
          <div className={`relative ${circular ? 'w-20 h-20' : 'w-24 h-16'}`}>
            <Image src={displayUrl} alt="Upload" fill className={`${circular ? 'rounded-full' : 'rounded-xl'} object-cover`} unoptimized />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              {uploading ? (
                <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
        ) : (
          <div className={`${circular ? 'w-20 h-20' : 'w-24 h-16'} flex items-center justify-center bg-[#f0f4f2] ${circular ? 'rounded-full' : 'rounded-xl'} border-2 border-dashed border-[#c1c9c0]`}>
            {uploading ? (
              <div className="w-6 h-6 rounded-full border-2 border-[#E53935] border-t-transparent animate-spin" />
            ) : (
              <PlusCircle className="w-5 h-5 text-[#717971]" />
            )}
          </div>
        )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-[11px] font-bold text-[#414841]">{label}</Label>}
      {fileError && (
        <p className="text-xs text-[#EF4444] font-medium mb-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {fileError}
        </p>
      )}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative cursor-pointer group border-2 border-dashed rounded-xl transition-all ${
          dragging ? 'border-[#E53935] bg-[#E53935]/5' : 'border-[#d7ddd9] bg-[#f8faf9] hover:border-[#EF5350]'
        } ${displayUrl ? 'p-0 overflow-hidden' : 'p-6'}`}
      >
        {displayUrl ? (
          <div className="relative">
            <div className={`${circular ? 'w-24 h-24 mx-auto rounded-full' : 'w-full h-40'} overflow-hidden`}>
              <Image src={displayUrl} alt="Preview" fill className={`${circular ? 'rounded-full' : ''} object-cover`} unoptimized />
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2">
              {uploading ? (
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin mb-2" />
                  <span className="text-white text-xs font-bold">{progress}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                  <span className="text-white text-sm font-bold">Change Photo</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center">
            {uploading ? (
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full border-3 border-[#E53935] border-t-transparent animate-spin mb-2" />
                <p className="text-xs text-[#717971]">Uploading... {progress}%</p>
                <Progress value={progress} className="w-32 h-1.5 mt-2" />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[#E53935]/10 flex items-center justify-center mx-auto mb-2">
                  <Camera className="w-6 h-6 text-[#E53935]" />
                </div>
                <p className="text-sm font-bold text-[#1a1c1e]">
                  {dragging ? 'Drop image here' : 'Tap to upload'}
                </p>
                <p className="text-[11px] text-[#717971] mt-0.5">
                  Drag & drop or tap to browse
                </p>
                {sizeHint && (
                  <p className="text-[10px] text-[#717971] mt-1">{sizeHint}</p>
                )}
              </>
            )}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
      </div>
      {uploading && !displayUrl && (
        <Progress value={progress} className="h-1.5" />
      )}
    </div>
  )
}

// ============================================
// CATEGORY ICON GRID - Foodpanda Style
// ============================================
const CATEGORY_ICONS = [
  { key: 'All', label: 'Flash Deals', icon: Zap, color: '#E53935', bg: '#E8F4FD' },
  { key: 'Malay', label: 'Malay', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
  { key: 'Chinese', label: 'Chinese', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
  { key: 'Indian', label: 'Indian', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
  { key: 'Western', label: 'Western', icon: Utensils, color: '#3498db', bg: '#e8f4fd' },
  { key: 'Japanese', label: 'Japanese', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
  { key: 'Korean', label: 'Korean', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
  { key: 'Dessert', label: 'Dessert', icon: Utensils, color: '#E53935', bg: '#FFEBEE' },
]

// ============================================
// FOODIE: HOME VIEW - Foodpanda Style
// ============================================
function FoodieHomeView() {
  const { navigate, setShowAuthModal } = useAppStore()
  const { selectedCategory, setSelectedCategory, searchQuery, setSearchQuery } = useAppStore()
  const { isAuthenticated } = useAuthStore()
  const geo = useGeolocation()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  // ISSUE 2 (fix-logout-theme-nearme): "Near me" filter toggle. When true,
  // fetchDeals sends lat/lng/maxDistance to the API so only deals within the
  // user's deal-alert radius are returned. When false (default), all active
  // deals are returned (no distance filtering).
  const [radiusEnabled, setRadiusEnabled] = useState(false)
  // Used to trigger a re-fetch after geo.request() resolves with a fix.
  const [geoNonce, setGeoNonce] = useState(0)

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Helper: read the deal-alert radius from the persisted settings in
  // localStorage. Mirrors the key used by FoodieProfileView
  // (`snapje_settings.dealAlertRadius`). Defaults to 5 km.
  const readDealAlertRadius = useCallback((): number => {
    if (typeof window === 'undefined') return 5
    try {
      const raw = window.localStorage.getItem('snapje_settings')
      if (!raw) return 5
      const parsed = JSON.parse(raw)
      const n = Number(parsed?.dealAlertRadius)
      return Number.isFinite(n) && n > 0 ? n : 5
    } catch {
      return 5
    }
  }, [])

  const fetchDeals = useCallback(async (signal?: AbortSignal, opts?: { withRadius?: boolean }) => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'active' })
    if (selectedCategory && selectedCategory !== 'All') params.set('category', selectedCategory)
    if (debouncedSearch) params.set('search', debouncedSearch)

    // ISSUE 2: only send lat/lng/maxDistance when "Near me" is active AND we
    // have a real geolocation fix. When omitted, the API returns ALL active
    // deals (no distance filter) — see the original comment below.
    const useRadius = opts?.withRadius ?? radiusEnabled
    if (useRadius && geo.location) {
      params.set('lat', geo.location.latitude.toString())
      params.set('lng', geo.location.longitude.toString())
      params.set('maxDistance', readDealAlertRadius().toString())
    }
    // NOTE: When no location is sent, the API returns ALL active deals (no
    // distance filtering) — sorted by distance from DEFAULT_LOCATION (KL)
    // for display only. This ensures newly created deals from ANY vendor
    // appear immediately, regardless of how far they are. Distance is still
    // calculated and shown on each deal card.

    let res
    try {
      res = await apiFetch<{ deals: Deal[]; total: number }>(`/api/deals?${params}`)
    } catch (err) {
      // ISSUE 4: never let an API throw crash the dashboard — bail out
      // gracefully and let the caller show the empty state.
      console.error('[FoodieHomeView] fetchDeals failed:', err)
      if (!signal?.aborted) {
        setDeals([])
        setLoading(false)
      }
      return
    }
    // HIGH 8: bail out if the effect was cancelled (e.g. user navigated away
    // or changed the search category) before this response arrived. Prevents
    // a stale response from overwriting fresher state.
    if (signal?.aborted) return
    if (res.success && res.data) {
      const fetched = res.data.deals || []
      // ISSUE 2: if "Near me" is on but the filter returned zero deals, fall
      // back to fetching ALL deals so the home screen isn't empty. Surface a
      // toast so the user understands why they're seeing distant deals.
      if (useRadius && fetched.length === 0 && geo.location) {
        const radius = readDealAlertRadius()
        toast.info(`No deals within ${radius} km — showing all deals`)
        // Re-fetch without the radius filter (one-shot; don't toggle off the
        // user's preference, just override this fetch).
        const fallbackParams = new URLSearchParams({ status: 'active' })
        if (selectedCategory && selectedCategory !== 'All') fallbackParams.set('category', selectedCategory)
        if (debouncedSearch) fallbackParams.set('search', debouncedSearch)
        try {
          const fb = await apiFetch<{ deals: Deal[]; total: number }>(`/api/deals?${fallbackParams}`)
          if (!signal?.aborted && fb.success && fb.data) {
            setDeals(fb.data.deals || [])
          }
        } catch (err2) {
          console.error('[FoodieHomeView] fallback fetchDeals failed:', err2)
        }
      } else {
        setDeals(fetched)
      }
    } else if (!res.success) {
      // ISSUE 4: surface API errors as a toast instead of silently leaving
      // the user staring at a loading spinner.
      toast.error(res.error || 'Failed to load deals')
      setDeals([])
    }
    if (!signal?.aborted) setLoading(false)
  }, [selectedCategory, debouncedSearch, radiusEnabled, geo.location, readDealAlertRadius])

  useEffect(() => {
    // HIGH 8: AbortController + cancelled flag pattern. If the user changes
    // the category or search query while a previous request is still in
    // flight, we abort the stale request and ignore its result.
    const controller = new AbortController()
    fetchDeals(controller.signal)
    return () => controller.abort()
  }, [fetchDeals])

  // ISSUE 2: when geoNonce changes (i.e. the user just granted location via
  // the "Near me" button), re-fetch with the radius filter active.
  useEffect(() => {
    if (geoNonce === 0) return
    const controller = new AbortController()
    fetchDeals(controller.signal, { withRadius: true })
    return () => controller.abort()
  }, [geoNonce, fetchDeals])

  // ISSUE 2: "Near me" button handler. Requests geolocation, then flips on
  // the radius filter and bumps geoNonce to trigger a re-fetch.
  const handleNearMe = useCallback(() => {
    if (geo.loading) return
    if (geo.location) {
      // Already have a fix — just toggle the filter on and re-fetch.
      setRadiusEnabled(true)
      setGeoNonce(n => n + 1)
      toast.success(`Showing deals near you (within ${readDealAlertRadius()} km)`)
      return
    }
    // No fix yet — ask the browser for one.
    toast.info('Getting your location…')
    geo.request()
    // Watch for the location to come in. Because useGeolocation doesn't
    // expose a promise, we poll the cached location in localStorage.
    const startedAt = Date.now()
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt
      // Bail after 12s — the geolocation request likely failed/timed out.
      if (elapsed > 12000) {
        clearInterval(checkInterval)
        if (geo.error) {
          toast.error(geo.error || 'Unable to get your location')
        }
        return
      }
      try {
        const raw = window.localStorage.getItem('snapje-user-location')
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number') {
          clearInterval(checkInterval)
          setRadiusEnabled(true)
          setGeoNonce(n => n + 1)
          toast.success(`Showing deals near you (within ${readDealAlertRadius()} km)`)
        }
      } catch {
        // ignore — keep polling
      }
    }, 300)
  }, [geo, readDealAlertRadius])

  // Assign card sizes for visual variety
  const getCardSize = (index: number): CardSize => {
    if (index === 0) return 'featured'     // First: hero card
    if (index % 5 === 0) return 'large'    // Every 5th: full-width
    return 'medium'                         // Default: 2-column
  }

  return (
    <div className="pb-28 bg-[#F4F7F6]">
      {/* ===== Sticky Header - Foodpanda Style ===== */}
      <div 
        className="sticky top-0 z-30 bg-white" 
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 8px))' }}
      >
        {/* Delivery Address Bar */}
        <div className="px-4 pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#E53935] flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[#717971] font-medium leading-tight">Deliver to</p>
                <p className="text-xs font-bold text-[#1a1c1e] truncate leading-tight">
                  Kuala Lumpur, Malaysia
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#717971] flex-shrink-0" />
            </div>
            <div className="flex items-center gap-2 ml-2">
              {isAuthenticated ? (
                <NotificationBell />
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="h-8 px-4 rounded-full text-xs font-bold bg-[#E53935] text-white hover:bg-[#C62828] active:scale-95 transition-all"
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
              className="pl-10 h-10 rounded-full text-sm bg-[#F4F7F6] border-0 focus:bg-white focus:border-[#E53935]"
            />
          </div>
        </div>

        {/* ===== Category Pills — single-line horizontal scroll with chevrons ===== */}
        <div className="px-2 py-1.5 border-t border-[#e8edea]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const el = document.getElementById('category-scroll')
                el?.scrollBy({ left: -200, behavior: 'smooth' })
              }}
              className="w-7 h-7 rounded-full bg-[#f0f4f2] flex items-center justify-center flex-shrink-0 hover:bg-[#e8edea] transition-colors active:scale-90"
              aria-label="Scroll categories left"
            >
              <ChevronRight className="w-4 h-4 text-[#717971] rotate-180" />
            </button>
            <div
              id="category-scroll"
              className="flex-1 flex gap-1.5 overflow-x-auto scroll-smooth snap-x"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
            >
              {/* Task 3: "Near" pill — moved from the top header into the
                  category bar so it sits next to "Flash Deals" as a filter.
                  Toggles distance-based filtering using the user's deal-alert
                  radius (default 5km, configurable in Settings). */}
              <button
                onClick={handleNearMe}
                disabled={geo.loading}
                aria-pressed={radiusEnabled}
                title={radiusEnabled ? `Showing deals within ${readDealAlertRadius()} km` : 'Show deals near me'}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full flex-shrink-0 snap-start transition-all duration-150 active:scale-95 ${
                  radiusEnabled ? 'bg-[#E53935] text-white' : 'bg-[#f0f4f2] text-[#1a1c1e]'
                }`}
              >
                {geo.loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : radiusEnabled ? (
                  <LocateFixed className="w-3.5 h-3.5" />
                ) : (
                  <Crosshair className="w-3.5 h-3.5" style={{ color: radiusEnabled ? '#fff' : '#E53935' }} />
                )}
                <span className="text-[10px] font-bold leading-none">Near</span>
              </button>
              {CATEGORY_ICONS.map((cat) => {
                const isActive = selectedCategory === cat.key || (cat.key === 'All' && !selectedCategory)
                const Icon = cat.icon
                return (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key === 'All' ? null : cat.key)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full flex-shrink-0 snap-start transition-all duration-150 active:scale-95 ${
                      isActive ? 'bg-[#E53935] text-white' : 'bg-[#f0f4f2] text-[#1a1c1e]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" style={isActive ? { color: '#fff' } : { color: cat.color }} />
                    <span className="text-[10px] font-bold leading-none">{cat.label}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => {
                const el = document.getElementById('category-scroll')
                el?.scrollBy({ left: 200, behavior: 'smooth' })
              }}
              className="w-7 h-7 rounded-full bg-[#f0f4f2] flex items-center justify-center flex-shrink-0 hover:bg-[#e8edea] transition-colors active:scale-90"
              aria-label="Scroll categories right"
            >
              <ChevronRight className="w-4 h-4 text-[#717971]" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Flash Deals Section Header ===== */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-[#E53935]" />
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
  const [quantity, setQuantity] = useState(1)
  // Task 2: foodie-selected pickup time (ISO string). Populated from the
  // dropdown below the quantity selector. The dropdown shows 5-minute
  // interval slots starting from now + 10 minutes up to the deal's expiry.
  const [pickupTime, setPickupTime] = useState<string>('')
  const [pickupSlots, setPickupSlots] = useState<string[]>([])
  const [pickupOpen, setPickupOpen] = useState(false)
  const { user, isAuthenticated } = useAuthStore()
  const { location, request: requestLocation } = useGeolocation()
  const [distance, setDistance] = useState<number | null>(null)
  const [walkTime, setWalkTime] = useState<number | null>(null)
  const [driveTime, setDriveTime] = useState<number | null>(null)

  // Fetch deal
  useEffect(() => {
    if (!viewParams.id) return
    // HIGH 8: cancelled flag prevents stale responses from overwriting the
    // deal when the user navigates between deals quickly (e.g. taps one deal
    // then another before the first response arrives).
    let cancelled = false
    setLoading(true)
    apiFetch<Deal>(`/api/deals/${viewParams.id}`).then((res) => {
      if (cancelled) return
      if (res.success && res.data) setDeal(res.data)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [viewParams.id])

  // Reset quantity when deal changes
  useEffect(() => {
    setQuantity(1)
    setPickupTime('')
    setPickupSlots([])
  }, [viewParams.id])

  // Task 2: generate pickup time slots in 5-minute intervals.
  // Start = now + 10 min (rounded UP to the next 5-min boundary so the
  // dropdown shows clean times like 10:30, 10:35, 10:40 — not 10:23, 10:28).
  // End = min(deal.expiresAt, now + 6 hours) — cap at 6h so the list isn't
  // absurdly long for long-running deals.
  useEffect(() => {
    if (!deal) return
    const now = Date.now()
    const startMs = now + 10 * 60 * 1000 // +10 min
    // Round up to the next 5-minute boundary
    const roundedStart = Math.ceil(startMs / (5 * 60 * 1000)) * (5 * 60 * 1000)
    const dealExpiryMs = parseDbDate(deal.expiresAt).getTime()
    const capMs = now + 6 * 60 * 60 * 1000 // 6h cap
    const endMs = Math.min(dealExpiryMs, capMs)
    const slots: string[] = []
    for (let t = roundedStart; t <= endMs; t += 5 * 60 * 1000) {
      slots.push(new Date(t).toISOString())
    }
    setPickupSlots(slots)
    // Auto-select the first slot
    if (slots.length > 0 && !pickupTime) {
      setPickupTime(slots[0])
    }
  }, [deal?.id, pickupTime])

  // Calculate distance + travel times when deal or user location changes
  useEffect(() => {
    if (!deal?.vendor) return
    if (location) {
      const d = haversineDistance(location, {
        latitude: deal.vendor.latitude,
        longitude: deal.vendor.longitude,
      })
      setDistance(d)
      setWalkTime(walkingTimeMinutes(d))
      setDriveTime(drivingTimeMinutes(d))
    } else {
      // Fallback to the server-computed distance (uses default KL center)
      setDistance(deal.distance ?? null)
      setWalkTime(null)
      setDriveTime(null)
    }
  }, [deal, location])

  const handleClaim = async () => {
    if (!deal) return
    if (!isAuthenticated || !user) {
      setShowAuthModal(true)
      return
    }
    if (quantity < 1 || quantity > deal.availableQuantity) {
      toast.error(`Quantity must be between 1 and ${deal.availableQuantity}`)
      return
    }
    // Task 2: require a pickup time selection
    if (!pickupTime) {
      toast.error('Please select a pickup time')
      return
    }
    setClaiming(true)
    try {
      // Step 1: Claim (create reservation with quantity + foodie-selected pickup time)
      const claimRes = await apiFetch<{ reservation: { id: string }; quantity: number; totalPrice: number }>(
        `/api/deals/${deal.id}/claim`,
        {
          method: 'POST',
          body: JSON.stringify({ quantity, pickupDeadline: pickupTime }),
        }
      )
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
        const orderData =
          (confirmRes.data as Record<string, unknown>).order as Order ||
          (confirmRes.data as unknown as Order)
        setOrder(orderData)
        setClaimed(true)
        toast.success(`Claimed ${quantity}x ${deal.title}!`)
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

  // Quantity handlers
  const incQty = () =>
    setQuantity((q) => Math.min(q + 1, deal?.availableQuantity ?? 1))
  const decQty = () => setQuantity((q) => Math.max(q - 1, 1))

  if (loading) {
    return (
      <div className="pb-28 bg-white min-h-screen">
        <Skeleton className="aspect-[4/3] rounded-none" />
        <div className="px-5 py-4 space-y-4 -mt-6 relative bg-white rounded-t-[24px]">
          <div className="w-10 h-1 bg-[#e8edea] rounded-full mx-auto mb-4" />
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
  const totalPrice = deal.dealPrice * quantity
  const vendorLat = deal.vendor?.latitude ?? DEFAULT_LOCATION.latitude
  const vendorLng = deal.vendor?.longitude ?? DEFAULT_LOCATION.longitude
  const vendorMarkers = [
    {
      position: [vendorLat, vendorLng] as [number, number],
      popup: deal.vendor?.businessName || 'Vendor',
    },
    ...(location
      ? [
          {
            position: [location.latitude, location.longitude] as [number, number],
            popup: 'You are here',
            isUser: true,
          },
        ]
      : []),
  ]

  return (
    <div className="pb-28 bg-white min-h-screen">
      {/* Back button — floats over hero */}
      <button
        onClick={goBack}
        className="fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-card"
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
      </button>

      {/* Hero Image */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-[#dfe5e1] to-[#f0f4f2]">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.title}
            className="w-full h-full object-cover"
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            priority
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="w-20 h-20 text-[#EF5350]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {/* Discount tag — moved UP 10% (bottom-[8%]) */}
        <div className="absolute bottom-[8%] left-5">
          <Badge className="bg-gradient-to-r from-[#E53935] to-[#E53935] text-white font-bold border-0 rounded-full shadow-lg px-3 py-1.5 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            -{deal.discountPercent}% OFF
          </Badge>
        </div>
      </div>

      {/* Content Canvas — overlaps hero with rounded top corners (SnapJe style) */}
      <div className="relative -mt-6 bg-white rounded-t-[24px] px-5 pt-6 pb-4 z-10">
        {/* Drag handle indicator */}
        <div className="w-10 h-1 bg-[#e8edea] rounded-full mx-auto mb-4" />

        {/* Vendor name + title */}
        <p className="text-sm text-[#717971] flex items-center gap-1.5 mb-1">
          <Store className="w-4 h-4" />
          {deal.vendor?.businessName || 'Vendor'}
        </p>
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] leading-tight">{deal.title}</h1>

        {/* Deal Highlight Banner (rounded-2xl, red gradient accent) */}
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#FFEBEE] to-[#FFCDD2] border border-[#E53935]/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#C62828] font-medium">Flash Deal Price</p>
            <div className="flex items-end gap-2 mt-0.5">
              <span className="text-2xl font-black text-[#E53935]">
                RM{deal.dealPrice.toFixed(2)}
              </span>
              <span className="text-sm text-[#717971] line-through mb-0.5">
                RM{deal.originalPrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#C62828] font-medium">{quantity}x total</p>
            <span className="text-lg font-bold text-[#1a1c1e]">RM{totalPrice.toFixed(2)}</span>
          </div>
        </div>

        {/* Info Cards (3-col grid) */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {/* Ends in */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Clock className="w-5 h-5 text-[#E53935] mx-auto mb-1" />
            <p className="text-[10px] text-[#414841]">Ends in</p>
            <CountdownTimer expiresAt={deal.expiresAt} compact />
          </div>
          {/* Stock */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Flame
              className={`w-5 h-5 mx-auto mb-1 ${
                deal.availableQuantity <= 5 ? 'text-[#E53935]' : 'text-[#E53935]'
              }`}
            />
            <p className="text-[10px] text-[#414841]">Stock</p>
            <p
              className={`text-sm font-bold ${
                deal.availableQuantity <= 5 ? 'text-[#E53935]' : 'text-[#1a1c1e]'
              }`}
            >
              {deal.availableQuantity} left
            </p>
          </div>
          {/* Distance */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Navigation className="w-5 h-5 text-[#E53935] mx-auto mb-1" />
            <p className="text-[10px] text-[#414841]">Distance</p>
            <p className="text-sm font-bold text-[#1a1c1e]">
              {distance != null ? formatDistance(distance) : '—'}
            </p>
          </div>
        </div>

        {/* The Bite — Description */}
        <div className="mt-5">
          <h3 className="font-bold text-[#1a1c1e] mb-2">The Bite</h3>
          <p className="text-sm text-[#414841] leading-relaxed">{deal.description}</p>
        </div>

        {/* Pickup Location — Map card */}
        <div className="mt-5">
          <h3 className="font-bold text-[#1a1c1e] mb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#E53935]" /> Pickup Location
          </h3>
          <div className="rounded-2xl border border-[#e8edea] overflow-hidden">
            {/* Map */}
            <div className="relative">
              <MapView
                center={[vendorLat, vendorLng]}
                zoom={15}
                height={180}
                interactive={false}
                markers={vendorMarkers}
              />
            </div>
            {/* Address + distance info */}
            <div className="p-4 bg-white">
              <p className="text-sm font-semibold text-[#1a1c1e]">
                {deal.vendor?.businessName}
              </p>
              <p className="text-xs text-[#717971] mt-0.5 flex items-start gap-1">
                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {deal.vendor?.address || 'Address not available'}
              </p>

              {/* Distance + time estimates */}
              {distance != null ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1 text-[#414841]">
                    <Navigation className="w-3.5 h-3.5 text-[#E53935]" />
                    {formatDistance(distance)}
                  </span>
                  {walkTime != null && (
                    <span className="flex items-center gap-1 text-[#414841]">
                      <Footprints className="w-3.5 h-3.5 text-[#10B981]" />
                      {walkTime} min walk
                    </span>
                  )}
                  {driveTime != null && (
                    <span className="flex items-center gap-1 text-[#414841]">
                      <Route className="w-3.5 h-3.5 text-[#E53935]" />
                      {driveTime} min drive
                    </span>
                  )}
                </div>
              ) : (
                <button
                  onClick={requestLocation}
                  className="mt-3 text-xs text-[#E53935] font-medium flex items-center gap-1 hover:underline"
                >
                  <Navigation className="w-3.5 h-3.5" /> Enable location to see distance
                </button>
              )}

              {/* Open in Maps */}
              <a
                href={`https://www.openstreetmap.org/?mlat=${vendorLat}&mlon=${vendorLng}#map=17/${vendorLat}/${vendorLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[#E53935] font-medium hover:underline"
              >
                <MapPin className="w-3.5 h-3.5" /> Open in Maps
              </a>
            </div>
          </div>
        </div>

        {/* Pickup Instructions */}
        {deal.pickupInstructions && (
          <div className="mt-5">
            <h3 className="font-bold text-[#1a1c1e] mb-2">Pickup Instructions</h3>
            <div className="bg-[#f0f4f2] rounded-xl p-4">
              <p className="text-sm text-[#414841]">{deal.pickupInstructions}</p>
            </div>
          </div>
        )}

        {/* Task 2: Pickup Time Selector — foodie chooses their pickup time slot */}
        {!claimed && !isSoldOut && pickupSlots.length > 0 && (
          <div className="mt-5">
            <h3 className="font-bold text-[#1a1c1e] mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#E53935]" /> Choose Pickup Time
            </h3>
            <p className="text-xs text-[#717971] mb-2">
              Select when you'll pick up your order. Minimum 10 minutes from now to give the vendor time to prepare.
            </p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickupOpen((v) => !v)}
                className="w-full flex items-center justify-between bg-white border-2 border-[#E53935]/30 rounded-xl px-4 py-3 text-left transition-all hover:border-[#E53935]/60 active:scale-[0.99]"
                aria-haspopup="listbox"
                aria-expanded={pickupOpen}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#FFEBEE] flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-[#E53935]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#717971] font-medium leading-none uppercase tracking-wide">Pickup at</p>
                    <p className="text-sm font-bold text-[#1a1c1e] leading-tight mt-0.5">
                      {pickupTime ? parseDbDate(pickupTime).toLocaleString([], {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Select a time'}
                    </p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-[#717971] transition-transform ${pickupOpen ? 'rotate-90' : ''}`} />
              </button>
              {pickupOpen && (
                <div
                  className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#e8edea] rounded-xl shadow-lg max-h-64 overflow-y-auto"
                  role="listbox"
                >
                  {pickupSlots.map((slot) => {
                    const slotDate = parseDbDate(slot)
                    const isSelected = slot === pickupTime
                    return (
                      <button
                        key={slot}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setPickupTime(slot)
                          setPickupOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-[#E53935] text-white font-bold'
                            : 'text-[#1a1c1e] hover:bg-[#f0f4f2]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-[#E53935]'}`} />
                          {slotDate.toLocaleString([], {
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isSelected && <Check className="w-4 h-4" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Sticky Bottom — Order Success Card (above floating bar) + Quantity + Claim Deal */}
      {/* Compact order success card — positioned just above the floating bottom bar */}
      {order && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-[88px] left-3 right-3 z-50 max-w-lg mx-auto"
        >
          <div className="bg-white border border-[#E53935]/30 rounded-2xl shadow-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#E53935]/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-[#E53935]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#1a1c1e] truncate">
                Claimed {quantity}x · RM{totalPrice.toFixed(2)}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-[#717971]">
                <span className="font-mono">{order.orderNumber || '—'}</span>
                {order.pickupDeadline && (
                  <span className="flex items-center gap-0.5">
                    · <Clock className="w-2.5 h-2.5" />
                    {parseDbDate(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <Button
              onClick={() => navigate('orders')}
              size="sm"
              className="h-8 px-3 rounded-lg text-[11px] font-bold bg-[#E53935] hover:bg-[#C62828] text-white flex-shrink-0"
            >
              View QR
            </Button>
          </div>
        </motion.div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8edea] px-5 py-3 z-50 pb-[max(12px,env(safe-area-inset-bottom,12px))]">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {/* Quantity selector — same height as button (h-14) */}
          <div className="flex items-center bg-[#f0f4f2] rounded-[16px] h-14 flex-shrink-0">
            <button
              onClick={decQty}
              disabled={quantity <= 1 || claiming || isSoldOut}
              className="w-12 h-14 flex items-center justify-center text-[#1a1c1e] disabled:opacity-30 active:scale-90 transition-transform"
              aria-label="Decrease quantity"
            >
              <Minus className="w-5 h-5" />
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 1
                setQuantity(Math.max(1, Math.min(v, deal.availableQuantity)))
              }}
              min={1}
              max={deal.availableQuantity}
              className="w-12 h-14 bg-transparent text-center font-bold text-lg text-[#1a1c1e] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Quantity"
            />
            <button
              onClick={incQty}
              disabled={quantity >= deal.availableQuantity || claiming || isSoldOut}
              className="w-12 h-14 flex items-center justify-center text-[#1a1c1e] disabled:opacity-30 active:scale-90 transition-transform"
              aria-label="Increase quantity"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Claim Deal button — flex-1, h-14 */}
          <Button
            onClick={handleClaim}
            disabled={claiming || (isSoldOut && isAuthenticated) || (claimed && isAuthenticated)}
            className={`flex-1 h-14 rounded-[16px] font-bold text-base shadow-lg transition-all active:scale-95 ${
              claimed && isAuthenticated
                ? 'bg-[#10B981] hover:bg-[#10B981] text-white'
                : isSoldOut && isAuthenticated
                ? 'bg-[#c1c9c0] text-white cursor-not-allowed'
                : 'bg-gradient-to-r from-[#E53935] to-[#E53935] hover:opacity-90 text-white'
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
            ) : (
              <>
                <Zap className="w-5 h-5 mr-1" /> Claim RM{totalPrice.toFixed(2)}
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
// Pickup progress slider - animated bar showing time remaining
function PickupProgressSlider({ pickupDeadline, createdAt }: { pickupDeadline: string; createdAt?: string }) {
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const calcProgress = () => {
      const deadline = parseDbDate(pickupDeadline).getTime()
      // MEDIUM 11: use the actual order createdAt (passed in) to compute the
      // pickup window, instead of assuming a fixed 2-hour window. Falls back
      // to the legacy 2-hour assumption if createdAt is not provided.
      // NOTE: parseDbDate is mandatory here — DB stores TIMESTAMP WITHOUT TZ,
      // so the raw string would be parsed as LOCAL time and skew the deadline
      // by the user's UTC offset (8h in Asia/Kuala_Lumpur), which is what
      // caused freshly-claimed orders to land in the Burnt tab.
      const totalWindow = createdAt
        ? Math.max(60_000, deadline - parseDbDate(createdAt).getTime())
        : 2 * 60 * 60 * 1000
      const created = deadline - totalWindow
      const now = Date.now()
      const elapsed = now - created
      const pct = Math.min(100, Math.max(0, (elapsed / totalWindow) * 100))
      setProgress(pct)

      const remaining = deadline - now
      if (remaining <= 0) {
        // Pickup window has passed — but the order may still be "active"
        // (pending_pickup). Show a clear message instead of "Expired" which
        // confuses users into thinking the deal/order is gone.
        setTimeLeft('Pickup overdue')
      } else {
        const mins = Math.floor(remaining / 60000)
        const hrs = Math.floor(mins / 60)
        if (hrs > 0) {
          setTimeLeft(`${hrs}h ${mins % 60}m left`)
        } else {
          setTimeLeft(`${mins}m left`)
        }
      }
    }
    calcProgress()
    const interval = setInterval(calcProgress, 30000) // update every 30s
    return () => clearInterval(interval)
  }, [pickupDeadline, createdAt])

  const isOverdue = timeLeft === 'Pickup overdue'
  const isUrgent = !isOverdue && progress > 75
  const isWarning = !isOverdue && progress > 50

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold ${isOverdue ? 'text-[#717971]' : isUrgent ? 'text-red-500' : isWarning ? 'text-[#E53935]' : 'text-[#E53935]'}`}>
          {timeLeft}
        </span>
      </div>
      <div className="h-1.5 bg-[#f0f4f2] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            isOverdue ? 'bg-[#c1c9c0]' : isUrgent ? 'bg-red-500' : isWarning ? 'bg-[#E53935]' : 'bg-[#E53935]'
          }`}
          style={{
            background: isOverdue
              ? '#c1c9c0'
              : isUrgent
              ? 'linear-gradient(90deg, #E53935, #EF4444)'
              : isWarning
              ? 'linear-gradient(90deg, #E53935, #E53935)'
              : 'linear-gradient(90deg, #EF5350, #E53935)',
          }}
        />
      </div>
    </div>
  )
}

function FoodieOrdersView() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orderTab, setOrderTab] = useState<'active' | 'completed' | 'expired' | 'burnt'>('active')
  const { navigate } = useAppStore()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return }
    setLoading(true)
    apiFetch<{ orders: Order[] }>('/api/orders?pageSize=50').then((res) => {
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
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const activeOrders = orders.filter(o => o.status === 'pending_pickup' || o.status === 'picked_up')
  const completedOrders = orders.filter(o => o.status === 'completed')
  const expiredOrders = orders.filter(o => o.status === 'expired' || o.status === 'cancelled')
  // Burnt = pickup overdue (deadline passed but still pending_pickup — no refund)
  // Only pending_pickup orders can be burnt; picked_up orders are already being processed.
  const now = Date.now()
  const burntOrders = orders.filter(o => o.status === 'pending_pickup' && o.pickupDeadline && parseDbDate(o.pickupDeadline).getTime() < now)
  const nonBurntActive = activeOrders.filter(o => !burntOrders.some(b => b.id === o.id))

  const tabConfig = [
    { key: 'active' as const, label: 'Active', count: nonBurntActive.length, icon: Clock, color: '#E53935' },
    { key: 'completed' as const, label: 'Completed', count: completedOrders.length, icon: CheckCircle, color: '#E53935' },
    { key: 'burnt' as const, label: 'Burnt', count: burntOrders.length, icon: Flame, color: '#EF4444' },
    { key: 'expired' as const, label: 'Expired', count: expiredOrders.length, icon: Timer, color: '#717971' },
  ]

  return (
    <div className="pb-28 px-5 pt-2">
      <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">My Orders</h1>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="mb-3 border-0 shadow-card rounded-2xl">
            <CardContent className="p-4"><Skeleton className="h-20 w-full rounded-xl" /></CardContent>
          </Card>
        ))
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">No orders yet</h3>
          <p className="text-sm text-[#414841] mt-1">Claim your first flash deal!</p>
          <Button onClick={() => navigate('home')} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">
            Browse Deals
          </Button>
        </div>
      ) : (
        <>
          {/* ── Order Tabs ── */}
          <div className="flex gap-1.5 mb-4 bg-[#f0f4f2] p-1 rounded-xl">
            {tabConfig.map((tab) => {
              const Icon = tab.icon
              const isActive = orderTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setOrderTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white shadow-sm text-[#1a1c1e]'
                      : 'text-[#717971]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isActive ? tab.color : undefined }} />
                  {tab.label}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? 'text-white' : 'text-[#717971] bg-[#e0e5e1]'
                  }`} style={isActive ? { backgroundColor: tab.color } : undefined}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Active Orders ── */}
          {orderTab === 'active' && (
            activeOrders.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
                <p className="text-sm text-[#717971]">No active orders</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nonBurntActive.map((order) => (
                  <motion.div key={order.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
                    <Card className="border-0 shadow-card rounded-2xl overflow-hidden">
                      <CardContent className="p-3.5">
                        <div className="flex gap-3">
                          {/* Thumbnail */}
                          <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#f0f4f2]">
                            {order.deal?.imageUrl ? (
                              <Image src={order.deal.imageUrl} alt={order.deal?.title || 'Deal'} width={56} height={56} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Utensils className="w-6 h-6 text-[#EF5350]" />
                              </div>
                            )}
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-[#1a1c1e] truncate">{order.deal?.title || 'Deal'}</p>
                                <p className="text-[10px] text-[#717971] mt-0.5 font-mono truncate">#{order.orderNumber}</p>
                              </div>
                              <QrCode className="w-5 h-5 text-[#E53935] flex-shrink-0" />
                            </div>
                            {/* Pickup time with red */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Clock className="w-3 h-3 text-[#E53935]" />
                              <span className="text-[11px] font-bold text-[#E53935]">
                                Pickup by {parseDbDate(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <PickupProgressSlider pickupDeadline={order.pickupDeadline} createdAt={order.createdAt} />
                            {/* Price & Status */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e8edea]">
                              <div>
                                <span className="text-base font-extrabold text-[#E53935]">RM{order.dealPrice.toFixed(2)}</span>
                                {order.originalPrice > order.dealPrice && (
                                  <span className="text-[10px] text-[#EF4444] line-through ml-1.5">RM{order.originalPrice.toFixed(2)}</span>
                                )}
                              </div>
                              <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg font-bold text-[10px]">
                                Pending Pickup
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )
          )}

          {/* ── Completed Orders ── */}
          {orderTab === 'completed' && (
            completedOrders.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
                <p className="text-sm text-[#717971]">No completed orders</p>
              </div>
            ) : (
              <div className="space-y-3">
                {completedOrders.map((order) => (
                  <motion.div key={order.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
                    <Card className="border-0 shadow-card rounded-2xl">
                      <CardContent className="p-3.5">
                        <div className="flex gap-3">
                          {/* Thumbnail */}
                          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#f0f4f2]">
                            {order.deal?.imageUrl ? (
                              <Image src={order.deal.imageUrl} alt={order.deal?.title || 'Deal'} width={48} height={48} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Utensils className="w-5 h-5 text-[#EF5350]" />
                              </div>
                            )}
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-[#1a1c1e] truncate">{order.deal?.title || 'Deal'}</p>
                                <p className="text-[10px] text-[#717971] mt-0.5 font-mono truncate">#{order.orderNumber}</p>
                              </div>
                              {/* Price right side */}
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-extrabold text-[#E53935]">RM{order.dealPrice.toFixed(2)}</p>
                                {order.originalPrice > order.dealPrice && (
                                  <p className="text-[10px] text-[#EF4444] line-through">RM{order.originalPrice.toFixed(2)}</p>
                                )}
                              </div>
                            </div>
                            <Badge className="bg-[#EF5350]/10 text-[#E53935] border-0 rounded-lg font-bold text-[10px] mt-1.5">
                              <CheckCircle className="w-3 h-3 mr-0.5" /> Completed
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )
          )}

          {/* ── Burnt Orders (pickup overdue — no refund) ── */}
          {orderTab === 'burnt' && (
            burntOrders.length === 0 ? (
              <div className="text-center py-12">
                <Flame className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
                <p className="text-sm text-[#717971]">No burnt orders</p>
                <p className="text-[10px] text-[#717971] mt-1">Pick up your deals on time to avoid losing them!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {burntOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-card rounded-2xl opacity-60">
                    <CardContent className="p-3.5">
                      <div className="flex gap-3">
                        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#f0f4f2]">
                          {order.deal?.imageUrl ? (
                            <Image src={order.deal.imageUrl} alt={order.deal?.title || 'Deal'} width={56} height={56} className="w-full h-full object-cover grayscale" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Utensils className="w-6 h-6 text-[#c1c9c0]" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-[#1a1c1e] truncate">{order.deal?.title || 'Deal'}</p>
                          <p className="text-[10px] text-[#717971] mt-0.5 font-mono truncate">#{order.orderNumber}</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Flame className="w-3 h-3 text-[#EF4444]" />
                            <span className="text-[11px] font-bold text-[#EF4444]">
                              BURNT — Pickup was due {order.pickupDeadline ? parseDbDate(order.pickupDeadline).toLocaleString() : ''}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#717971] mt-0.5">No refund for burnt deals.</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-extrabold text-[#717971]">RM{order.dealPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}

          {/* ── Expired Orders ── */}
          {orderTab === 'expired' && (
            expiredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Timer className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
                <p className="text-sm text-[#717971]">No expired orders</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expiredOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-card rounded-2xl opacity-70">
                    <CardContent className="p-3.5">
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#f0f4f2] grayscale">
                          {order.deal?.imageUrl ? (
                            <Image src={order.deal.imageUrl} alt={order.deal?.title || 'Deal'} width={48} height={48} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Utensils className="w-5 h-5 text-[#c1c9c0]" />
                            </div>
                          )}
                        </div>
                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm text-[#717971] truncate">{order.deal?.title || 'Deal'}</p>
                              <p className="text-[10px] text-[#717971] mt-0.5 font-mono truncate">#{order.orderNumber}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-[#717971]">RM{order.dealPrice.toFixed(2)}</p>
                            </div>
                          </div>
                          <Badge className="bg-[#EF4444]/10 text-[#EF4444] border-0 rounded-lg font-bold text-[10px] mt-1.5">
                            <AlertTriangle className="w-3 h-3 mr-0.5" /> Expired
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
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
              {/* Deal name above QR code */}
              <p className="text-base font-bold text-[#1a1c1e] mb-3">{selectedOrder.deal?.title || 'Deal'}</p>
              <div className="bg-white rounded-2xl p-4 inline-block border-2 border-[#E53935]/20 shadow-card">
                <QRCodeImage qrCode={selectedOrder.qrCode} />
              </div>
              <p className="mt-4 font-bold text-[#1a1c1e] text-sm font-mono break-all">#{selectedOrder.orderNumber}</p>
              <p className="text-sm text-[#414841] mt-1">RM{selectedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs font-bold text-[#E53935] mt-2 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Pickup by {parseDbDate(selectedOrder.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              {selectedOrder.status === 'completed' && (
                <Badge className="mt-3 bg-[#EF5350]/10 text-[#E53935] border-0 rounded-lg">
                  <CheckCircle className="w-3 h-3 mr-1" /> Completed
                </Badge>
              )}
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

  // Settings state
  const [editName, setEditName] = useState('')
  const [editBusinessName, setEditBusinessName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Settings toggles (persisted in localStorage)
  const [settings, setSettings] = useState(() => {
    // MEDIUM 12: wrap JSON.parse in try/catch so a corrupted/tampered
    // localStorage entry doesn't crash the app on boot — fall back to the
    // defaults below instead.
    const defaults = {
      pushNotifications: true,
      dealAlerts: true,
      expiringDealAlerts: true,
      locationServices: true,
      orderUpdates: true,
      // Foodie specific
      dietaryPrefs: [] as string[],
      dealAlertRadius: 5,
      // Vendor specific
      autoAcceptOrders: false,
      orderNotificationSound: true,
      lowStockAlerts: true,
      businessHoursVisible: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('snapje_settings')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed && typeof parsed === 'object') {
            // Merge with defaults so missing keys still get a sensible value.
            return { ...defaults, ...parsed }
          }
        } catch {
          // Corrupt JSON in localStorage — fall through to defaults.
          return defaults
        }
      }
    }
    return defaults
  })

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('snapje_settings', JSON.stringify(settings))
    }
  }, [settings])

  // Sync avatarUrl from the user object (so it persists across refreshes)
  useEffect(() => {
    if (user?.avatarUrl) {
      setAvatarUrl(user.avatarUrl)
    }
  }, [user?.avatarUrl])

  // Initialize Business Name from vendor profile (for the Vendor Settings section)
  // BUGFIX (fix-logout-theme-nearme): previously referenced `roles` here, but
  // `const roles = ...` is declared AFTER the `if (!isAuthenticated || !user)`
  // early-return below. When the early return fires (user is null), `roles`
  // stays in the temporal dead zone (TDZ) — so this effect would throw a
  // ReferenceError when it fires after such a render, surfacing as the
  // "Application error: a client-side exception has occurred" screen during
  // logout. Use `user?.roles?.includes(...)` instead so the lookup is null-safe.
  useEffect(() => {
    if (isAuthenticated && user?.roles?.includes('vendor')) {
      apiFetch<{ vendors: Vendor[] }>('/api/vendors?my=true').then((res) => {
        if (res.success && res.data?.vendors?.[0]) {
          setEditBusinessName(res.data.vendors[0].businessName || '')
        }
      }).catch(() => {})
    }
  }, [isAuthenticated, user?.roles])

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="pb-28 px-5 pt-2">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Profile</h1>
        <div className="text-center py-16">
          <User className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">Sign in to your profile</h3>
          <p className="text-sm text-[#414841] mt-1">Access your account settings and more</p>
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const roles = user?.roles || []
  const activeRole = user?.activeRole || 'foodie'

  const handleRoleSwitch = (role: AppRole) => {
    if (roles.includes(role)) {
      updateActiveRole(role)
      setActiveRole(role)
    }
  }

  const handleLogout = async () => {
    // CRITICAL FIX (fix-logout-theme-nearme): the previous implementation
    // could trigger a client-side crash ("Application error: a client-side
    // exception has occurred") for two reasons:
    //   1. The vendor-profile useEffect above referenced `roles` while it was
    //      in the temporal dead zone (now fixed).
    //   2. If `logout()` or any subsequent store update threw, the error
    //      bubbled to the React error boundary and trashed the whole session.
    // We now (a) wrap the whole flow in try/catch so a failed /logout request
    // doesn't strand the user in a broken state, (b) reset the app-store
    // navigation state BEFORE clearing the auth store so the next render
    // routes to FoodieHomeView (which is fully null-safe) instead of e.g.
    // FoodieProfileView, and (c) guard each store call individually.
    try {
      // Best-effort server logout — ignore network/API failures so the user
      // can still sign out even if the server is unreachable.
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' })
      } catch {
        // Network/parse error — fall through to local logout.
      }

      // Reset navigation FIRST so the post-logout render lands on a null-safe
      // view (FoodieHomeView) before the auth store clears `user`.
      try {
        useAppStore.getState().setActiveRole('foodie')
        useAppStore.getState().navigate('home')
        useAppStore.getState().setShowAuthModal(false)
        useAppStore.getState().setSidebarOpen(false)
      } catch {
        // Ignore — defensive only.
      }

      // Clear the auth store last. After this, `user` becomes null and
      // `isAuthenticated` becomes false; any component still subscribed must
      // have its own null guard (FoodieProfileView does, via the early-return
      // below; FoodieHomeView uses `isAuthenticated` only, never `user.*`).
      logout()

      toast.success('Signed out successfully')
    } catch (err) {
      // Last-resort safety net — never throw out of handleLogout.
      console.error('[handleLogout] unexpected error:', err)
      try { logout() } catch {}
      try { useAppStore.getState().navigate('home') } catch {}
      toast.success('Signed out')
    }
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone }),
      })
      if (res.success) {
        toast.success('Profile updated!')
        setIsEditingProfile(false)
        // Refresh user data in store
        const refreshRes = await apiFetch<AuthUser>('/api/auth/me')
        if (refreshRes.success && refreshRes.data) {
          useAuthStore.getState().login(refreshRes.data)
        }
      } else {
        toast.error(res.error || 'Failed to update profile')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  const startEditProfile = () => {
    setEditName(user?.name || '')
    setEditPhone(user?.phone || '')
    setIsEditingProfile(true)
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setChangingPassword(true)
    try {
      const res = await apiFetch<{ tokens?: { accessToken?: string } }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.success) {
        // MEDIUM FIX: server issued a new access token after invalidating all
        // existing sessions. Update the store with the fresh access token.
        if (res.tokens?.accessToken) {
          useAuthStore.getState().setTokens({ accessToken: res.tokens.accessToken })
        }
        toast.success('Password changed successfully!')
        setShowPasswordModal(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(res.error || 'Failed to change password')
      }
    } finally {
      setChangingPassword(false)
    }
  }

  const dietaryOptions = ['Halal', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Nut-Free', 'Dairy-Free']

  const toggleDietaryPref = (pref: string) => {
    const current = settings.dietaryPrefs as string[]
    updateSetting('dietaryPrefs', current.includes(pref) ? current.filter(p => p !== pref) : [...current, pref])
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Me</h1>

      {/* Role Switching - TOP */}
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
                isActive ? 'bg-[#E53935] text-white shadow-card' : 'bg-[#f0f4f2] text-[#1a1c1e]'
              } ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-bold">{labels[role]}</span>
              {isActive && <Check className="w-3 h-3" />}
            </button>
          )
        })}
      </div>

      {/* User Card - COMPACT with avatar upload */}
      <Card className="border-0 shadow-card rounded-xl mb-4">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <ImageUploader
              group="profile"
              currentUrl={avatarUrl}
              onUploadComplete={(url) => {
                setAvatarUrl(url)
                // Save to profile via API — the route persists avatarUrl to
                // the User table so it survives refreshes.
                // MEDIUM 9: add explicit .catch() so a failed save surfaces a
                // toast instead of being silently swallowed.
                apiFetch('/api/auth/profile', {
                  method: 'PUT',
                  body: JSON.stringify({ avatarUrl: url }),
                }).then((res) => {
                  if (res.success && res.data) {
                    // Update the auth store so the avatar persists immediately
                    useAuthStore.getState().login(res.data as AuthUser)
                  } else {
                    toast.error(res.error || 'Failed to save avatar')
                  }
                }).catch(() => toast.error('Failed to save avatar'))
              }}
              circular
              compact
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[#1a1c1e] text-sm truncate">{user?.name}</h2>
              <p className="text-[11px] text-[#414841] truncate">{user?.email}</p>
            </div>
            <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg text-[10px] flex-shrink-0">
              {activeRole === 'foodie' ? '🍽️ Foodie' : activeRole === 'vendor' ? '🏪 Vendor' : '🛡️ Admin'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ===== SETTINGS SECTION ===== */}
      <div className="mb-4">
        <h3 className="font-bold text-[#1a1c1e] text-sm mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#E53935]" /> Settings
        </h3>

        <Accordion type="multiple" defaultValue={[]} className="space-y-2">
          {/* ── Basic Settings ── */}
          <AccordionItem value="basic" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#E53935]" /> Basic
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              {isEditingProfile ? (
                <>
                  <div>
                    <Label className="text-[11px] font-bold text-[#414841]">Display Name</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 h-9 text-sm rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold text-[#414841]">Phone Number</Label>
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60" className="mt-1 h-9 text-sm rounded-xl" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile} className="flex-1 h-9 rounded-xl bg-[#E53935] hover:bg-[#C62828] text-white text-xs font-bold">
                      {savingProfile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1" /> Save</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditingProfile(false)} className="flex-1 h-9 rounded-xl text-xs">Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#717971]">Display Name</p>
                      <p className="text-sm font-bold text-[#1a1c1e]">{user?.name}</p>
                    </div>
                    <button onClick={startEditProfile} className="p-1.5 rounded-lg hover:bg-[#e8edea]">
                      <Pencil className="w-3.5 h-3.5 text-[#E53935]" />
                    </button>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-[11px] text-[#717971]">Email</p>
                    <p className="text-sm text-[#1a1c1e]">{user?.email}</p>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#717971]">Phone</p>
                      <p className="text-sm text-[#1a1c1e]">{user?.phone || 'Not set'}</p>
                    </div>
                    <button onClick={startEditProfile} className="p-1.5 rounded-lg hover:bg-[#e8edea]">
                      <Pencil className="w-3.5 h-3.5 text-[#E53935]" />
                    </button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#717971]">Language</p>
                      <p className="text-sm text-[#1a1c1e]">English</p>
                    </div>
                    <Globe className="w-4 h-4 text-[#717971]" />
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* ── Vendor Settings (positioned right after Basic) ── */}
          {activeRole === 'vendor' && roles.includes('vendor') && (
            <AccordionItem value="vendor" className="border-0">
              <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
                <span className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#E53935]" /> Vendor Settings
                </span>
              </AccordionTrigger>
              <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
                {/* Business Name — the name customers see on deal cards and orders */}
                <div>
                  <Label className="text-[11px] font-bold text-[#414841]">Business Name</Label>
                  <p className="text-[9px] text-[#717971] mb-1.5">This is the name customers see on your deals and orders.</p>
                  <div className="flex gap-2">
                    <Input
                      value={editBusinessName}
                      onChange={e => setEditBusinessName(e.target.value)}
                      placeholder="Your restaurant/shop name"
                      className="h-9 text-sm rounded-xl flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!editBusinessName.trim()) return
                        try {
                          const vendorRes = await apiFetch<{ vendors: Vendor[] }>('/api/vendors?my=true')
                          if (vendorRes.success && vendorRes.data?.vendors?.[0]) {
                            const vendor = vendorRes.data.vendors[0]
                            const res = await apiFetch(`/api/vendors/${vendor.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ businessName: editBusinessName.trim() }),
                            })
                            if (res.success) {
                              toast.success('Business name updated!')
                            } else {
                              toast.error(res.error || 'Failed to update business name')
                            }
                          } else {
                            toast.error('Vendor profile not found')
                          }
                        } catch {
                          toast.error('Network error — please try again')
                        }
                      }}
                      className="h-9 px-4 rounded-xl bg-[#E53935] hover:bg-[#C62828] text-white text-xs font-bold"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#1a1c1e]">Auto-accept Orders</p>
                    <p className="text-[11px] text-[#717971]">Automatically confirm incoming claims</p>
                  </div>
                  <Switch checked={settings.autoAcceptOrders} onCheckedChange={v => updateSetting('autoAcceptOrders', v)} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#1a1c1e]">Business Hours Visible</p>
                    <p className="text-[11px] text-[#717971]">Show operating hours to foodies</p>
                  </div>
                  <Switch checked={settings.businessHoursVisible} onCheckedChange={v => updateSetting('businessHoursVisible', v)} />
                </div>
                <Separator />
                <button
                  onClick={() => navigate('subscription')}
                  className="w-full flex items-center justify-between p-0"
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="w-4 h-4 text-[#E53935]" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-[#1a1c1e]">Subscription Plan</p>
                      <p className="text-[11px] text-[#717971]">Manage your vendor plan</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#717971]" />
                </button>
                <Separator />
                <button
                  onClick={() => navigate('inventory')}
                  className="w-full flex items-center justify-between p-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4 text-[#E53935]" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-[#1a1c1e]">Inventory Management</p>
                      <p className="text-[11px] text-[#717971]">Manage your deal inventory</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#717971]" />
                </button>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* ── Notifications ── */}
          <AccordionItem value="notifications" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#E53935]" /> Notifications
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Push Notifications</p>
                  <p className="text-[11px] text-[#717971]">Receive push alerts</p>
                </div>
                <Switch checked={settings.pushNotifications} onCheckedChange={v => updateSetting('pushNotifications', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">New Deal Alerts</p>
                  <p className="text-[11px] text-[#717971]">Get notified about new deals</p>
                </div>
                <Switch checked={settings.dealAlerts} onCheckedChange={v => updateSetting('dealAlerts', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Expiring Deals</p>
                  <p className="text-[11px] text-[#717971]">Alert when deals are about to expire</p>
                </div>
                <Switch checked={settings.expiringDealAlerts} onCheckedChange={v => updateSetting('expiringDealAlerts', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Order Updates</p>
                  <p className="text-[11px] text-[#717971]">Status changes for your orders</p>
                </div>
                <Switch checked={settings.orderUpdates} onCheckedChange={v => updateSetting('orderUpdates', v)} />
              </div>
              {roles.includes('vendor') && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#1a1c1e]">Order Sound</p>
                      <p className="text-[11px] text-[#717971]">Play sound on new orders</p>
                    </div>
                    <Switch checked={settings.orderNotificationSound} onCheckedChange={v => updateSetting('orderNotificationSound', v)} />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#1a1c1e]">Low Stock Alerts</p>
                      <p className="text-[11px] text-[#717971]">Alert when deal stock is low</p>
                    </div>
                    <Switch checked={settings.lowStockAlerts} onCheckedChange={v => updateSetting('lowStockAlerts', v)} />
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* ── Privacy & Security ── */}
          <AccordionItem value="security" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#E53935]" /> Security
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="w-full flex items-center justify-between p-0"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-[#E53935]" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-[#1a1c1e]">Change Password</p>
                    <p className="text-[11px] text-[#717971]">Update your account password</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#717971]" />
              </button>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Location Services</p>
                  <p className="text-[11px] text-[#717971]">Allow location for nearby deals</p>
                </div>
                <Switch checked={settings.locationServices} onCheckedChange={v => updateSetting('locationServices', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Profile Visibility</p>
                  <p className="text-[11px] text-[#717971]">Others can see your profile</p>
                </div>
                <Switch defaultChecked={true} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Upload & Photos ── */}
          <AccordionItem value="photos" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#E53935]" /> Photos & Uploads
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              {/* Profile Photo */}
              <ImageUploader
                group="profile"
                currentUrl={avatarUrl}
                onUploadComplete={(url) => {
                  setAvatarUrl(url)
                  // MEDIUM 9: handle the save response so a failure surfaces a
                  // toast instead of silently dropping the avatar update.
                  apiFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ avatarUrl: url }) })
                    .then((res) => {
                      if (!res.success) toast.error(res.error || 'Failed to save avatar')
                    })
                    .catch(() => toast.error('Failed to save avatar'))
                }}
                label="Profile Photo"
                sizeHint="200×200px • Auto-resized"
                circular
              />
              <Separator />
              {/* Vendor-specific uploads */}
              {roles.includes('vendor') && (
                <>
                  <ImageUploader
                    group="vendor_logo"
                    onUploadComplete={(url) => {
                      // MEDIUM 9: surface failures instead of fire-and-forget.
                      apiFetch('/api/vendors/my/logo', { method: 'PUT', body: JSON.stringify({ logoUrl: url }) })
                        .then((res) => {
                          if (!res.success) toast.error(res.error || 'Failed to save logo')
                        })
                        .catch(() => toast.error('Failed to save logo'))
                    }}
                    label="Vendor Logo"
                    sizeHint="200×200px • Auto-resized"
                    circular
                  />
                  <Separator />
                  <ImageUploader
                    group="vendor_banner"
                    onUploadComplete={(url) => {
                      // MEDIUM 9: surface failures instead of fire-and-forget.
                      apiFetch('/api/vendors/my/banner', { method: 'PUT', body: JSON.stringify({ bannerUrl: url }) })
                        .then((res) => {
                          if (!res.success) toast.error(res.error || 'Failed to save banner')
                        })
                        .catch(() => toast.error('Failed to save banner'))
                    }}
                    label="Store Banner"
                    sizeHint="1200×400px • Auto-resized"
                  />
                  <Separator />
                </>
              )}
              <div>
                <p className="text-[11px] text-[#717971]">
                  💡 Images are auto-resized for each context: thumbnails (200px), cards (400px), full (800px), hero (1200px). Upload any size — the system handles the rest.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Foodie-specific Settings ── */}
          {activeRole === 'foodie' && (
            <AccordionItem value="foodie" className="border-0">
              <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
                <span className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-[#E53935]" /> Foodie Preferences
                </span>
              </AccordionTrigger>
              <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e] mb-2">Dietary Preferences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dietaryOptions.map(pref => (
                      <button
                        key={pref}
                        onClick={() => toggleDietaryPref(pref)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          (settings.dietaryPrefs as string[]).includes(pref)
                            ? 'bg-[#E53935] text-white'
                            : 'bg-[#e8edea] text-[#414841]'
                        }`}
                      >
                        {pref}
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-[#1a1c1e]">Deal Alert Radius</p>
                    <p className="text-xs font-bold text-[#E53935]">{settings.dealAlertRadius} km</p>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={settings.dealAlertRadius}
                    onChange={e => updateSetting('dealAlertRadius', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#e8edea] rounded-full appearance-none cursor-pointer accent-[#E53935]"
                  />
                  <div className="flex justify-between text-[10px] text-[#717971] mt-1">
                    <span>1 km</span>
                    <span>50 km</span>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#1a1c1e]">Auto-confirm Claims</p>
                    <p className="text-[11px] text-[#717971]">Skip reservation, go straight to order</p>
                  </div>
                  <Switch defaultChecked={false} />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* ── Advanced ── */}
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:bg-[#E53935] [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:text-white [bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#EF5350]" /> Advanced
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Data Saver Mode</p>
                  <p className="text-[11px] text-[#717971]">Reduce image quality to save data</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Analytics Sharing</p>
                  <p className="text-[11px] text-[#717971]">Help improve SnapJe with usage data</p>
                </div>
                <Switch defaultChecked={true} />
              </div>
              <Separator />
              <div>
                <p className="text-sm font-bold text-[#1a1c1e] mb-1">Cache & Storage</p>
                <p className="text-[11px] text-[#717971] mb-2">Clear local cache and stored data</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('snapje_settings')
                      localStorage.removeItem('snapje_cache')
                      toast.success('Cache cleared!')
                    }
                  }}
                  className="h-8 rounded-xl text-xs"
                >
                  Clear Cache
                </Button>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-bold text-[#1a1c1e]">App Version</p>
                <p className="text-[11px] text-[#717971]">SnapJe v1.0.0 (MVP)</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Quick Links */}
      <div className="space-y-2 mb-4">
        {roles.includes('vendor') && activeRole !== 'vendor' && (
          <button onClick={() => navigate('subscription')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
            <CreditCard className="w-5 h-5 text-[#E53935]" />
            <div className="text-left flex-1">
              <p className="font-bold text-sm text-[#1a1c1e]">Subscription Plan</p>
              <p className="text-[11px] text-[#414841]">Manage your vendor subscription</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#717971]" />
          </button>
        )}
        {!roles.includes('vendor') && (
          <button onClick={() => navigate('register-vendor')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#EF5350]/20 to-[#E53935]/5 hover:from-[#EF5350]/30 hover:to-[#E53935]/10 transition-colors">
            <Sparkles className="w-5 h-5 text-[#E53935]" />
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

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#E53935]" /> Change Password
            </DialogTitle>
            <DialogDescription>Enter your current password and choose a new one</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs font-bold text-[#414841]">Current Password</Label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold text-[#414841]">New Password</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold text-[#414841]">Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="w-full h-10 rounded-xl bg-gradient-to-b from-[#E53935] to-[#C62828] text-white font-bold"
            >
              {changingPassword ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Change Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  const [allDeals, setAllDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'active' | 'expired'>('active')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '', description: '', category: 'Malay',
    originalPrice: '', dealPrice: '', totalQuantity: '',
    expiresAt: '', status: 'active', pickupInstructions: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [locationForm, setLocationForm] = useState<{ latitude: string; longitude: string; address: string }>({
    latitude: '',
    longitude: '',
    address: '',
  })
  const [savingLocation, setSavingLocation] = useState(false)
  // Broadcast modal state (VIP vendors only — gated by user.vipFlag).
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastDealId, setBroadcastDealId] = useState<string>('')
  const [sendingBroadcast, setSendingBroadcast] = useState(false)
  // Task 5: Now/Schedule tabs in the broadcast modal + scheduled-broadcast state
  const [broadcastTab, setBroadcastTab] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>('') // datetime-local string
  const [scheduledList, setScheduledList] = useState<Array<{
    id: string; message: string; dealId: string | null; scheduledAt: string;
    status: string; sentAt: string | null; recipientCount: number
  }>>([])
  const [loadingScheduled, setLoadingScheduled] = useState(false)

  const fetchVendorData = useCallback(() => {
    setLoading(true)
    // ISSUE 4 (fix-logout-theme-nearme): wrap the whole Promise.all in a
    // .catch so a network/API failure doesn't reject and surface as the
    // generic "Internal Error" / white-screen crash. We still set loading
    // to false in .finally and show whatever data we have (or empty state).
    Promise.all([
      apiFetch<{ vendors: Vendor[]; total: number }>('/api/vendors?my=true'),
      apiFetch<{ orders: Order[] }>('/api/orders'),
    ]).then(([vRes, oRes]) => {
      if (vRes.success && vRes.data) {
        const vData = vRes.data.vendors?.[0] || null
        if (vData) {
          setVendor(vData)
          // Fetch vendor's deals using vendorId filter
          apiFetch<{ deals: Deal[] }>(`/api/deals?status=all&vendorId=${vData.id}&pageSize=100`).then((dRes) => {
            if (dRes.success && dRes.data) {
              setAllDeals(dRes.data.deals || [])
            }
          }).catch((err) => {
            console.error('[VendorDashboardView] fetch deals failed:', err)
          })
        }
      } else if (!vRes.success) {
        // Vendor profile API returned an error — toast so the vendor knows
        // something went wrong, but don't crash.
        toast.error(vRes.error || 'Failed to load vendor profile')
      }
      if (oRes.success && oRes.data) {
        const o = (oRes.data as { orders?: Order[] }).orders || oRes.data
        setOrders(Array.isArray(o) ? o : [])
      } else if (!oRes.success) {
        toast.error(oRes.error || 'Failed to load orders')
      }
    }).catch((err) => {
      console.error('[VendorDashboardView] fetchVendorData failed:', err)
      toast.error('Failed to load dashboard data — please retry')
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchVendorData() }, [fetchVendorData])

  // Task 5: fetch the vendor's scheduled broadcasts (for the Schedule tab list).
  // NOTE: must be defined BEFORE the `if (!user) return ...` early return below
  // to comply with React's rules-of-hooks (hooks can't be after a conditional return).
  const fetchScheduledBroadcasts = useCallback(() => {
    if (!vendor) return
    setLoadingScheduled(true)
    apiFetch<{ scheduled: Array<{
      id: string; message: string; dealId: string | null; scheduledAt: string;
      status: string; sentAt: string | null; recipientCount: number
    }> }>(`/api/vendors/${vendor.id}/scheduled-broadcasts`).then((res) => {
      if (res.success && res.data) {
        setScheduledList(res.data.scheduled || [])
      }
    }).catch(() => { /* non-fatal */ }).finally(() => setLoadingScheduled(false))
  }, [vendor])

  // ISSUE 4: if the user logs out mid-session (user becomes null), bail out
  // early with a friendly sign-in prompt instead of dereferencing null below.
  if (!user) {
    return (
      <div className="pb-28 px-5 pt-2">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Vendor Dashboard</h1>
        <div className="text-center py-16">
          <Store className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">Sign in to view your dashboard</h3>
          <p className="text-sm text-[#414841] mt-1">Manage your deals and orders</p>
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  // Classify deals into active and expired
  const isActiveDeal = (d: Deal) => {
    if (d.status === 'expired' || d.status === 'cancelled') return false
    if (d.status === 'active' && parseDbDate(d.expiresAt) <= new Date()) return false
    return d.status === 'active' || d.status === 'paused'
  }

  const activeDeals = allDeals.filter(isActiveDeal)
  const expiredDeals = allDeals.filter(d => !isActiveDeal(d))
  const pendingOrders = orders.filter(o => o.status === 'pending_pickup' && allDeals.some(d => d.id === o.dealId))
  const todayRevenue = orders
    .filter(o => o.vendorId === vendor?.id && o.status === 'completed')
    .reduce((sum, o) => sum + o.totalPrice, 0)

  const displayedDeals = activeTab === 'active' ? activeDeals : expiredDeals

  // Open deal detail modal
  const openDealDetail = (deal: Deal) => {
    setSelectedDeal(deal)
    setShowDetailModal(true)
  }

  // Open edit modal with deal data
  const openEditModal = (deal: Deal) => {
    setEditForm({
      title: deal.title,
      description: deal.description,
      category: deal.category,
      originalPrice: deal.originalPrice.toString(),
      dealPrice: deal.dealPrice.toString(),
      totalQuantity: deal.totalQuantity.toString(),
      expiresAt: toDatetimeLocalString(parseDbDate(deal.expiresAt)),
      status: deal.status,
      pickupInstructions: deal.pickupInstructions || '',
    })
    setSelectedDeal(deal)
    setShowEditModal(true)
    setShowDetailModal(false)
  }

  // Save edited deal
  const handleSaveEdit = async () => {
    if (!selectedDeal) return
    setSaving(true)
    try {
      const res = await apiFetch<Deal>(`/api/deals/${selectedDeal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          category: editForm.category,
          originalPrice: parseFloat(editForm.originalPrice),
          dealPrice: parseFloat(editForm.dealPrice),
          totalQuantity: parseInt(editForm.totalQuantity),
          expiresAt: new Date(editForm.expiresAt).toISOString(),
          status: editForm.status,
          pickupInstructions: editForm.pickupInstructions,
        }),
      })
      if (res.success) {
        toast.success('Deal updated successfully!')
        setShowEditModal(false)
        // Refresh data - deal may have moved between tabs
        fetchVendorData()
        // Auto-switch tab if deal moved
        const newStatus = editForm.status
        if (activeTab === 'active' && (newStatus === 'expired' || newStatus === 'cancelled')) {
          setActiveTab('expired')
        } else if (activeTab === 'expired' && newStatus === 'active') {
          setActiveTab('active')
        }
      } else {
        toast.error(res.error || 'Failed to update deal')
      }
    } finally {
      setSaving(false)
    }
  }

  // Delete deal
  const handleDelete = async (dealId: string) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      if (res.success) {
        toast.success('Deal deleted successfully!')
        setDeleteConfirm(null)
        setShowDetailModal(false)
        fetchVendorData()
      } else {
        toast.error(res.error || 'Failed to delete deal')
      }
    } finally {
      setSaving(false)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = parseDbDate(dateStr)
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Open the Edit Location modal, seeded from the current vendor record
  const openLocationModal = () => {
    if (!vendor) return
    setLocationForm({
      latitude: vendor.latitude.toString(),
      longitude: vendor.longitude.toString(),
      address: vendor.address || '',
    })
    setShowLocationModal(true)
  }

  // Save the updated shop location via PATCH /api/vendors/[id]
  const handleSaveLocation = async () => {
    if (!vendor) return
    if (!locationForm.address.trim()) {
      toast.error('Please search or drag the pin to set an address')
      return
    }
    setSavingLocation(true)
    try {
      const res = await apiFetch<Vendor>(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          address: locationForm.address,
          latitude: parseFloat(locationForm.latitude),
          longitude: parseFloat(locationForm.longitude),
        }),
      })
      if (res.success && res.data) {
        setVendor(res.data)
        toast.success('Shop location updated!')
        setShowLocationModal(false)
      } else {
        toast.error(res.error || 'Failed to update location')
      }
    } finally {
      setSavingLocation(false)
    }
  }

  // VIP-only: send a broadcast (Now tab) or schedule one (Schedule tab).
  // Task 4: recipients = foodie users subscribed to this vendor.
  // Task 5: Schedule tab creates a ScheduledBroadcast row that the
  // realtime-service scheduler picks up at the scheduled time.
  const handleSendBroadcast = async () => {
    if (!vendor) return
    const trimmed = broadcastMessage.trim()
    if (!trimmed) {
      toast.error('Please enter a message')
      return
    }
    if (trimmed.length > 500) {
      toast.error('Message must be 500 characters or fewer')
      return
    }

    // Schedule tab: validate the datetime, then POST to /scheduled-broadcasts
    if (broadcastTab === 'schedule') {
      if (!scheduledAt) {
        toast.error('Please choose a date and time')
        return
      }
      // Convert the datetime-local string (interpreted as local time) to ISO
      const scheduledDate = new Date(scheduledAt)
      if (isNaN(scheduledDate.getTime())) {
        toast.error('Invalid date/time')
        return
      }
      const now = new Date()
      const minTime = new Date(now.getTime() + 60 * 1000)
      const maxTime = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      if (scheduledDate < minTime) {
        toast.error('Scheduled time must be at least 1 minute in the future')
        return
      }
      if (scheduledDate > maxTime) {
        toast.error('Scheduled time cannot be more than 5 days in the future')
        return
      }
      setSendingBroadcast(true)
      try {
        const res = await apiFetch(
          `/api/vendors/${vendor.id}/scheduled-broadcasts`,
          {
            method: 'POST',
            body: JSON.stringify({
              message: trimmed,
              dealId: broadcastDealId || undefined,
              scheduledAt: scheduledDate.toISOString(),
            }),
          }
        )
        if (res.success) {
          toast.success(`Broadcast scheduled for ${scheduledDate.toLocaleString()} ⏰`)
          setShowBroadcastModal(false)
          setBroadcastMessage('')
          setBroadcastDealId('')
          setScheduledAt('')
          // Refresh the scheduled list so the new entry appears
          fetchScheduledBroadcasts()
        } else {
          toast.error(res.error || 'Failed to schedule broadcast')
        }
      } finally {
        setSendingBroadcast(false)
      }
      return
    }

    // Now tab: send immediately via /broadcast
    setSendingBroadcast(true)
    try {
      const res = await apiFetch<{ recipients: number; vendorId: string; title: string }>(
        `/api/vendors/${vendor.id}/broadcast`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: trimmed,
            dealId: broadcastDealId || undefined,
          }),
        }
      )
      if (res.success) {
        const count = res.data?.recipients ?? 0
        if (count === 0) {
          toast.info('No subscribers yet — ask foodies to subscribe to your store!')
        } else {
          toast.success(`Broadcast sent to ${count} subscriber${count === 1 ? '' : 's'}! 📣`)
        }
        setShowBroadcastModal(false)
        setBroadcastMessage('')
        setBroadcastDealId('')
      } else {
        toast.error(res.error || 'Failed to send broadcast')
      }
    } finally {
      setSendingBroadcast(false)
    }
  }

  // Task 5: cancel a pending scheduled broadcast
  const handleCancelScheduled = async (id: string) => {
    if (!vendor) return
    try {
      const res = await apiFetch(
        `/api/vendors/${vendor.id}/scheduled-broadcasts?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      if (res.success) {
        toast.success('Scheduled broadcast cancelled')
        setScheduledList((prev) => prev.filter((s) => s.id !== id))
      } else {
        toast.error(res.error || 'Failed to cancel')
      }
    } catch {
      toast.error('Failed to cancel')
    }
  }

  // Calculate discount for edit form
  const editDiscount = editForm.originalPrice && editForm.dealPrice
    ? Math.round(((parseFloat(editForm.originalPrice) - parseFloat(editForm.dealPrice)) / parseFloat(editForm.originalPrice)) * 100)
    : 0

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
            <User className="w-5 h-5 text-[#E53935]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-10 rounded-xl" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <DollarSign className="w-6 h-6 text-[#E53935] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Revenue</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">RM{todayRevenue.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#E53935] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{activeDeals.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#EF5350] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Pending Pickup</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{pendingOrders.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 text-[#4A6A8A] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Sold</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{vendor?.totalSales || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <h3 className="font-bold text-[#1a1c1e] mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate('create-deal')} className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 rounded-2xl shadow-chip">
              <div className="w-10 h-10 rounded-xl bg-[#E53935] flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Create Deal</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate('fulfillment')} className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#E53935]/20 to-[#E53935]/10 rounded-2xl shadow-chip">
              <div className="w-10 h-10 rounded-xl bg-[#E53935] flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Fulfillment</span>
            </motion.button>
            {user?.vipFlag && vendor && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setBroadcastMessage('')
                  setBroadcastDealId('')
                  setShowBroadcastModal(true)
                }}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-300 rounded-2xl shadow-chip"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-bold text-[#1a1c1e]">Broadcast Deal</span>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded-full">VIP</span>
              </motion.button>
            )}
          </div>

          {/* Shop Location */}
          {vendor && (
            <Card className="border-0 shadow-card rounded-2xl mb-6 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#E53935]" />
                    <h3 className="font-bold text-[#1a1c1e] text-sm">Shop Location</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openLocationModal}
                    className="h-8 rounded-lg text-xs font-bold border-[#E53935]/30 text-[#E53935] hover:bg-[#E53935]/10"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                </div>
                <div className="px-4 pb-2">
                  <p className="text-xs text-[#414841] leading-relaxed line-clamp-2">{vendor.address || 'No address set.'}</p>
                  <p className="text-[10px] text-[#717971] mt-0.5 font-mono">
                    {vendor.latitude.toFixed(5)}, {vendor.longitude.toFixed(5)}
                  </p>
                </div>
                <MapView
                  center={[vendor.latitude, vendor.longitude]}
                  zoom={15}
                  height={160}
                  interactive={false}
                  markers={[{ position: [vendor.latitude, vendor.longitude], popup: vendor.businessName }]}
                />
              </CardContent>
            </Card>
          )}

          {/* Active / Expired Tabs */}
          <div className="flex bg-[#e8edea] rounded-xl p-1 mb-4">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'active' ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
              }`}
            >
              <Flame className="w-4 h-4" />
              Active
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'active' ? 'bg-[#E53935] text-white' : 'bg-[#d7ddd9] text-[#717971]'
              }`}>{activeDeals.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('expired')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'expired' ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
              }`}
            >
              <Clock className="w-4 h-4" />
              Expired
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'expired' ? 'bg-[#E53935] text-white' : 'bg-[#d7ddd9] text-[#717971]'
              }`}>{expiredDeals.length}</span>
            </button>
          </div>

          {/* Deal List */}
          {displayedDeals.length === 0 ? (
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-6 text-center">
                {activeTab === 'active' ? (
                  <>
                    <Flame className="w-10 h-10 text-[#c1c9c0] mx-auto mb-2" />
                    <p className="text-sm text-[#414841]">No active deals. Create one now!</p>
                  </>
                ) : (
                  <>
                    <Clock className="w-10 h-10 text-[#c1c9c0] mx-auto mb-2" />
                    <p className="text-sm text-[#414841]">No expired deals yet.</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {displayedDeals.map((deal) => (
                <motion.div
                  key={deal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card
                    className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow"
                    onClick={() => openDealDetail(deal)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="font-bold text-[#1a1c1e] truncate">{deal.title}</p>
                          <p className="text-xs text-[#414841] mt-0.5">
                            RM{deal.dealPrice.toFixed(2)} <span className="line-through text-[#717971]">RM{deal.originalPrice.toFixed(2)}</span>
                            <span className="ml-1 text-[#E53935] font-bold">-{deal.discountPercent}%</span>
                          </p>
                        </div>
                        <Badge className={`border-0 rounded-lg text-xs flex-shrink-0 ${
                          activeTab === 'active'
                            ? 'bg-[#EF5350]/10 text-[#E53935]'
                            : 'bg-[#717971]/10 text-[#717971]'
                        }`}>
                          {activeTab === 'active' ? 'Active' : deal.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-[#717971] mb-3">
                        <Timer className="w-3.5 h-3.5" />
                        <span>Expires: {formatDate(deal.expiresAt)}</span>
                        <span className="mx-1">•</span>
                        <span>{deal.availableQuantity} left</span>
                      </div>

                      <div className="mb-3">
                        <Progress value={(deal.soldQuantity / deal.totalQuantity) * 100} className="h-2" />
                        <p className="text-xs text-[#717971] mt-1">{deal.soldQuantity}/{deal.totalQuantity} claimed</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(deal)}
                          className="flex-1 h-9 rounded-xl text-xs font-bold border-[#E53935]/30 text-[#E53935] hover:bg-[#E53935]/10"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirm(deal.id)}
                          className="h-9 rounded-xl text-xs font-bold border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 px-3"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Delete Confirmation */}
                  {deleteConfirm === deal.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 p-3 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-xl"
                    >
                      <p className="text-xs font-bold text-[#EF4444] mb-2">Delete &quot;{deal.title}&quot;?</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleDelete(deal.id)}
                          disabled={saving}
                          className="flex-1 h-8 rounded-lg text-xs font-bold bg-[#EF4444] hover:bg-[#DC2626] text-white"
                        >
                          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Confirm Delete'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirm(null)}
                          className="h-8 rounded-lg text-xs font-bold"
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== Deal Detail Modal ===== */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[85vh] overflow-y-auto p-0">
          {selectedDeal && (
            <>
              {/* Header */}
              <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
                <DialogHeader>
                  <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">{selectedDeal.title}</DialogTitle>
                  <DialogDescription className="text-[#414841] text-xs">
                    Deal Details • {selectedDeal.category}
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Status & Discount */}
                <div className="flex items-center gap-2">
                  <Badge className={`border-0 rounded-lg text-xs ${
                    isActiveDeal(selectedDeal) ? 'bg-[#EF5350]/10 text-[#E53935]' : 'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {isActiveDeal(selectedDeal) ? 'Active' : selectedDeal.status}
                  </Badge>
                  <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg text-xs">
                    -{selectedDeal.discountPercent}%
                  </Badge>
                </div>

                {/* Description */}
                <p className="text-sm text-[#414841]">{selectedDeal.description}</p>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Original</p>
                    <p className="font-bold text-[#1a1c1e] line-through">RM{selectedDeal.originalPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#E53935]">RM{selectedDeal.dealPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Inventory */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{selectedDeal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#EF5350]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Left</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.availableQuantity}</p>
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Timer className="w-4 h-4 text-[#E53935]" />
                    <span className="text-[#414841]">Expires: {formatDate(selectedDeal.expiresAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-[#E53935]" />
                    <span className="text-[#414841]">Created: {formatDate(selectedDeal.createdAt)}</span>
                  </div>
                </div>

                {/* Pickup Instructions */}
                {selectedDeal.pickupInstructions && (
                  <div className="bg-[#f0f4f2] rounded-xl p-3">
                    <p className="text-xs font-bold text-[#1a1c1e] mb-1">Pickup Instructions</p>
                    <p className="text-xs text-[#414841]">{selectedDeal.pickupInstructions}</p>
                  </div>
                )}

                {/* Progress */}
                <div>
                  <div className="flex justify-between text-xs text-[#717971] mb-1">
                    <span>Claims Progress</span>
                    <span>{selectedDeal.soldQuantity}/{selectedDeal.totalQuantity}</span>
                  </div>
                  <Progress value={(selectedDeal.soldQuantity / selectedDeal.totalQuantity) * 100} className="h-2.5" />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => openEditModal(selectedDeal)}
                    className="flex-1 h-11 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white"
                  >
                    <Pencil className="w-4 h-4 mr-1.5" /> Edit Deal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setDeleteConfirm(selectedDeal.id); setShowDetailModal(false) }}
                    className="h-11 rounded-xl font-bold border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 px-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Edit Deal Modal ===== */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[85vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">Edit Deal</DialogTitle>
              <DialogDescription className="text-[#414841] text-xs">
                Update your deal details. Changes are saved when you press Save.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* Status Toggle - most important for moving between tabs */}
            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({...editForm, status: v})}>
                <SelectTrigger className="h-11 rounded-xl mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">🟢 Active</SelectItem>
                  <SelectItem value="paused">⏸️ Paused</SelectItem>
                  <SelectItem value="expired">🔴 Expired</SelectItem>
                  <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Food Name</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} className="mt-1.5 h-11 rounded-xl" />
            </div>

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="mt-1.5 rounded-xl min-h-[80px]" />
            </div>

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Category</Label>
              <Select value={editForm.category} onValueChange={(v) => setEditForm({...editForm, category: v})}>
                <SelectTrigger className="h-11 rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Vegan', 'Dessert', 'Beverage', 'Other'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-semibold text-[#1a1c1e] text-sm">Original (RM)</Label>
                <Input type="number" value={editForm.originalPrice} onChange={(e) => setEditForm({...editForm, originalPrice: e.target.value})} className="mt-1.5 h-11 rounded-xl" />
              </div>
              <div>
                <Label className="font-semibold text-[#1a1c1e] text-sm">Deal Price (RM)</Label>
                <Input type="number" value={editForm.dealPrice} onChange={(e) => setEditForm({...editForm, dealPrice: e.target.value})} className="mt-1.5 h-11 rounded-xl" />
              </div>
            </div>

            {editDiscount > 0 && (
              <div className="bg-[#FFEBEE] rounded-xl p-3 text-center">
                <p className="text-sm text-[#E53935] font-bold">🔥 {editDiscount}% Discount</p>
              </div>
            )}

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Quantity</Label>
              <Input type="number" value={editForm.totalQuantity} onChange={(e) => setEditForm({...editForm, totalQuantity: e.target.value})} className="mt-1.5 h-11 rounded-xl" />
            </div>

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Expires At</Label>
              <Input type="datetime-local" value={editForm.expiresAt} onChange={(e) => setEditForm({...editForm, expiresAt: e.target.value})} className="mt-1.5 h-11 rounded-xl" />
            </div>

            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Pickup Instructions</Label>
              <Textarea value={editForm.pickupInstructions} onChange={(e) => setEditForm({...editForm, pickupInstructions: e.target.value})} className="mt-1.5 rounded-xl min-h-[60px]" />
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1.5" /> Save Changes</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Shop Location Modal ===== */}
      <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
        <DialogContent className="rounded-2xl max-w-md max-h-[90vh] overflow-y-auto p-0 mx-4 w-[calc(100%-2rem)]">
          <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">Edit Shop Location</DialogTitle>
              <DialogDescription className="text-[#414841] text-xs">
                Search your address or drag the pin to set the exact pickup point customers will see.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-5 pb-5 space-y-4">
            <LocationPicker
              value={{ latitude: parseFloat(locationForm.latitude) || 0, longitude: parseFloat(locationForm.longitude) || 0 }}
              onChange={(lat, lng) => setLocationForm(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }))}
              address={locationForm.address}
              onAddressChange={(addr) => setLocationForm(prev => ({ ...prev, address: addr }))}
            />
            <Button
              onClick={handleSaveLocation}
              disabled={savingLocation}
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform relative z-[10000]"
            >
              {savingLocation ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1.5" /> Save Location</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Broadcast Modal (VIP vendors only) — Now / Schedule tabs ===== */}
      <Dialog
        open={showBroadcastModal}
        onOpenChange={(v) => {
          setShowBroadcastModal(v)
          if (v) {
            // Task 5: when opening the modal, fetch the scheduled list so the
            // vendor can see their upcoming/past scheduled broadcasts.
            fetchScheduledBroadcasts()
            // Reset to the "Now" tab each time the modal opens
            setBroadcastTab('now')
          }
        }}
      >
        <DialogContent className="rounded-2xl max-w-md w-[calc(100%-1.5rem)] mx-auto p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-[#E53935]/10 to-[#E53935]/5 px-5 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[#1a1c1e] flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#E53935]" />
                Broadcast to Subscribers
              </DialogTitle>
              <DialogDescription className="text-[#414841] text-xs">
                Task 4: Only foodies subscribed to your store receive broadcasts.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Task 5: Now / Schedule tabs */}
          <div className="px-5 pt-3">
            <div className="flex gap-1 bg-[#f0f4f2] p-1 rounded-xl">
              <button
                onClick={() => setBroadcastTab('now')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  broadcastTab === 'now' ? 'bg-white shadow-sm text-[#1a1c1e]' : 'text-[#717971]'
                }`}
              >
                <Zap className="w-3.5 h-3.5 inline mr-1" style={{ color: broadcastTab === 'now' ? '#E53935' : undefined }} />
                Now
              </button>
              <button
                onClick={() => setBroadcastTab('schedule')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  broadcastTab === 'schedule' ? 'bg-white shadow-sm text-[#1a1c1e]' : 'text-[#717971]'
                }`}
              >
                <Clock className="w-3.5 h-3.5 inline mr-1" style={{ color: broadcastTab === 'schedule' ? '#E53935' : undefined }} />
                Schedule
              </button>
            </div>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* ── Message input (shared by both tabs) ── */}
            <div>
              <Label htmlFor="broadcast-message" className="text-xs font-semibold text-[#1a1c1e] mb-1.5 block">
                Message <span className="text-[#717971] font-normal">({broadcastMessage.length}/500)</span>
              </Label>
              <Textarea
                id="broadcast-message"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value.slice(0, 500))}
                placeholder="e.g. Flash sale! 50% off all nasi lemak this weekend only."
                className="rounded-xl min-h-[100px] text-sm resize-none"
                maxLength={500}
              />
            </div>

            {/* ── Schedule-tab-only: datetime picker ── */}
            {broadcastTab === 'schedule' && (
              <div>
                <Label htmlFor="scheduled-at" className="text-xs font-semibold text-[#1a1c1e] mb-1.5 block">
                  Schedule for <span className="text-[#717971] font-normal">(max 5 days, 1 per day)</span>
                </Label>
                <Input
                  id="scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="rounded-xl h-11 text-sm"
                  min={new Date(Date.now() + 60 * 1000).toISOString().slice(0, 16)}
                  max={new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                />
                <p className="text-[10px] text-[#717971] mt-1">
                  The broadcast will be sent automatically at the chosen time. Only 1 scheduled broadcast per calendar day is allowed.
                </p>
              </div>
            )}

            {/* ── Deal attachment (shared) ── */}
            {activeDeals.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-[#1a1c1e] mb-1.5 block">
                  Attach a deal (optional) — tap to select
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {activeDeals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setBroadcastDealId(broadcastDealId === d.id ? '' : d.id)}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all active:scale-95 ${
                        broadcastDealId === d.id ? 'border-[#E53935] ring-2 ring-[#E53935]/20' : 'border-transparent'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-[#f0f4f2] relative">
                        {d.imageUrl ? (
                          <Image src={d.imageUrl} alt={d.title} fill className="object-cover" sizes="150px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Utensils className="w-6 h-6 text-[#c1c9c0]" />
                          </div>
                        )}
                        {broadcastDealId === d.id && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#E53935] flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-1.5 bg-white">
                        <p className="text-[10px] font-bold text-[#1a1c1e] truncate">{d.title}</p>
                        <p className="text-[10px] text-[#E53935] font-bold">RM{d.dealPrice.toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {broadcastDealId && (
                  <button
                    onClick={() => setBroadcastDealId('')}
                    className="text-[10px] text-[#717971] mt-1.5 hover:text-[#1a1c1e]"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}

            {/* ── Schedule tab: list of upcoming/past scheduled broadcasts ── */}
            {broadcastTab === 'schedule' && (
              <div className="border-t border-[#e8edea] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-[#1a1c1e]">Your Scheduled Broadcasts</p>
                  {loadingScheduled && <RefreshCw className="w-3 h-3 animate-spin text-[#717971]" />}
                </div>
                {scheduledList.length === 0 ? (
                  <p className="text-[10px] text-[#717971] py-3 text-center">No scheduled broadcasts yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                    {scheduledList.map((s) => (
                      <div key={s.id} className="bg-[#f8faf9] rounded-lg p-2.5 border border-[#e8edea]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-[#1a1c1e] truncate">{s.message}</p>
                            <p className="text-[9px] text-[#717971] mt-0.5">
                              {parseDbDate(s.scheduledAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge
                            className={`text-[9px] rounded ${
                              s.status === 'pending'
                                ? 'bg-[#E53935]/10 text-[#E53935]'
                                : s.status === 'sent'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {s.status}
                            {s.status === 'sent' && s.recipientCount > 0 ? ` · ${s.recipientCount}` : ''}
                          </Badge>
                        </div>
                        {s.status === 'pending' && (
                          <button
                            onClick={() => handleCancelScheduled(s.id)}
                            className="text-[10px] text-[#EF4444] font-bold mt-1 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowBroadcastModal(false)}
                disabled={sendingBroadcast}
                className="flex-1 h-11 rounded-xl text-sm font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendBroadcast}
                disabled={
                  sendingBroadcast ||
                  !broadcastMessage.trim() ||
                  (broadcastTab === 'schedule' && !scheduledAt)
                }
                className="flex-1 h-11 rounded-xl text-sm font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white hover:opacity-90 active:scale-95 transition-all"
              >
                {sendingBroadcast ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : broadcastTab === 'schedule' ? (
                  <><Clock className="w-4 h-4 mr-1.5" /> Schedule</>
                ) : (
                  <><Megaphone className="w-4 h-4 mr-1.5" /> Send Now</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  const [dealImageUrl, setDealImageUrl] = useState<string | null>(null)
  const [dealImageUrls, setDealImageUrls] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    title: '', description: '', category: 'Malay',
    originalPrice: '', dealPrice: '', totalQuantity: '',
    maxClaimsPerUser: '1',
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
          maxClaimsPerUser: Math.max(1, Math.min(99, parseInt(form.maxClaimsPerUser) || 1)),
          imageUrl: dealImageUrl || dealImageUrls?.medium || dealImageUrls?.large || undefined,
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
              s <= step ? 'bg-[#E53935] text-white' : 'bg-[#e8edea] text-[#717971]'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 rounded ${s < step ? 'bg-[#E53935]' : 'bg-[#e8edea]'}`} />}
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
          {/* Deal Image Upload */}
          <ImageUploader
            group="deal"
            currentUrl={dealImageUrl}
            onUploadComplete={(url, urls) => {
              setDealImageUrl(url)
              setDealImageUrls(urls)
            }}
            label="Food Photo"
            sizeHint="Auto-generates thumb (200px), card (400px), full (800px), hero (1200px)"
          />
          <Button onClick={() => setStep(2)} className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white">
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
            <div className="bg-[#FFEBEE] rounded-xl p-3 text-center">
              <p className="text-sm text-[#E53935] font-bold">🔥 {discountPercent}% Discount</p>
            </div>
          )}
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Available Quantity *</Label>
            <Input type="number" value={form.totalQuantity} onChange={(e) => setForm({...form, totalQuantity: e.target.value})} placeholder="20" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Max Claims Per User *</Label>
            <Input
              type="number"
              value={form.maxClaimsPerUser}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setForm({...form, maxClaimsPerUser: String(Math.max(1, Math.min(99, isNaN(v) ? 1 : v)))})
              }}
              min={1}
              max={99}
              placeholder="1"
              className="mt-1.5 h-12 rounded-xl"
            />
            <p className="text-[10px] text-[#717971] mt-1">How many times a single foodie can claim this deal (1-99).</p>
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Deal Expires At *</Label>
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({...form, expiresAt: e.target.value})} className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setStep(1)} variant="outline" className="flex-1 h-12 rounded-xl font-bold">Back</Button>
            <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white">
              Next: Review <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 3: Review & Publish */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <Card className="border-0 shadow-card rounded-2xl overflow-hidden">
            {dealImageUrl && (
              <div className="w-full h-40 bg-[#f0f4f2] relative">
                <Image src={dealImageUrl} alt={form.title || 'Deal'} fill className="object-cover" unoptimized />
              </div>
            )}
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-lg text-[#1a1c1e]">{form.title || 'Untitled Deal'}</h3>
              <p className="text-sm text-[#414841]">{form.description}</p>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg">{form.category}</Badge>
                <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg">-{discountPercent}%</Badge>
              </div>
              <Separator className="bg-[#d7ddd9]" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#717971]">Original</p>
                  <p className="font-bold text-[#1a1c1e] line-through">RM{form.originalPrice}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Deal Price</p>
                  <p className="font-bold text-[#E53935] text-lg">RM{form.dealPrice}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Quantity</p>
                  <p className="font-bold text-[#1a1c1e]">{form.totalQuantity}</p>
                </div>
                <div>
                  <p className="text-[#717971]">Max Claims/User</p>
                  <p className="font-bold text-[#1a1c1e]">{form.maxClaimsPerUser}</p>
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
              className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
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
  const { user } = useAuthStore()
  const [allDeals, setAllDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'expired'>('active')

  useEffect(() => {
    setLoading(true)
    // Fetch vendor profile first, then their deals
    apiFetch<{ vendors: Vendor[] }>('/api/vendors?my=true').then((vRes) => {
      if (vRes.success && vRes.data) {
        const vData = vRes.data.vendors?.[0]
        if (vData) {
          apiFetch<{ deals: Deal[] }>(`/api/deals?status=all&vendorId=${vData.id}&pageSize=100`).then((dRes) => {
            if (dRes.success && dRes.data) {
              setAllDeals(dRes.data.deals || [])
            }
          })
        }
      }
    }).finally(() => setLoading(false))
  }, [])

  // Classify deals into active and expired
  const isActiveDeal = (d: Deal) => {
    if (d.status === 'expired' || d.status === 'cancelled') return false
    if (d.status === 'active' && parseDbDate(d.expiresAt) <= new Date()) return false
    return d.status === 'active' || d.status === 'paused'
  }

  const activeDeals = allDeals.filter(isActiveDeal)
  const expiredDeals = allDeals.filter(d => !isActiveDeal(d))
  const displayedDeals = activeTab === 'active' ? activeDeals : expiredDeals

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Inventory</h1>
      </div>

      {/* Active / Expired Tabs */}
      <div className="flex bg-[#e8edea] rounded-xl p-1 mb-4">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'active' ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
          }`}
        >
          <Flame className="w-4 h-4" />
          Active
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'active' ? 'bg-[#E53935] text-white' : 'bg-[#d7ddd9] text-[#717971]'
          }`}>{activeDeals.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'expired' ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
          }`}
        >
          <Clock className="w-4 h-4" />
          Expired
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'expired' ? 'bg-[#E53935] text-white' : 'bg-[#d7ddd9] text-[#717971]'
          }`}>{expiredDeals.length}</span>
        </button>
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-3" />)
      ) : displayedDeals.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">
            {activeTab === 'active' ? 'No active inventory' : 'No expired deals'}
          </h3>
          {activeTab === 'active' && (
            <p className="text-sm text-[#414841] mt-1">Create a deal from the dashboard!</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedDeals.map((deal) => (
            <Card key={deal.id} className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-[#1a1c1e]">{deal.title}</p>
                    <p className="text-xs text-[#414841]">RM{deal.dealPrice.toFixed(2)} per meal</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    isActiveDeal(deal) ? 'bg-[#EF5350]/10 text-[#E53935]' : 'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {isActiveDeal(deal) ? 'Active' : deal.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{deal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#E53935]">{deal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#EF5350]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#E53935]">{deal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Available</p>
                    <p className="font-bold text-[#E53935]">{deal.availableQuantity}</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <Progress value={(deal.soldQuantity / deal.totalQuantity) * 100} className="h-1.5" />
                  <p className="text-[10px] text-[#717971] mt-1">{deal.soldQuantity}/{deal.totalQuantity} claimed</p>
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
  const [qrInput, setQrInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending')

  // Scan result modal
  const [scanResult, setScanResult] = useState<{
    order: { id: string; orderNumber: string; status: string; quantity: number; totalPrice: number; pickupDeadline: string; createdAt: string }
    deal: { id: string; title: string; description?: string; imageUrl?: string; category?: string; pickupInstructions?: string; originalPrice: number; dealPrice: number } | null
    vendor: { id: string; businessName: string; address: string } | null
    canComplete: boolean
  } | null>(null)

  // Completed confirmation
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: string; dealTitle?: string; totalPrice: number; completedAt: string
  } | null>(null)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    apiFetch<{ orders: Order[] }>('/api/orders?vendor=true&pageSize=100').then((res) => {
      if (res.success && res.data) setOrders(res.data.orders || [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const pendingPickup = orders.filter(o => o.status === 'pending_pickup')
  const completed = orders.filter(o => o.status === 'completed')

  // Handle QR scan from the live camera scanner (QRScanner component)
  // or from manual input. Looks up the order by QR code.
  const handleQRScan = async (qrCode: string) => {
    if (!qrCode.trim()) return
    setScanning(true)
    try {
      const res = await apiFetch<{
        order: { id: string; orderNumber: string; status: string; quantity: number; totalPrice: number; pickupDeadline: string; createdAt: string }
        deal: { id: string; title: string; description?: string; imageUrl?: string; category?: string; pickupInstructions?: string; originalPrice: number; dealPrice: number } | null
        vendor: { id: string; businessName: string; address: string } | null
        canComplete: boolean
      }>('/api/orders/scan', {
        method: 'POST',
        body: JSON.stringify({ qrCode: qrCode.trim() }),
      })
      if (res.success && res.data) {
        setScanResult(res.data)
      } else {
        toast.error(res.error || 'QR code lookup failed')
      }
    } finally {
      setScanning(false)
    }
  }

  // Manual input handler (kept as a fallback for when camera is unavailable)
  const handleScan = async () => {
    if (!qrInput.trim()) return
    await handleQRScan(qrInput)
  }

  // Complete order
  const handleComplete = async () => {
    if (!scanResult?.order.id) return
    setCompleting(true)
    try {
      const res = await apiFetch<{
        orderId: string; orderNumber: string; status: string; completedAt: string
        dealTitle?: string; totalPrice: number
      }>('/api/orders/complete', {
        method: 'POST',
        body: JSON.stringify({ orderId: scanResult.order.id }),
      })
      if (res.success && res.data) {
        setCompletedOrder(res.data)
        setScanResult(null)
        setQrInput('')
        toast.success('Order completed successfully! 🎉')
        fetchOrders()
      } else {
        toast.error(res.error || 'Failed to complete order')
      }
    } finally {
      setCompleting(false)
    }
  }

  // Quick scan from pending order list
  const quickScan = (order: Order) => {
    setQrInput(order.qrCode)
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Fulfillment</h1>
      </div>

      {/* QR Scanner Card — live camera scanner + manual input fallback */}
      <Card className="border-0 shadow-card rounded-2xl mb-4 overflow-hidden">
        <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-4 pt-3 pb-1.5">
          <h3 className="font-bold text-sm text-[#1a1c1e] flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-[#E53935]" /> Scan QR Code
          </h3>
          <p className="text-[10px] text-[#414841]">Scan customer&apos;s QR to verify & complete pickup</p>
        </div>
        <CardContent className="p-3 space-y-3">
          {/* Live Camera Scanner — continuous feed, auto-detects QR on hover.
              This replaces the old file-input fallback with a proper live
              camera view using Html5QrcodeScanner. */}
          <QRScanner onScan={handleQRScan} processing={scanning} />

          {/* Manual Input Fallback */}
          <div className="flex items-center gap-2 text-[9px] text-[#717971]">
            <div className="flex-1 h-px bg-[#d7ddd9]" />
            OR ENTER MANUALLY
            <div className="flex-1 h-px bg-[#d7ddd9]" />
          </div>
          <div className="flex gap-2">
            <Input
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Enter QR code..."
              className="h-10 rounded-xl flex-1 font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
            <Button
              onClick={handleScan}
              disabled={scanning || !qrInput.trim()}
              className="h-10 px-4 rounded-xl font-bold text-sm bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white"
            >
              {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Pending Pickup / Completed Orders */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'pending'
              ? 'bg-[#E53935] text-white shadow-card'
              : 'bg-[#f0f4f2] text-[#414841]'
          }`}
        >
          <Clock className="w-4 h-4" /> Pending ({pendingPickup.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'completed'
              ? 'bg-[#E53935] text-white shadow-card'
              : 'bg-[#f0f4f2] text-[#414841]'
          }`}
        >
          <CheckCircle className="w-4 h-4" /> Completed ({completed.length})
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="mb-2 border-0 shadow-card rounded-2xl">
            <CardContent className="p-4"><Skeleton className="h-14 w-full rounded-xl" /></CardContent>
          </Card>
        ))
      ) : activeTab === 'pending' ? (
        pendingPickup.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
            <p className="text-sm text-[#717971]">No pending pickups</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingPickup.map((order) => (
              <Card key={order.id} className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4 flex justify-between items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-[#1a1c1e] truncate">#{order.orderNumber}</p>
                    <p className="text-xs text-[#414841]">RM{order.totalPrice.toFixed(2)} • Qty: {order.quantity}</p>
                    <p className="text-[10px] text-[#717971] mt-0.5">
                      Pickup by: {parseDbDate(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg text-xs">Pending</Badge>
                    <Button
                      size="sm"
                      onClick={() => quickScan(order)}
                      className="h-8 px-3 rounded-lg text-xs font-bold bg-[#E53935] text-white hover:bg-[#C62828]"
                    >
                      <QrCode className="w-3 h-3 mr-1" /> Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : completed.length === 0 ? (
        <div className="text-center py-10">
          <CheckCircle className="w-12 h-12 text-[#c1c9c0] mx-auto mb-3" />
          <p className="text-sm text-[#717971]">No completed orders yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {completed.map((order) => (
            <Card key={order.id} className="border-0 shadow-card rounded-xl">
              <CardContent className="p-2.5">
                <div className="flex gap-2.5 items-center">
                  {/* Thumbnail — compact */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#f0f4f2]">
                    {order.deal?.imageUrl ? (
                      <Image
                        src={order.deal.imageUrl}
                        alt={order.deal?.title || 'Deal'}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Utensils className="w-4 h-4 text-[#EF5350]" />
                      </div>
                    )}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {/* Deal name above order ID */}
                    <p className="text-xs font-bold text-[#1a1c1e] truncate">{order.deal?.title || 'Deal'}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-[#717971] font-mono truncate">#{order.orderNumber}</p>
                      <Badge className="bg-[#EF5350]/10 text-[#E53935] border-0 rounded text-[8px] h-3.5 px-1">Done</Badge>
                    </div>
                    {/* Timestamps — compact */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[9px] text-[#717971] flex items-center gap-0.5">
                        <Zap className="w-2 h-2 text-[#E53935]" />
                        {parseDbDate(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-[9px] text-[#717971] flex items-center gap-0.5">
                        <ScanLine className="w-2 h-2 text-[#E53935]" />
                        Redeemed: {order.qrVerifiedAt
                          ? parseDbDate(order.qrVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : parseDbDate(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                      </p>
                    </div>
                  </div>
                  {/* Price right-center */}
                  <div className="flex-shrink-0 flex flex-col items-end justify-center">
                    <p className="text-xs font-extrabold text-[#E53935]">RM{order.dealPrice.toFixed(2)}</p>
                    {order.originalPrice > order.dealPrice && (
                      <p className="text-[9px] text-[#EF4444] line-through">RM{order.originalPrice.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ===== Scan Result Modal ===== */}
      <Dialog open={!!scanResult} onOpenChange={() => setScanResult(null)}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[85vh] overflow-y-auto p-0">
          {scanResult && (
            <>
              <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
                <DialogHeader>
                  <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">Order Found</DialogTitle>
                  <DialogDescription className="text-[#414841] text-xs">
                    Verify order details before completing
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Order Number & Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#717971]">Order</p>
                    <p className="font-bold text-[#1a1c1e]">#{scanResult.order.orderNumber}</p>
                  </div>
                  <Badge className={`border-0 rounded-lg text-xs ${
                    scanResult.order.status === 'pending_pickup'
                      ? 'bg-[#E53935]/10 text-[#E53935]'
                      : 'bg-[#EF5350]/10 text-[#E53935]'
                  }`}>
                    {scanResult.order.status === 'pending_pickup' ? 'Pending Pickup' : scanResult.order.status}
                  </Badge>
                </div>

                {/* Deal Info */}
                {scanResult.deal && (
                  <div className="bg-[#f0f4f2] rounded-xl p-3">
                    <p className="font-bold text-sm text-[#1a1c1e]">{scanResult.deal.title}</p>
                    {scanResult.deal.category && (
                      <Badge className="mt-1 bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg text-[10px]">
                        {scanResult.deal.category}
                      </Badge>
                    )}
                    {scanResult.deal.pickupInstructions && (
                      <p className="text-xs text-[#414841] mt-2">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {scanResult.deal.pickupInstructions}
                      </p>
                    )}
                  </div>
                )}

                {/* Pricing Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Original</p>
                    <p className="font-bold text-[#1a1c1e] line-through">
                      RM{(scanResult.deal?.originalPrice || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#E53935]">
                      RM{(scanResult.deal?.dealPrice || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Order Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2 text-center">
                    <p className="text-[#717971]">Quantity</p>
                    <p className="font-bold text-[#1a1c1e]">{scanResult.order.quantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2 text-center">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#E53935]">RM{scanResult.order.totalPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Pickup Deadline */}
                <div className="flex items-center gap-2 text-sm text-[#414841]">
                  <Clock className="w-4 h-4 text-[#E53935]" />
                  Pickup by: {parseDbDate(scanResult.order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                {/* Actions */}
                {scanResult.canComplete ? (
                  <Button
                    onClick={handleComplete}
                    disabled={completing}
                    className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
                  >
                    {completing ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 mr-1.5" /> Complete Order
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="bg-[#717971]/10 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-[#717971]">This order cannot be completed</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Completion Confirmation Modal ===== */}
      <Dialog open={!!completedOrder} onOpenChange={() => setCompletedOrder(null)}>
        <DialogContent className="rounded-2xl max-w-sm p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Order Completed</DialogTitle>
            <DialogDescription>The order has been successfully completed</DialogDescription>
          </DialogHeader>
          {completedOrder && (
            <div className="p-6 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-16 h-16 rounded-full bg-[#E53935]/20 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-8 h-8 text-[#E53935]" />
              </motion.div>
              <h3 className="text-xl font-extrabold text-[#1a1c1e]">Order Completed!</h3>
              <p className="text-sm text-[#414841] mt-2">
                Order #{completedOrder.orderNumber} has been picked up successfully.
              </p>
              {completedOrder.dealTitle && (
                <p className="text-sm text-[#E53935] font-bold mt-1">{completedOrder.dealTitle}</p>
              )}
              <p className="text-lg font-extrabold text-[#1a1c1e] mt-2">RM{completedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs text-[#717971] mt-1">
                Completed at {parseDbDate(completedOrder.completedAt).toLocaleTimeString()}
              </p>
              <Button
                onClick={() => setCompletedOrder(null)}
                className="mt-4 w-full h-11 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white"
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
        <Card className="border-0 shadow-card rounded-2xl mb-5 bg-gradient-to-br from-[#E53935] to-[#C62828]">
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
        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_basic' ? 'ring-2 ring-[#E53935]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-[#1a1c1e]">Basic</h3>
                <p className="text-2xl font-extrabold text-[#E53935]">RM99<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_basic' && (
                <Badge className="bg-[#E53935] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Unlimited flash deals</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Inventory management</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> QR fulfillment</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Basic statistics</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_basic' && (
              <Button onClick={() => handleActivate('vendor_basic')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white">
                {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Choose Basic'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_premium' ? 'ring-2 ring-[#E53935]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-[#1a1c1e]">Premium</h3>
                  <Sparkles className="w-4 h-4 text-[#E53935]" />
                </div>
                <p className="text-2xl font-extrabold text-[#E53935]">RM199<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_premium' && (
                <Badge className="bg-[#E53935] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Everything in Basic</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Advanced analytics</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Priority ranking</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#EF5350]" /> Marketing tools</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#717971]" /> Siren Push (coming)</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#717971]" /> Auto-Drop (coming)</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_premium' && (
              <Button onClick={() => handleActivate('vendor_premium')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#E53935] to-[#E53935] text-white">
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
// VENDOR REGISTRATION VIEW
// ============================================
function VendorRegistrationView() {
  const { goBack, navigate } = useAppStore()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    businessName: '',
    description: '',
    contactEmail: user?.email || '',
    contactPhone: user?.phone || '',
    address: '',
    latitude: '3.1390',
    longitude: '101.6869',
    foodCategories: '[]',
  })
  // ISSUE 5 (fix-logout-theme-nearme): Auto-Generate Description state.
  // Tracks the id of the last-used template so the "RE-generate" button
  // always produces different copy.
  const [lastTemplateId, setLastTemplateId] = useState<string | undefined>(undefined)
  const [generatingDesc, setGeneratingDesc] = useState(false)

  // ISSUE 5: build a description from a randomly-picked template, filling in
  // [Vendor Name], [Category], [City], [State] from the current form values.
  // Empty fields leave the bracketed placeholder so the user knows to edit.
  const handleAutoGenerateDesc = useCallback(async () => {
    setGeneratingDesc(true)
    try {
      // Pull templates lazily so the vendor form bundle doesn't always pay
      // the cost. We import directly from the lib (constants only — no API
      // call needed) to keep the UX instant.
      const { pickRandomTemplate, fillTemplate, parseAddressParts } = await import('@/lib/description-templates')

      const tmpl = pickRandomTemplate(lastTemplateId)
      const { city, state } = parseAddressParts(form.address)
      // Use the first food category if available. The form stores categories
      // as a JSON string array; default to a sensible label if empty.
      let category = ''
      try {
        const arr = JSON.parse(form.foodCategories || '[]')
        if (Array.isArray(arr) && arr.length > 0) {
          category = String(arr[0])
        }
      } catch {
        // ignore — leave category empty
      }

      const filled = fillTemplate(tmpl, {
        vendorName: form.businessName,
        category,
        city,
        state,
      })

      setForm(prev => ({ ...prev, description: filled }))
      setLastTemplateId(tmpl.id)
      toast.success('Description generated — review and edit before saving.')
    } catch (err) {
      console.error('[VendorRegistrationView] auto-generate failed:', err)
      toast.error('Could not generate description — please try again.')
    } finally {
      setGeneratingDesc(false)
    }
  }, [form.businessName, form.address, form.foodCategories, lastTemplateId])

  const handleSubmit = async () => {
    if (!form.businessName || !form.contactEmail || !form.contactPhone || !form.address) {
      toast.error('Please fill in all required fields')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<Vendor>('/api/vendors', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          foodCategories: ['Malay', 'Chinese', 'Indian'],
        }),
      })
      if (res.success) {
        toast.success('Vendor profile created! Your account is pending approval.')
        // Refresh user data to get the vendor role
        const meRes = await apiFetch<AuthUser>('/api/auth/me')
        if (meRes.success && meRes.data) {
          // Update auth store with new roles
          const { useAuthStore: getAuthStore } = await import('@/stores/auth-store')
          getAuthStore.getState().login(meRes.data)
        }
        navigate('profile')
      } else {
        toast.error(res.error || 'Failed to create vendor profile')
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
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Become a Vendor</h1>
      </div>

      <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-[#E53935] flex items-center justify-center">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-[#1a1c1e]">Start Selling on SnapJe</h2>
            <p className="text-xs text-[#414841]">Turn unsold meals into revenue</p>
          </div>
        </div>
        <p className="text-sm text-[#414841]">
          Fill in your business details below. Your account will be reviewed before you can start posting deals.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="font-semibold text-[#1a1c1e]">Business Name *</Label>
          <Input value={form.businessName} onChange={(e) => setForm({...form, businessName: e.target.value})} placeholder="e.g. Kak Roti Corner" className="mt-1.5 h-12 rounded-xl" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-[#1a1c1e]">Description</Label>
            {/* ISSUE 5: Auto-Generate Description button. Picks a random
                template, fills in [Vendor Name]/[Category]/[City]/[State]
                from the current form, and writes the result into the
                description textarea. Button label flips to "RE-generate"
                once a template has been used. */}
            <button
              type="button"
              onClick={handleAutoGenerateDesc}
              disabled={generatingDesc}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2] hover:bg-[#FFCDD2] active:scale-95 transition-all disabled:opacity-50"
              title="Auto-generate a vendor description from a template"
            >
              {generatingDesc ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {lastTemplateId ? 'RE-generate desc.' : 'Auto Generate Desc.'}
            </button>
          </div>
          <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Tell customers about your food..." className="mt-1.5 rounded-xl min-h-[80px]" />
          {lastTemplateId && (
            <p className="text-[11px] text-[#717971] mt-1">
              Tip: edit any leftover [bracketed] placeholders before saving.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Contact Email *</Label>
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm({...form, contactEmail: e.target.value})} placeholder="your@business.com" className="mt-1.5 h-12 rounded-xl" />
          </div>
          <div>
            <Label className="font-semibold text-[#1a1c1e]">Contact Phone *</Label>
            <Input value={form.contactPhone} onChange={(e) => setForm({...form, contactPhone: e.target.value})} placeholder="+60 12 345 6789" className="mt-1.5 h-12 rounded-xl" />
          </div>
        </div>
        <div>
          <Label className="font-semibold text-[#1a1c1e]">Shop Location *</Label>
          <p className="text-xs text-[#717971] mt-0.5 mb-2">Search your address or drag the pin on the map to set your exact shop location.</p>
          <LocationPicker
            value={{ latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude) }}
            onChange={(lat, lng) => setForm(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }))}
            address={form.address}
            onAddressChange={(addr) => setForm(prev => ({ ...prev, address: addr }))}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>
            <Store className="w-5 h-5 mr-1.5" /> Register as Vendor
          </>}
        </Button>
      </div>
    </div>
  )
}

// ============================================
// ADMIN: DASHBOARD VIEW
// ============================================
function AdminDashboardView() {
  const { navigate } = useAppStore()
  const { user } = useAuthStore()
  const [analytics, setAnalytics] = useState<{ overview: Record<string, number>; dealsByStatus: Record<string, number>; ordersByStatus: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // ISSUE 4 (fix-logout-theme-nearme): wrap in try/catch + .catch so a
    // failed /api/admin/analytics (e.g. after logout, or a 500) doesn't
    // crash the dashboard to a white screen — toast + fall through to the
    // empty state below.
    apiFetch<Record<string, unknown>>('/api/admin/analytics').then((res) => {
      if (res.success && res.data) {
        setAnalytics(res.data as typeof analytics)
      } else if (!res.success) {
        toast.error(res.error || 'Failed to load admin analytics')
      }
    }).catch((err) => {
      console.error('[AdminDashboardView] analytics fetch failed:', err)
      toast.error('Failed to load admin analytics — please retry')
    }).finally(() => setLoading(false))
  }, [])

  // ISSUE 4: defensive null-user guard. After logout the ViewRouter may
  // briefly render AdminDashboardView before the activeRole flips back to
  // 'foodie'. Show a friendly sign-in prompt instead of crashing.
  if (!user) {
    return (
      <div className="pb-28 px-5 pt-2">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e] mb-4">Admin Dashboard</h1>
        <div className="text-center py-16">
          <Shield className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">Sign in to view the admin dashboard</h3>
          <p className="text-sm text-[#414841] mt-1">Manage vendors, users, and platform analytics</p>
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold text-[#1a1c1e]">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => navigate('profile')} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors" aria-label="Account">
            <User className="w-5 h-5 text-[#E53935]" />
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
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('users')}>
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 text-[#E53935] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Users</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalUsers as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('vendors')}>
              <CardContent className="p-4 text-center">
                <Store className="w-6 h-6 text-[#EF5350] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Vendors</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalVendors as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('admin-deals')}>
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#E53935] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Active Deals</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.dealsByStatus as Record<string, number>)?.active || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('analytics')}>
              <CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 text-[#4A6A8A] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Orders</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalOrders as number) || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Nav */}
          <div className="space-y-2">
            {[
              { icon: Store, label: 'Vendor Management', view: 'vendors' as AppView, color: 'text-[#EF5350]' },
              { icon: Users, label: 'User Management', view: 'users' as AppView, color: 'text-[#E53935]' },
              { icon: BarChart3, label: 'Analytics', view: 'analytics' as AppView, color: 'text-[#E53935]' },
              { icon: Camera, label: 'Upload Settings', view: 'upload-settings' as AppView, color: 'text-[#EF5350]' },
              { icon: ImageIcon, label: 'Media Settings', view: 'media' as AppView, color: 'text-[#E53935]' },
              { icon: Megaphone, label: 'Broadcast Log', view: 'broadcast-log' as AppView, color: 'text-amber-600' },
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
// ADMIN: DEALS VIEW (Active Deals)
// ============================================
function AdminDealsView() {
  const { goBack } = useAppStore()
  const [deals, setDeals] = useState<(Deal & { vendor?: { businessName: string; address: string; contactEmail: string; verificationStatus: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedDeal, setSelectedDeal] = useState<(Deal & { vendor?: { businessName: string; address: string; contactEmail: string; verificationStatus: string } }) | null>(null)

  const pageSize = 20

  const fetchDeals = useCallback((p: number) => {
    setLoading(true)
    apiFetch<{ deals: Deal[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/deals?status=active&page=${p}&pageSize=${pageSize}`).then((res) => {
      if (res.success && res.data) {
        setDeals(res.data.deals || [])
        setTotal(res.data.total || 0)
        setTotalPages(res.data.totalPages || 1)
        setPage(p)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDeals(1) }, [fetchDeals])

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1c1e]">Active Deals</h1>
          <p className="text-xs text-[#717971]">{total} deals total</p>
        </div>
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg mb-2" />)
      ) : deals.length === 0 ? (
        <div className="text-center py-16">
          <Flame className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">No active deals</h3>
          <p className="text-sm text-[#414841] mt-1">Check back later for new deals</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {deals.map((deal) => (
              <motion.div
                key={deal.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedDeal(deal)}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-3 p-3 bg-white shadow-card rounded-xl hover:shadow-card-hover transition-shadow">
                  <div className="w-10 h-10 rounded-lg bg-[#E53935]/10 flex items-center justify-center flex-shrink-0">
                    <Flame className="w-5 h-5 text-[#E53935]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#1a1c1e] truncate">{deal.title}</p>
                    <p className="text-[11px] text-[#717971] truncate">
                      {deal.vendor?.businessName || 'Unknown Vendor'} • RM{deal.dealPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                    <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-md text-[10px] px-1.5 py-0">
                      -{deal.discountPercent}%
                    </Badge>
                    <span className="text-[10px] text-[#717971]">{deal.availableQuantity} left</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => fetchDeals(page - 1)}
                className="h-8 px-3 rounded-lg text-xs"
              >
                Previous
              </Button>
              <span className="text-xs text-[#717971] font-medium">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => fetchDeals(page + 1)}
                className="h-8 px-3 rounded-lg text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Deal Detail Modal */}
      <Dialog open={!!selectedDeal} onOpenChange={() => setSelectedDeal(null)}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[85vh] overflow-y-auto p-0">
          {selectedDeal && (
            <>
              <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
                <DialogHeader>
                  <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">{selectedDeal.title}</DialogTitle>
                  <DialogDescription className="text-[#414841] text-xs">
                    Deal Details • {selectedDeal.category}
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Status & Discount */}
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#EF5350]/10 text-[#E53935] border-0 rounded-lg text-xs">Active</Badge>
                  <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-lg text-xs">-{selectedDeal.discountPercent}%</Badge>
                </div>

                {/* Description */}
                <p className="text-sm text-[#414841]">{selectedDeal.description}</p>

                {/* Vendor Info */}
                {selectedDeal.vendor && (
                  <div className="bg-[#f0f4f2] rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-bold text-[#1a1c1e] flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#E53935]" /> Vendor Details
                    </p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Name:</span> {selectedDeal.vendor.businessName}</p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Address:</span> {selectedDeal.vendor.address}</p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Email:</span> {selectedDeal.vendor.contactEmail}</p>
                    <Badge className={`border-0 rounded-md text-[10px] px-1.5 py-0 ${
                      selectedDeal.vendor.verificationStatus === 'approved' ? 'bg-[#EF5350]/10 text-[#E53935]' :
                      selectedDeal.vendor.verificationStatus === 'pending' ? 'bg-[#E53935]/10 text-[#E53935]' :
                      'bg-[#717971]/10 text-[#717971]'
                    }`}>
                      {selectedDeal.vendor.verificationStatus}
                    </Badge>
                  </div>
                )}

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Original</p>
                    <p className="font-bold text-[#1a1c1e] line-through">RM{selectedDeal.originalPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#E53935]">RM{selectedDeal.dealPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Inventory */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{selectedDeal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#EF5350]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#E53935]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Left</p>
                    <p className="font-bold text-[#E53935]">{selectedDeal.availableQuantity}</p>
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#414841]">
                    <Timer className="w-4 h-4 text-[#E53935]" />
                    Expires: {parseDbDate(selectedDeal.expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#414841]">
                    <Clock className="w-4 h-4 text-[#E53935]" />
                    Created: {parseDbDate(selectedDeal.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [editForm, setEditForm] = useState({
    businessName: '', description: '', contactEmail: '', contactPhone: '',
    address: '', verificationStatus: 'pending', rejectionReason: '',
  })
  const [saving, setSaving] = useState(false)

  const pageSize = 20

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchVendors = useCallback((p: number, f: string, s: string) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (f === 'new') {
      // New filter: registered within 3 days - we'll filter client-side
    } else if (f !== 'all') {
      params.set('status', f)
    }
    if (s) params.set('search', s)
    apiFetch<{ vendors: Vendor[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/admin/vendors?${params}`).then((res) => {
      if (res.success && res.data) {
        let vList = res.data.vendors || []
        // Client-side "new" filter
        if (f === 'new') {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          vList = vList.filter((v) => parseDbDate(v.createdAt) >= threeDaysAgo)
        }
        setVendors(vList)
        setTotal(res.data.total || 0)
        setTotalPages(res.data.totalPages || 1)
        setPage(p)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchVendors(1, filter, debouncedSearch) }, [filter, debouncedSearch, fetchVendors])

  const handleAction = async (vendorId: string, action: string, reason?: string) => {
    const res = await apiFetch(`/api/admin/vendors/${vendorId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    })
    if (res.success) {
      toast.success(`Vendor ${action} successful`)
      fetchVendors(page, filter, debouncedSearch)
    } else {
      toast.error(res.error || 'Action failed')
    }
  }

  const openEditModal = (v: Vendor) => {
    setEditForm({
      businessName: v.businessName,
      description: v.description || '',
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      address: v.address,
      verificationStatus: v.verificationStatus,
      rejectionReason: v.rejectionReason || '',
    })
    setEditVendor(v)
  }

  const handleSaveEdit = async () => {
    if (!editVendor) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/admin/vendors/${editVendor.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      })
      if (res.success) {
        toast.success('Vendor updated successfully!')
        setEditVendor(null)
        fetchVendors(page, filter, debouncedSearch)
      } else {
        toast.error(res.error || 'Failed to update vendor')
      }
    } finally {
      setSaving(false)
    }
  }

  const filterTabs = ['new', 'all', 'pending', 'approved', 'rejected', 'suspended']

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1c1e]">Vendor Management</h1>
          <p className="text-xs text-[#717971]">{total} vendors</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717971]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors..." className="pl-9 h-10 rounded-xl text-sm" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {filterTabs.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize flex-shrink-0 transition-all ${
              filter === f ? 'bg-[#E53935] text-white' : 'bg-[#e8edea] text-[#414841]'
            }`}
          >
            {f === 'new' ? '🆕 New' : f}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg mb-2" />)
      ) : vendors.length === 0 ? (
        <p className="text-sm text-[#717971] text-center py-8">No vendors found</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {vendors.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2.5 p-2.5 bg-white shadow-card rounded-lg hover:shadow-card-hover transition-shadow"
              >
                <div className="w-8 h-8 rounded-lg bg-[#EF5350]/10 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-[#EF5350]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-xs text-[#1a1c1e] truncate">{v.businessName}</p>
                    <Badge className={`border-0 rounded-md text-[9px] px-1 py-0 flex-shrink-0 ${
                      v.verificationStatus === 'approved' ? 'bg-[#EF5350]/10 text-[#E53935]' :
                      v.verificationStatus === 'pending' ? 'bg-[#E53935]/10 text-[#E53935]' :
                      v.verificationStatus === 'rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                      'bg-[#717971]/10 text-[#717971]'
                    }`}>
                      {v.verificationStatus}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-[#717971] truncate">{v.contactEmail} • {v.address}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {v.verificationStatus === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => handleAction(v.id, 'approve')} className="h-7 px-2 rounded-lg bg-[#EF5350] hover:bg-[#E53935] text-white text-[10px] font-bold">
                        ✓
                      </Button>
                      <Button size="sm" onClick={() => handleAction(v.id, 'reject', 'Does not meet requirements')} variant="outline" className="h-7 px-2 rounded-lg text-[10px] font-bold text-[#EF4444] border-[#EF4444]/30">
                        ✗
                      </Button>
                    </>
                  )}
                  {v.verificationStatus === 'suspended' && (
                    <Button size="sm" onClick={() => handleAction(v.id, 'restore')} className="h-7 px-2 rounded-lg text-[10px] font-bold bg-[#E53935] text-white">
                      ↻
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(v)}
                    className="h-7 px-2 rounded-lg text-[10px] font-bold border-[#E53935]/30 text-[#E53935] hover:bg-[#E53935]/10"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchVendors(page - 1, filter, debouncedSearch)} className="h-8 px-3 rounded-lg text-xs">Prev</Button>
              <span className="text-xs text-[#717971] font-medium">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchVendors(page + 1, filter, debouncedSearch)} className="h-8 px-3 rounded-lg text-xs">Next</Button>
            </div>
          )}
        </>
      )}

      {/* Edit Vendor Modal */}
      <Dialog open={!!editVendor} onOpenChange={() => setEditVendor(null)}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[85vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">Edit Vendor</DialogTitle>
              <DialogDescription className="text-[#414841] text-xs">
                {editVendor?.businessName}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 pb-5 space-y-3">
            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Business Name</Label>
              <Input value={editForm.businessName} onChange={(e) => setEditForm({...editForm, businessName: e.target.value})} className="mt-1 h-10 rounded-xl text-sm" />
            </div>
            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="mt-1 rounded-xl min-h-[60px] text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-semibold text-[#1a1c1e] text-sm">Contact Email</Label>
                <Input value={editForm.contactEmail} onChange={(e) => setEditForm({...editForm, contactEmail: e.target.value})} className="mt-1 h-10 rounded-xl text-sm" />
              </div>
              <div>
                <Label className="font-semibold text-[#1a1c1e] text-sm">Contact Phone</Label>
                <Input value={editForm.contactPhone} onChange={(e) => setEditForm({...editForm, contactPhone: e.target.value})} className="mt-1 h-10 rounded-xl text-sm" />
              </div>
            </div>
            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Address</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm({...editForm, address: e.target.value})} className="mt-1 h-10 rounded-xl text-sm" />
            </div>
            <div>
              <Label className="font-semibold text-[#1a1c1e] text-sm">Verification Status</Label>
              <Select value={editForm.verificationStatus} onValueChange={(v) => setEditForm({...editForm, verificationStatus: v})}>
                <SelectTrigger className="h-10 rounded-xl mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">⏳ Pending</SelectItem>
                  <SelectItem value="approved">✅ Approved</SelectItem>
                  <SelectItem value="rejected">❌ Rejected</SelectItem>
                  <SelectItem value="suspended">🚫 Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(editForm.verificationStatus === 'rejected' || editForm.verificationStatus === 'suspended') && (
              <div>
                <Label className="font-semibold text-[#1a1c1e] text-sm">Rejection / Suspension Reason</Label>
                <Input value={editForm.rejectionReason} onChange={(e) => setEditForm({...editForm, rejectionReason: e.target.value})} placeholder="Enter reason..." className="mt-1 h-10 rounded-xl text-sm" />
              </div>
            )}
            {/* Suspend button inside edit modal */}
            {editVendor?.verificationStatus === 'approved' && editForm.verificationStatus !== 'suspended' && (
              <Button
                variant="outline"
                onClick={() => setEditForm({...editForm, verificationStatus: 'suspended', rejectionReason: 'Policy violation'})}
                className="w-full h-10 rounded-xl text-sm font-bold text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
              >
                <Ban className="w-4 h-4 mr-1.5" /> Suspend Vendor
              </Button>
            )}
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="w-full h-11 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  // User edit modal state — admin can toggle vipFlag/isBanned, edit roles, and
  // set activeRole. PATCH /api/admin/users updates the DB.
  const [editUser, setEditUser] = useState<AuthUser | null>(null)
  const [editVipFlag, setEditVipFlag] = useState(false)
  const [editIsBanned, setEditIsBanned] = useState(false)
  const [editRoles, setEditRoles] = useState('foodie')
  const [editActiveRole, setEditActiveRole] = useState('foodie')
  const [savingEdit, setSavingEdit] = useState(false)

  const pageSize = 20

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchUsers = useCallback((p: number, s: string) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (s) params.set('search', s)
    apiFetch<{ users: AuthUser[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/admin/users?${params}`).then((res) => {
      if (res.success && res.data) {
        setUsers(res.data.users || [])
        setTotal(res.data.total || 0)
        setTotalPages(res.data.totalPages || 1)
        setPage(p)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers(1, debouncedSearch) }, [debouncedSearch, fetchUsers])

  // Open the edit modal seeded from the clicked user row.
  const openEditModal = (u: AuthUser) => {
    const rolesList = Array.isArray(u.roles) ? u.roles : []
    setEditUser(u)
    setEditVipFlag(!!(u as AuthUser & { vipFlag?: boolean }).vipFlag)
    setEditIsBanned(!!(u as AuthUser & { isBanned?: boolean }).isBanned)
    setEditRoles(rolesList.length > 0 ? rolesList.join(',') : 'foodie')
    setEditActiveRole(u.activeRole || 'foodie')
  }

  // Save the edited user fields via PATCH /api/admin/users.
  const handleSaveEdit = async () => {
    if (!editUser) return
    setSavingEdit(true)
    try {
      const res = await apiFetch<AuthUser>('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editUser.id,
          vipFlag: editVipFlag,
          isBanned: editIsBanned,
          roles: editRoles,
          activeRole: editActiveRole,
        }),
      })
      if (res.success) {
        toast.success('User updated successfully')
        // Replace the edited user in the local list so the UI updates
        // immediately without a refetch. Extract to a local so TS narrows the
        // type inside the .map closure.
        const updated = res.data
        if (updated) {
          setUsers(prev => prev.map(u => (u.id === editUser.id ? updated : u)))
        }
        setEditUser(null)
      } else {
        toast.error(res.error || 'Failed to update user')
      }
    } finally {
      setSavingEdit(false)
    }
  }

  // Client-side filter for "new" (registered within 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const filteredUsers = filter === 'new'
    ? users.filter(u => (u as AuthUser & { createdAt?: string }).createdAt && parseDbDate((u as AuthUser & { createdAt?: string }).createdAt!) >= threeDaysAgo)
    : users

  // Safely parse roles - handles both string and array
  const getRoles = (roles: string[] | string): string[] => {
    if (Array.isArray(roles)) return roles
    if (typeof roles === 'string') return roles.split(',').map(r => r.trim()).filter(Boolean)
    return []
  }

  const filterTabs = ['new', 'all']

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1c1e]">User Management</h1>
          <p className="text-xs text-[#717971]">{total} users</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717971]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="pl-9 h-10 rounded-xl text-sm" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {filterTabs.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize flex-shrink-0 transition-all ${
              filter === f ? 'bg-[#E53935] text-white' : 'bg-[#e8edea] text-[#414841]'
            }`}
          >
            {f === 'new' ? '🆕 New' : f}
          </button>
        ))}
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg mb-2" />)
      ) : filteredUsers.length === 0 ? (
        <p className="text-sm text-[#717971] text-center py-8">No users found</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {filteredUsers.map((u) => {
              const userWithDate = u as AuthUser & { createdAt?: string; vipFlag?: boolean; isBanned?: boolean }
              const isNew = userWithDate.createdAt && parseDbDate(userWithDate.createdAt) >= threeDaysAgo
              const isVip = !!userWithDate.vipFlag
              const isBanned = !!userWithDate.isBanned
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-2.5 p-2.5 bg-white shadow-card rounded-lg"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#E53935]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#E53935]">{u.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-xs text-[#1a1c1e] truncate">{u.name}</p>
                      {isNew && (
                        <span className="text-[8px] font-bold text-[#E53935] bg-[#E53935]/10 px-1 py-0 rounded">NEW</span>
                      )}
                      {isVip && (
                        <span className="text-[8px] font-bold text-amber-700 bg-amber-200 px-1 py-0 rounded" title="VIP vendor">VIP</span>
                      )}
                      {isBanned && (
                        <span className="text-[8px] font-bold text-white bg-[#EF4444] px-1 py-0 rounded" title="Banned">BAN</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#717971] truncate">{u.email}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 items-center">
                    {getRoles(u.roles).map((r) => (
                      <Badge key={r} className="bg-[#e8edea] text-[#E53935] border-0 rounded-md text-[9px] px-1 py-0">
                        {r}
                      </Badge>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(u)}
                      className="h-7 w-7 p-0 rounded-lg border-[#E53935]/30 text-[#E53935] hover:bg-[#E53935]/10"
                      aria-label={`Edit ${u.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchUsers(page - 1, debouncedSearch)} className="h-8 px-3 rounded-lg text-xs">Prev</Button>
              <span className="text-xs text-[#717971] font-medium">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchUsers(page + 1, debouncedSearch)} className="h-8 px-3 rounded-lg text-xs">Next</Button>
            </div>
          )}
        </>
      )}

      {/* ===== User Edit Modal ===== */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null) }}>
        <DialogContent className="rounded-2xl max-w-sm p-0">
          {editUser && (
            <>
              <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-5 pt-5 pb-3">
                <DialogHeader>
                  <DialogTitle className="text-lg font-extrabold text-[#1a1c1e]">Edit User</DialogTitle>
                  <DialogDescription className="text-[#414841] text-xs truncate">
                    {editUser.name} &lt;{editUser.email}&gt;
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* VIP Flag */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-bold text-[#1a1c1e]">VIP Flag</p>
                      <p className="text-[10px] text-[#717971]">Enables Broadcast Deal button</p>
                    </div>
                  </div>
                  <Switch checked={editVipFlag} onCheckedChange={setEditVipFlag} />
                </div>

                {/* Banned */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#EF4444]/5 border border-[#EF4444]/20">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-[#EF4444]" />
                    <div>
                      <p className="text-sm font-bold text-[#1a1c1e]">Banned</p>
                      <p className="text-[10px] text-[#717971]">Suspends account access</p>
                    </div>
                  </div>
                  <Switch checked={editIsBanned} onCheckedChange={setEditIsBanned} />
                </div>

                {/* Roles (editable as comma-separated text) */}
                <div>
                  <Label htmlFor="edit-roles" className="text-xs font-semibold text-[#1a1c1e] mb-1.5 block">
                    Roles <span className="text-[#717971] font-normal">(comma-separated: foodie, vendor, admin)</span>
                  </Label>
                  <Input
                    id="edit-roles"
                    value={editRoles}
                    onChange={(e) => setEditRoles(e.target.value)}
                    placeholder="foodie,vendor"
                    className="h-10 rounded-xl text-sm"
                  />
                </div>

                {/* Active Role dropdown */}
                <div>
                  <Label htmlFor="edit-active-role" className="text-xs font-semibold text-[#1a1c1e] mb-1.5 block">
                    Active Role
                  </Label>
                  <Select value={editActiveRole} onValueChange={setEditActiveRole}>
                    <SelectTrigger id="edit-active-role" className="h-10 rounded-xl">
                      <SelectValue placeholder="Select active role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foodie">foodie</SelectItem>
                      <SelectItem value="vendor">vendor</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditUser(null)}
                    disabled={savingEdit}
                    className="flex-1 h-11 rounded-xl text-sm font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="flex-1 h-11 rounded-xl text-sm font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white hover:opacity-90 active:scale-95 transition-all"
                  >
                    {savingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Simple CSS bar chart component (defined outside render)
function AdminBarChart({ data, label, color }: { data: { date: string; count: number }[]; label: string; color: string }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="bg-white shadow-card rounded-xl p-4">
      <p className="font-bold text-sm text-[#1a1c1e] mb-3">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[8px] text-[#717971] font-bold">{d.count || ''}</span>
            <div
              className="w-full rounded-t-sm transition-all duration-300"
              style={{
                height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 8 : 2)}%`,
                backgroundColor: color,
                opacity: d.count > 0 ? 1 : 0.2,
              }}
            />
            <span className="text-[7px] text-[#717971]">
              {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// ADMIN: ANALYTICS VIEW
// ============================================
function AdminAnalyticsView() {
  const { goBack } = useAppStore()
  const [analytics, setAnalytics] = useState<{
    overview: Record<string, number>
    dealsByStatus: Record<string, number>
    ordersByStatus: Record<string, number>
    historical?: { dailyDeals: { date: string; count: number }[]; dailyOrders: { date: string; count: number }[] }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // ISSUE 4: defensive .catch so a failed analytics fetch surfaces a toast
    // instead of an "Internal Error" white screen.
    apiFetch<Record<string, unknown>>('/api/admin/analytics').then((res) => {
      if (res.success && res.data) {
        setAnalytics(res.data as typeof analytics)
      } else if (!res.success) {
        toast.error(res.error || 'Failed to load analytics')
      }
    }).catch((err) => {
      console.error('[AdminAnalyticsView] fetch failed:', err)
      toast.error('Failed to load analytics — please retry')
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compact Stats Grid - 2 columns */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Users', value: analytics?.overview?.totalUsers || 0, icon: Users, color: 'text-[#E53935]', bg: 'bg-[#E53935]/10' },
              { label: 'Total Vendors', value: analytics?.overview?.totalVendors || 0, icon: Store, color: 'text-[#EF5350]', bg: 'bg-[#EF5350]/10' },
              { label: 'Active Deals', value: (analytics?.dealsByStatus as Record<string, number>)?.active || 0, icon: Flame, color: 'text-[#E53935]', bg: 'bg-[#E53935]/10' },
              { label: 'Total Orders', value: analytics?.overview?.totalOrders || 0, icon: ShoppingBag, color: 'text-[#4A6A8A]', bg: 'bg-[#4A6A8A]/10' },
              { label: 'Total Revenue', value: `RM${(analytics?.overview?.totalRevenue || 0).toFixed(0)}`, icon: DollarSign, color: 'text-[#E53935]', bg: 'bg-[#E53935]/10' },
              { label: 'Meals Saved', value: analytics?.overview?.totalOrders || 0, icon: Heart, color: 'text-[#EF5350]', bg: 'bg-[#EF5350]/10' },
            ].map((item) => (
              <div key={item.label} className="bg-white shadow-card rounded-xl p-3 flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#717971]">{item.label}</p>
                  <p className="text-base font-extrabold text-[#1a1c1e] truncate">{String(item.value)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Historical Analysis */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-[#1a1c1e]">Historical Analysis (14 days)</h3>
            {analytics?.historical?.dailyDeals && (
              <AdminBarChart data={analytics.historical.dailyDeals} label="Active Deals" color="#E53935" />
            )}
            {analytics?.historical?.dailyOrders && (
              <AdminBarChart data={analytics.historical.dailyOrders} label="Total Orders" color="#E53935" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// VENDOR PUBLIC VIEW (storefront page, no auth required)
// ============================================
// localStorage key for the simple MVP subscriptions. A foodie can subscribe to
// a vendor; the list is just an array of vendor IDs.
const VENDOR_SUBSCRIPTIONS_KEY = 'snapje_vendor_subscriptions'

function readSubscribedVendorIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(VENDOR_SUBSCRIPTIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
    return []
  } catch {
    return []
  }
}

function writeSubscribedVendorIds(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VENDOR_SUBSCRIPTIONS_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

interface PublicVendorData {
  id: string
  businessName: string
  description: string | null
  address: string
  latitude: number
  longitude: number
  logoUrl: string | null
  coverImageUrl: string | null
  rating: number
  totalSales: number
  foodCategories: string
  operatingHours: string
  verificationStatus: string
  createdAt: string
  deals: Deal[]
  distance: number
}

function VendorPublicView() {
  const { viewParams, goBack, navigate, setShowAuthModal } = useAppStore()
  const { isAuthenticated } = useAuthStore()
  const [vendor, setVendor] = useState<PublicVendorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch vendor public data
  useEffect(() => {
    if (!viewParams.id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<PublicVendorData>(`/api/vendors/${viewParams.id}/public`).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setVendor(res.data)
      } else {
        setError(res.error || 'Vendor not found')
      }
    }).catch((err) => {
      console.error('[VendorPublicView] fetch failed:', err)
      if (!cancelled) setError('Failed to load vendor')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [viewParams.id])

  // Task 4: Fetch subscription status from the server when the user is
  // authenticated and the vendor id changes. Falls back to false when not
  // authenticated (the Subscribe button will prompt for sign-in).
  useEffect(() => {
    if (!viewParams.id) return
    if (!isAuthenticated) {
      setSubscribed(false)
      return
    }
    let cancelled = false
    apiFetch<{ subscribed: boolean }>(`/api/vendors/${viewParams.id}/subscription`).then((res) => {
      if (cancelled) return
      if (res.success && res.data) setSubscribed(!!res.data.subscribed)
    }).catch(() => { /* ignore — non-fatal */ })
    return () => { cancelled = true }
  }, [viewParams.id, isAuthenticated])

  const handleSubscribe = async () => {
    if (!vendor) return
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
    if (subscribed) {
      // Unsubscribe (toggle off)
      try {
        const res = await apiFetch(`/api/vendors/${vendor.id}/subscribe`, { method: 'DELETE' })
        if (res.success) {
          setSubscribed(false)
          toast.success(`Unsubscribed from ${vendor.businessName}`)
        } else {
          toast.error(res.error || 'Failed to unsubscribe')
        }
      } catch {
        toast.error('Failed to unsubscribe')
      }
    } else {
      // Subscribe
      try {
        const res = await apiFetch(`/api/vendors/${vendor.id}/subscribe`, { method: 'POST' })
        if (res.success) {
          setSubscribed(true)
          toast.success(`Subscribed to ${vendor.businessName}! 🔔`)
        } else {
          toast.error(res.error || 'Failed to subscribe')
        }
      } catch {
        toast.error('Failed to subscribe')
      }
    }
  }

  // Parse operating hours JSON.
  let operatingHours: Record<string, string> = {}
  if (vendor?.operatingHours) {
    try {
      const parsed = JSON.parse(vendor.operatingHours)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        operatingHours = parsed as Record<string, string>
      }
    } catch {
      // ignore — render as "not available"
    }
  }
  // Parse food categories JSON.
  let foodCategories: string[] = []
  if (vendor?.foodCategories) {
    try {
      const parsed = JSON.parse(vendor.foodCategories)
      if (Array.isArray(parsed)) {
        foodCategories = parsed.filter((c) => typeof c === 'string')
      }
    } catch {
      // ignore
    }
  }

  // Helper to render the deals list. Reuse DealCard by injecting the vendor
  // info so DealCard's `deal.vendor` shape is satisfied. The public API doesn't
  // join the vendor onto each deal (they all belong to the same vendor), so we
  // build a minimal vendor object here. Cast through `unknown` because the
  // DealCard prop type intersects with the full Vendor shape from the Deal
  // type, but DealCard only actually reads businessName/address/logoUrl.
  const vendorInfo = vendor
    ? ({ businessName: vendor.businessName, address: vendor.address, logoUrl: vendor.logoUrl } as unknown as Vendor)
    : undefined

  return (
    <div className="pb-28 bg-[#F4F7F6] min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e8edea] px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="p-2 -ml-1 rounded-xl hover:bg-[#e8edea]" aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-base font-bold text-[#1a1c1e] flex-1 truncate">Vendor Profile</h1>
        <Button
          onClick={handleSubscribe}
          disabled={loading || !vendor}
          className={`h-9 rounded-xl text-xs font-bold ${
            subscribed
              ? 'bg-[#f0f4f2] text-[#1a1c1e] hover:bg-[#e8edea]'
              : 'bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white'
          }`}
        >
          {subscribed ? (
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Subscribed
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" /> Subscribe
            </span>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : error ? (
        <div className="text-center py-16 px-5">
          <Store className="w-16 h-16 text-[#c1c9c0] mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">{error}</h3>
          <Button onClick={goBack} className="mt-4 bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white rounded-xl">Go Back</Button>
        </div>
      ) : vendor ? (
        <>
          {/* Cover Image */}
          <div className="relative h-40 bg-[#e8edea]">
            {vendor.coverImageUrl ? (
              <Image
                src={vendor.coverImageUrl}
                alt={vendor.businessName}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 400px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FFEBEE] to-[#F4F7F6]">
                <Store className="w-12 h-12 text-[#E53935]/30" />
              </div>
            )}
          </div>

          {/* Vendor identity block */}
          <div className="px-4 -mt-10 relative">
            <div className="flex items-end gap-3">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-card border-4 border-white overflow-hidden flex-shrink-0">
                {vendor.logoUrl ? (
                  <Image
                    src={vendor.logoUrl}
                    alt={vendor.businessName}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#FFEBEE]">
                    <span className="text-2xl font-extrabold text-[#E53935]">
                      {vendor.businessName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 pb-1 min-w-0">
                <h2 className="text-lg font-extrabold text-[#1a1c1e] truncate">{vendor.businessName}</h2>
                <div className="flex items-center gap-2 text-[11px] text-[#717971]">
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    {vendor.rating ? vendor.rating.toFixed(1) : 'New'}
                  </span>
                  <span>•</span>
                  <span>{vendor.totalSales} sold</span>
                  {vendor.verificationStatus === 'approved' && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-[#E53935] font-semibold">
                        <CheckCircle className="w-3 h-3" /> Verified
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Address + distance */}
            <div className="mt-3 flex items-start gap-2 text-xs text-[#414841]">
              <MapPin className="w-3.5 h-3.5 text-[#E53935] mt-0.5 flex-shrink-0" />
              <div>
                <p>{vendor.address}</p>
                {typeof vendor.distance === 'number' && (
                  <p className="text-[10px] text-[#717971] mt-0.5">{vendor.distance.toFixed(1)} km from default location</p>
                )}
              </div>
            </div>

            {/* Description */}
            {vendor.description && (
              <p className="text-sm text-[#414841] leading-relaxed mt-3">{vendor.description}</p>
            )}

            {/* Food categories */}
            {foodCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {foodCategories.map((c) => (
                  <span key={c} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFEBEE] text-[#C62828]">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Operating Hours */}
          <div className="px-4 mt-5">
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-[#E53935]" />
                  <h3 className="font-bold text-sm text-[#1a1c1e]">Operating Hours</h3>
                </div>
                {DAY_ORDER.every((d) => !operatingHours[d]) ? (
                  <p className="text-xs text-[#717971]">No operating hours specified.</p>
                ) : (
                  <div className="space-y-1.5">
                    {DAY_ORDER.map((day) => {
                      const hours = operatingHours[day]
                      const isClosed = !hours || hours.toLowerCase() === 'closed'
                      const isToday = new Date().getDay() === (DAY_ORDER.indexOf(day) + 1) % 7
                      return (
                        <div
                          key={day}
                          className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${
                            isToday ? 'bg-[#FFEBEE]' : ''
                          }`}
                        >
                          <span className={`font-semibold ${isToday ? 'text-[#C62828]' : 'text-[#1a1c1e]'}`}>
                            {DAY_LABELS[day]}{isToday && ' (Today)'}
                          </span>
                          <span className={isClosed ? 'text-[#717971]' : 'text-[#414841]'}>
                            {isClosed ? 'Closed' : hours}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Active Deals */}
          <div className="px-4 mt-5">
            <h3 className="font-bold text-sm text-[#1a1c1e] mb-3 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#E53935]" />
              Active Deals
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#E53935] text-white">
                {vendor.deals.length}
              </span>
            </h3>
            {vendor.deals.length === 0 ? (
              <Card className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-6 text-center">
                  <Flame className="w-10 h-10 text-[#c1c9c0] mx-auto mb-2" />
                  <p className="text-sm text-[#414841]">No active deals right now.</p>
                  <p className="text-xs text-[#717971] mt-0.5">Subscribe to be notified when new deals drop!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {vendor.deals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={{ ...deal, vendor: vendorInfo }}
                    onSelect={() => navigate('deal-detail', { id: deal.id })}
                    size="medium"
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

// ============================================
// ADMIN: BROADCAST LOG VIEW
// ============================================
interface BroadcastLogItem {
  vendorId: string | null
  dealId: string | null
  senderUserId: string | null
  title: string
  message: string
  createdAt: string
  recipients: number
  sampleId: string
  vendorName: string | null
}

function AdminBroadcastLogView() {
  const { goBack, navigate } = useAppStore()
  const [items, setItems] = useState<BroadcastLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const fetchBroadcasts = useCallback((p: number) => {
    setLoading(true)
    apiFetch<{ broadcasts: BroadcastLogItem[]; total: number; page: number; pageSize: number; totalPages: number }>(
      `/api/admin/broadcasts?page=${p}&pageSize=${pageSize}`
    ).then((res) => {
      if (res.success && res.data) {
        setItems(res.data.broadcasts || [])
        setTotal(res.data.total || 0)
        setTotalPages(res.data.totalPages || 1)
        setPage(p)
      } else if (!res.success) {
        toast.error(res.error || 'Failed to load broadcasts')
      }
    }).catch((err) => {
      console.error('[AdminBroadcastLogView] fetch failed:', err)
      toast.error('Failed to load broadcasts')
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchBroadcasts(1) }, [fetchBroadcasts])

  const fmtDate = (iso: string) => {
    try {
      return parseDbDate(iso).toLocaleString('en-MY', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1c1e]">Broadcast Log</h1>
          <p className="text-xs text-[#717971]">{total} broadcast{total === 1 ? '' : 's'} total</p>
        </div>
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-3" />)
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone className="w-16 h-16 text-[#c1c9c0] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1e]">No broadcasts yet</h3>
          <p className="text-sm text-[#414841] mt-1">Vendor broadcasts will appear here.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((b) => (
              <Card key={b.sampleId} className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Megaphone className="w-3.5 h-3.5 text-[#E53935] flex-shrink-0" />
                        <p className="font-bold text-sm text-[#1a1c1e] truncate">{b.vendorName || 'Unknown Vendor'}</p>
                      </div>
                      <p className="text-[10px] text-[#717971] mt-0.5">{fmtDate(b.createdAt)}</p>
                    </div>
                    <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded-md text-[10px] flex-shrink-0">
                      {b.recipients} recipient{b.recipients === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#414841] leading-relaxed mb-2">{b.message}</p>
                  {b.dealId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('deal-detail', { id: b.dealId! })}
                      className="h-7 rounded-lg text-[10px] font-bold border-[#E53935]/30 text-[#E53935] hover:bg-[#E53935]/10 px-2"
                    >
                      <Flame className="w-3 h-3 mr-1" /> View Deal
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchBroadcasts(page - 1)} className="h-8 px-3 rounded-lg text-xs">Prev</Button>
              <span className="text-xs text-[#717971] font-medium">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchBroadcasts(page + 1)} className="h-8 px-3 rounded-lg text-xs">Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================
// NOTIFICATION BELL
// ============================================
const NotificationBell = memo(function NotificationBell() {
  const { unreadCount, markAsRead, clearAll } = useNotificationStore()
  const { navigate } = useAppStore()
  const [showModal, setShowModal] = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null)
  const [topNotifs, setTopNotifs] = useState<AppNotification[]>([])
  const [notifDeal, setNotifDeal] = useState<Deal | null>(null)
  const [notifOrder, setNotifOrder] = useState<Order | null>(null)

  // Fetch top 10 notifications when modal opens.
  // NOTE: We intentionally do NOT auto-mark-all-as-read on modal open.
  // Per the user's spec (Facebook-style), each notification is marked as read
  // ONLY when the user clicks on it — so the bell badge decrements by 1 per
  // click, not all at once when the modal opens.
  useEffect(() => {
    if (showModal) {
      apiFetch<{ notifications: AppNotification[]; total: number }>(`/api/notifications?pageSize=10`).then((res) => {
        if (res.success && res.data) setTopNotifs(res.data.notifications || [])
      })
    } else {
      // Reset state when modal closes so a reopen is clean.
      setSelectedNotif(null)
      setNotifDeal(null)
      setNotifOrder(null)
    }
  }, [showModal])

  // When a notification is opened, fetch the attached entity (deal OR order).
  // - For `broadcast` notifications with a dealId → fetch the deal (deal card).
  // - For `claim_confirmed` notifications → fetch the order (order-id card).
  // - Other types: no attached card.
  useEffect(() => {
    if (!selectedNotif) {
      setNotifDeal(null)
      setNotifOrder(null)
      return
    }
    setNotifDeal(null)
    setNotifOrder(null)

    let parsedData: { orderId?: string; dealId?: string; vendorId?: string } = {}
    if (selectedNotif.data) {
      try { parsedData = JSON.parse(selectedNotif.data) } catch { /* malformed JSON — ignore */ }
    }

    // claim_confirmed → fetch the order for the order-id card
    if (selectedNotif.type === 'claim_confirmed' && parsedData.orderId) {
      apiFetch<Order>(`/api/orders/${parsedData.orderId}`).then((res) => {
        if (res.success && res.data) setNotifOrder(res.data)
      }).catch(() => {})
      return
    }

    // broadcast with attached dealId → fetch the deal for the deal card
    const dealId = selectedNotif.dealId || parsedData.dealId
    if (dealId) {
      apiFetch<Deal>(`/api/deals/${dealId}`).then((res) => {
        if (res.success && res.data) setNotifDeal(res.data)
      }).catch(() => {})
    }
  }, [selectedNotif])

  // Facebook-style mark-as-read: called when a notification is CLICKED.
  // Fires a single PUT /api/notifications/[id]/read, then decrements the
  // local unreadCount by 1 (via markAsRead in the store). If the API call
  // fails (network error), we still mark it locally so the UI is responsive.
  // The in-flight call is tracked via `trackPendingRead` so the polling
  // doesn't overwrite the optimistic decrement while the server catches up.
  const handleNotifClick = useCallback(async (notif: AppNotification) => {
    setSelectedNotif(notif)
    if (!notif.read) {
      // Optimistically mark as read in the store (decrements unreadCount by 1)
      markAsRead(notif.id)
      // Persist server-side. The PUT endpoint is idempotent (uses .eq('read', false))
      // so a duplicate click is a no-op. trackPendingRead increments a
      // module-level counter that the polling subtracts from the server's
      // unread count, preventing the badge from briefly re-appearing between
      // this click and the server's ack.
      const apiPromise = apiFetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' })
      trackPendingRead(apiPromise)
      apiPromise.catch(() => {
        // Silently ignore — the local state is already correct. If the server
        // call genuinely failed, the next polling cycle will re-fetch the true
        // unread count and the badge will self-correct.
      })
      // Also update the local topNotifs list so the styling flips to "read"
      setTopNotifs((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
    }
  }, [markAsRead])

  const handleClearAll = async () => {
    try {
      await apiFetch('/api/notifications/clear-all', { method: 'DELETE' })
      setTopNotifs([])
      clearAll()
      toast.success('All notifications cleared')
    } catch {
      toast.error('Failed to clear notifications')
    }
  }

  // Click handler for the order-id card on claim_confirmed notifications.
  // Closes the modal and navigates to the foodie "orders" tab.
  const handleOrderCardClick = () => {
    setShowModal(false)
    setSelectedNotif(null)
    navigate('orders')
  }

  // Click handler for the deal card on broadcast notifications.
  const handleDealCardClick = () => {
    if (!notifDeal) return
    setShowModal(false)
    setSelectedNotif(null)
    navigate('deal-detail', { id: notifDeal.id })
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="relative p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="w-5 h-5 text-[#E53935]" />
        {unreadCount > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <Dialog open={showModal} onOpenChange={(v) => { setShowModal(v); if (!v) setSelectedNotif(null) }}>
        <DialogContent className="rounded-2xl max-w-md w-[calc(100%-1.5rem)] mx-auto max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="bg-gradient-to-br from-[#E53935]/20 to-[#E53935]/5 px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-extrabold text-[#1a1c1e] flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#E53935]" /> Notifications
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {unreadCount > 0 ? `${unreadCount} unread · ${topNotifs.length} recent` : `${topNotifs.length} recent`}
                </DialogDescription>
              </div>
              {topNotifs.length > 0 && !selectedNotif && (
                <Button variant="outline" size="sm" onClick={handleClearAll} className="h-7 px-2.5 rounded-lg text-[10px] font-bold text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10">
                  <Trash2 className="w-3 h-3 mr-1" /> Clear All
                </Button>
              )}
            </div>
          </DialogHeader>

          {selectedNotif ? (
            <div className="px-5 py-4">
              <button onClick={() => setSelectedNotif(null)} className="flex items-center gap-1 text-xs font-bold text-[#E53935] mb-3">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="bg-[#f8faf9] rounded-xl p-4">
                {/* Title + icon header */}
                <div className="flex items-center gap-2 mb-2">
                  {selectedNotif.type === 'broadcast' ? (
                    <Megaphone className="w-4 h-4 text-[#E53935]" />
                  ) : selectedNotif.type === 'claim_confirmed' ? (
                    <CheckCircle className="w-4 h-4 text-[#E53935]" />
                  ) : (
                    <Bell className="w-4 h-4 text-[#E53935]" />
                  )}
                  <h3 className="font-bold text-sm text-[#1a1c1e]">{selectedNotif.title}</h3>
                </div>
                {/* Full message body */}
                <p className="text-xs text-[#414841] leading-relaxed mb-3">{selectedNotif.message}</p>
                <p className="text-[10px] text-[#717971] mb-3">{parseDbDate(selectedNotif.createdAt).toLocaleString()}</p>

                {/* ── Order-id card (for claim_confirmed notifications) ── */}
                {selectedNotif.type === 'claim_confirmed' && notifOrder && (
                  <button
                    onClick={handleOrderCardClick}
                    className="w-full flex gap-3 p-3 rounded-xl bg-white border border-[#E53935]/20 hover:border-[#E53935]/40 transition-all active:scale-95"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#FFEBEE] flex items-center justify-center">
                      <QrCode className="w-6 h-6 text-[#E53935]" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[10px] text-[#717971] uppercase tracking-wide">Order ID</p>
                      <p className="text-xs font-bold text-[#1a1c1e] font-mono truncate">#{notifOrder.orderNumber}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-sm font-extrabold text-[#E53935]">RM{notifOrder.totalPrice.toFixed(2)}</span>
                        <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded text-[9px] capitalize">
                          {String(notifOrder.status).replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-[#717971] mt-0.5">Tap to view your orders</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#717971] flex-shrink-0 self-center" />
                  </button>
                )}
                {selectedNotif.type === 'claim_confirmed' && !notifOrder && (
                  <button
                    onClick={handleOrderCardClick}
                    className="w-full flex items-center gap-2 p-3 rounded-xl bg-white border border-[#E53935]/20 hover:border-[#E53935]/40 transition-all active:scale-95"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#E53935]" />
                    <span className="text-xs font-bold text-[#E53935] flex-1 text-left">View My Orders</span>
                    <ChevronRight className="w-4 h-4 text-[#717971]" />
                  </button>
                )}

                {/* ── Deal card (for broadcast notifications with attached dealId) ── */}
                {notifDeal && (
                  <button
                    onClick={handleDealCardClick}
                    className="w-full flex gap-3 p-3 rounded-xl bg-white border border-[#E53935]/20 hover:border-[#E53935]/40 transition-all active:scale-95"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-[#f0f4f2] relative">
                      {notifDeal.imageUrl ? (
                        <Image src={notifDeal.imageUrl} alt={notifDeal.title} fill className="object-cover" sizes="64px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Utensils className="w-6 h-6 text-[#c1c9c0]" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-[#1a1c1e] truncate">{notifDeal.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-sm font-extrabold text-[#E53935]">RM{notifDeal.dealPrice.toFixed(2)}</span>
                        <span className="text-[10px] text-[#717971] line-through">RM{notifDeal.originalPrice.toFixed(2)}</span>
                        <Badge className="bg-[#E53935]/10 text-[#E53935] border-0 rounded text-[9px]">-{notifDeal.discountPercent}%</Badge>
                      </div>
                      <p className="text-[10px] text-[#717971] mt-0.5">{notifDeal.availableQuantity} left</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#717971] flex-shrink-0 self-center" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="px-3 pb-4 pt-2 space-y-1.5">
              {topNotifs.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-10 h-10 text-[#c1c9c0] mx-auto mb-2" />
                  <p className="text-sm text-[#717971]">No notifications yet</p>
                </div>
              ) : (
                topNotifs.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${notif.read ? 'bg-[#f8faf9]' : 'bg-[#E53935]/5 border border-[#E53935]/15'}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${notif.read ? 'font-semibold text-[#414841]' : 'font-bold text-[#1a1c1e]'}`}>
                          {notif.title}
                        </p>
                        <p className="text-[10px] text-[#717971] mt-0.5 line-clamp-2">{notif.message}</p>
                        <p className="text-[9px] text-[#717971] mt-1">{parseDbDate(notif.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-[#E53935]" aria-label="Unread" />}
                        {notif.type === 'broadcast' && <Megaphone className="w-3.5 h-3.5 text-[#E53935]" />}
                        {notif.type === 'claim_confirmed' && <CheckCircle className="w-3.5 h-3.5 text-[#E53935]" />}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
})

// ============================================
// ADMIN: MEDIA MONITORING VIEW
// ============================================
interface MediaFile {
  id: string
  fileName: string
  publicUrl: string
  group: string
  mimeType: string
  fileSize: number
  sizeKB: number
  sizeMB: number
  variantKey: string | null
  uploaderId: string | null
  uploader: { name: string; email: string } | null
  createdAt: string
  alertLevel: string
}

interface MediaData {
  overview: {
    totalFiles: number
    totalSizeBytes: number
    totalSizeMB: number
    byGroup: Record<string, number>
    byAlertLevel: Record<string, number>
  }
  top5Biggest: MediaFile[]
  recentAlerts: MediaFile[]
  dailyActivity: { date: string; count: number; size: number }[]
}

const ALERT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  none: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500', label: 'OK' },
  info: { bg: 'bg-[#FFEBEE]', text: 'text-[#2563a8]', border: 'border-[#FFCDD2]', dot: 'bg-[#E53935]', label: 'Info' },
  warning: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Warning' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Critical' },
}

function AdminMediaView() {
  const { goBack } = useAppStore()
  const [data, setData] = useState<MediaData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMedia = useCallback(() => {
    setLoading(true)
    apiFetch<{ overview: MediaData['overview']; top5Biggest: MediaFile[]; recentAlerts: MediaFile[]; dailyActivity: { date: string; count: number; size: number }[] }>('/api/admin/media').then((res) => {
      if (res.success && res.data) {
        setData(res.data as MediaData)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchMedia()
    // Auto-refresh every 30s for live monitoring
    const interval = setInterval(fetchMedia, 30000)
    return () => clearInterval(interval)
  }, [fetchMedia])

  const fmtSize = (mb: number) => {
    if (mb >= 1) return `${mb.toFixed(2)} MB`
    return `${(mb * 1024).toFixed(0)} KB`
  }

  const alertLevels = data?.overview.byAlertLevel || { none: 0, info: 0, warning: 0, critical: 0 }
  const hasAlerts = (alertLevels.warning || 0) + (alertLevels.critical || 0) > 0

  return (
    <div className="min-h-screen bg-[#f0f4f2] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e8edea] px-5 py-3 flex items-center gap-3">
        <button onClick={goBack} className="p-2 -ml-2 rounded-lg hover:bg-[#e8edea]">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-extrabold text-[#1a1c1e]">Media Settings</h1>
          <p className="text-xs text-[#717971]">Storage monitoring & alerts</p>
        </div>
        <button onClick={fetchMedia} className="p-2 rounded-lg hover:bg-[#e8edea]">
          <RefreshCw className={`w-5 h-5 text-[#1a1c1e] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4 max-w-2xl mx-auto">
        {loading && !data ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileImage className="w-4 h-4 text-[#E53935]" />
                    <span className="text-xs font-semibold text-[#717971] uppercase tracking-wide">Total Files</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1a1c1e]">{data.overview.totalFiles}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-[#E53935]" />
                    <span className="text-xs font-semibold text-[#717971] uppercase tracking-wide">Total Size</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1a1c1e]">{fmtSize(data.overview.totalSizeMB)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Alert Banner (push alert) */}
            {hasAlerts ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-4 ${alertLevels.critical ? 'bg-red-50 border-red-200' : 'bg-red-50 border-red-200'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${alertLevels.critical ? 'bg-red-500' : 'bg-red-500'}`}>
                    <AlertOctagon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-sm ${alertLevels.critical ? 'text-red-700' : 'text-red-700'}`}>
                      {alertLevels.critical ? 'Critical Alert' : 'Warning Alert'}
                    </h3>
                    <p className={`text-xs mt-0.5 ${alertLevels.critical ? 'text-red-600' : 'text-red-600'}`}>
                      {alertLevels.critical || 0} critical file(s) over 1.5MB · {alertLevels.warning || 0} warning file(s) over 700KB
                    </p>
                  </div>
                  <BellRing className={`w-5 h-5 ${alertLevels.critical ? 'text-red-400' : 'text-red-400'} animate-pulse`} />
                </div>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-sm text-green-700">All Clear</h3>
                    <p className="text-xs text-green-600 mt-0.5">No oversized media files detected</p>
                  </div>
                </div>
              </div>
            )}

            {/* Alert Level Breakdown */}
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <h3 className="text-sm font-bold text-[#1a1c1e] mb-3">Alert Level Breakdown</h3>
                <div className="space-y-2">
                  {(['critical', 'warning', 'info', 'none'] as const).map((level) => {
                    const count = alertLevels[level] || 0
                    const c = ALERT_COLORS[level]
                    const total = data.overview.totalFiles || 1
                    const pct = Math.round((count / total) * 100)
                    return (
                      <div key={level} className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.dot} flex-shrink-0`} />
                        <span className={`text-xs font-semibold w-16 ${c.text}`}>{c.label}</span>
                        <div className="flex-1 h-2 bg-[#e8edea] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${c.dot} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#1a1c1e] w-8 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-[#e8edea] flex items-center justify-between text-xs text-[#717971]">
                  <span>Thresholds:</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[#E53935]">&lt;700KB</span>·
                    <span className="text-red-500">&gt;700KB</span>·
                    <span className="text-red-500">&gt;1.5MB</span>
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Top 5 Biggest Files */}
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#1a1c1e]">Top 5 Biggest Files</h3>
                  <TrendingUp className="w-4 h-4 text-[#717971]" />
                </div>
                {data.top5Biggest.length === 0 ? (
                  <div className="text-center py-8 text-[#717971] text-sm">
                    <FileImage className="w-10 h-10 mx-auto mb-2 text-[#c1c9c0]" />
                    No media files yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.top5Biggest.map((file, idx) => {
                      const c = ALERT_COLORS[file.alertLevel] || ALERT_COLORS.none
                      const isLargest = idx === 0
                      return (
                        <div
                          key={file.id}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border ${c.border} ${c.bg}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-extrabold text-xs ${
                            isLargest ? 'bg-[#E53935] text-white' : 'bg-white text-[#717971] border border-[#e8edea]'
                          }`}>
                            #{idx + 1}
                          </div>
                          <Image
                            src={file.publicUrl}
                            alt={file.fileName}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#e8edea]"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#1a1c1e] truncate">
                              {file.fileName}
                            </p>
                            <p className="text-[10px] text-[#717971]">
                              {file.group} · {file.uploader?.name || 'Unknown'} · {parseDbDate(file.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-extrabold ${c.text}`}>
                              {fmtSize(file.sizeMB)}
                            </p>
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border}`}>
                              {c.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Files by Group */}
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <h3 className="text-sm font-bold text-[#1a1c1e] mb-3">Files by Category</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.overview.byGroup).map(([group, count]) => (
                    <div key={group} className="flex items-center justify-between p-2.5 bg-[#f5f8f5] rounded-xl">
                      <span className="text-xs font-semibold text-[#414841] capitalize">{group.replace('_', ' ')}</span>
                      <span className="text-sm font-extrabold text-[#1a1c1e]">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Alerts Feed */}
            {data.recentAlerts.length > 0 && (
              <Card className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#1a1c1e]">Recent Alerts Feed</h3>
                    <span className="text-xs text-[#717971]">{data.recentAlerts.length} alert(s)</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.recentAlerts.map((file) => {
                      const c = ALERT_COLORS[file.alertLevel] || ALERT_COLORS.warning
                      return (
                        <div key={file.id} className={`flex items-center gap-2.5 p-2 rounded-lg ${c.bg} border ${c.border}`}>
                          <div className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0 animate-pulse`} />
                          <Image
                            src={file.publicUrl}
                            alt={file.fileName}
                            width={28}
                            height={28}
                            className="w-7 h-7 rounded object-cover flex-shrink-0 bg-white"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#1a1c1e] truncate">{file.fileName}</p>
                            <p className="text-[10px] text-[#717971]">
                              {file.group} · {parseDbDate(file.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <span className={`text-xs font-bold ${c.text} flex-shrink-0`}>{fmtSize(file.sizeMB)}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 14-Day Upload Activity */}
            <Card className="border-0 shadow-card rounded-2xl">
              <CardContent className="p-4">
                <h3 className="text-sm font-bold text-[#1a1c1e] mb-3">Upload Activity (14 Days)</h3>
                <div className="flex items-end justify-between gap-1 h-24">
                  {data.dailyActivity.map((day) => {
                    const maxCount = Math.max(...data.dailyActivity.map(d => d.count), 1)
                    const h = Math.max((day.count / maxCount) * 100, 4)
                    const hasAlert = day.count > 0
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${h}%`,
                            background: hasAlert
                              ? 'linear-gradient(to top, #E53935, #E53935)'
                              : '#e8edea',
                          }}
                          title={`${day.date}: ${day.count} uploads`}
                        />
                        <span className="text-[8px] text-[#717971]">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-[#717971] mt-2 text-center">
                  Total: {data.dailyActivity.reduce((s, d) => s + d.count, 0)} uploads in 14 days
                </p>
              </CardContent>
            </Card>

            <p className="text-[10px] text-[#717971] text-center pt-2">
              Auto-refreshes every 30s · SnapJe Storage Bucket
            </p>
          </>
        ) : (
          <div className="text-center py-16 text-[#717971]">
            <p className="text-sm">Failed to load media data</p>
            <Button onClick={fetchMedia} variant="outline" className="mt-3" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// ADMIN: UPLOAD SETTINGS VIEW
// ============================================
function AdminUploadSettingsView() {
  const { goBack } = useAppStore()
  const [settings, setSettings] = useState<Record<string, unknown>>({
    maxFileSizeMB: 10,
    autoResize: true,
    autoCompress: true,
    qualityProfile: 85,
    qualityDeal: 80,
    qualityVendor: 85,
    enableWatermark: false,
    watermarkText: 'SnapJe',
    moderationMode: 'auto',
    maxUploadsPerDay: 100,
    enableCDN: false,
    cdnUrl: '',
    storageLimitMB: 5000,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch<Record<string, unknown>>('/api/admin/upload-settings').then((res) => {
      if (res.success && res.data) setSettings(res.data)
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/admin/upload-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      if (res.success) {
        toast.success('Upload settings saved!')
      } else {
        toast.error(res.error || 'Failed to save settings')
      }
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key: string, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Upload Settings</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* File Limits */}
          <Card className="border-0 shadow-card rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#E53935]" /> File Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Max File Size</p>
                  <p className="text-[11px] text-[#717971]">Maximum upload size per file</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={String(settings.maxFileSizeMB || 10)}
                    onChange={(e) => updateField('maxFileSizeMB', parseInt(e.target.value))}
                    className="w-16 h-8 text-center text-sm rounded-lg"
                  />
                  <span className="text-xs text-[#717971]">MB</span>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Daily Upload Limit</p>
                  <p className="text-[11px] text-[#717971]">Per user per day</p>
                </div>
                <Input
                  type="number"
                  value={String(settings.maxUploadsPerDay || 100)}
                  onChange={(e) => updateField('maxUploadsPerDay', parseInt(e.target.value))}
                  className="w-20 h-8 text-center text-sm rounded-lg"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Storage Limit</p>
                  <p className="text-[11px] text-[#717971]">Total storage for uploads</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={String(settings.storageLimitMB || 5000)}
                    onChange={(e) => updateField('storageLimitMB', parseInt(e.target.value))}
                    className="w-20 h-8 text-center text-sm rounded-lg"
                  />
                  <span className="text-xs text-[#717971]">MB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Processing */}
          <Card className="border-0 shadow-card rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E53935]" /> Auto-Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Auto-Resize</p>
                  <p className="text-[11px] text-[#717971]">Generate multiple size variants on upload</p>
                </div>
                <Switch checked={settings.autoResize as boolean} onCheckedChange={(v) => updateField('autoResize', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Auto-Compress</p>
                  <p className="text-[11px] text-[#717971]">Reduce quality to meet size limits</p>
                </div>
                <Switch checked={settings.autoCompress as boolean} onCheckedChange={(v) => updateField('autoCompress', v)} />
              </div>
              <Separator />
              <div>
                <p className="text-sm font-bold text-[#1a1c1e] mb-2">Quality Presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'qualityProfile', label: 'Profile', value: settings.qualityProfile as number },
                    { key: 'qualityDeal', label: 'Deal', value: settings.qualityDeal as number },
                    { key: 'qualityVendor', label: 'Vendor', value: settings.qualityVendor as number },
                  ].map((item) => (
                    <div key={item.key} className="bg-[#f0f4f2] rounded-lg p-2 text-center">
                      <p className="text-[10px] text-[#717971]">{item.label}</p>
                      <Input
                        type="number"
                        min={30}
                        max={100}
                        value={String(item.value || 80)}
                        onChange={(e) => updateField(item.key, parseInt(e.target.value))}
                        className="w-full h-7 text-center text-sm rounded-md mt-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Watermark & Moderation */}
          <Card className="border-0 shadow-card rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#E53935]" /> Moderation
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Enable Watermark</p>
                  <p className="text-[11px] text-[#717971]">Add watermark to uploaded images</p>
                </div>
                <Switch checked={settings.enableWatermark as boolean} onCheckedChange={(v) => updateField('enableWatermark', v)} />
              </div>
              {settings.enableWatermark && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-bold text-[#1a1c1e]">Watermark Text</p>
                    <Input
                      value={String(settings.watermarkText || 'SnapJe')}
                      onChange={(e) => updateField('watermarkText', e.target.value)}
                      className="mt-1 h-9 rounded-xl text-sm"
                    />
                  </div>
                </>
              )}
              <Separator />
              <div>
                <p className="text-sm font-bold text-[#1a1c1e] mb-2">Moderation Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'auto', label: 'Auto', desc: 'AI approves' },
                    { value: 'manual', label: 'Manual', desc: 'Admin reviews' },
                    { value: 'none', label: 'None', desc: 'No review' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => updateField('moderationMode', mode.value)}
                      className={`p-2 rounded-lg text-center transition-all ${
                        settings.moderationMode === mode.value
                          ? 'bg-[#E53935] text-white'
                          : 'bg-[#f0f4f2] text-[#1a1c1e]'
                      }`}
                    >
                      <p className="text-xs font-bold">{mode.label}</p>
                      <p className={`text-[9px] ${settings.moderationMode === mode.value ? 'text-white/80' : 'text-[#717971]'}`}>
                        {mode.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CDN */}
          <Card className="border-0 shadow-card rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#E53935]" /> CDN
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Enable CDN</p>
                  <p className="text-[11px] text-[#717971]">Serve images via CDN</p>
                </div>
                <Switch checked={settings.enableCDN as boolean} onCheckedChange={(v) => updateField('enableCDN', v)} />
              </div>
              {settings.enableCDN && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-bold text-[#1a1c1e]">CDN URL</p>
                    <Input
                      value={String(settings.cdnUrl || '')}
                      onChange={(e) => updateField('cdnUrl', e.target.value)}
                      placeholder="https://cdn.example.com"
                      className="mt-1 h-9 rounded-xl text-sm"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Image Size Reference */}
          <Card className="border-0 shadow-card rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#E53935]" /> Size Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {[
                  { label: 'Profile Avatar', sizes: '200×200, 80×80', group: 'profile' },
                  { label: 'Vendor Logo', sizes: '200×200, 64×64', group: 'vendor_logo' },
                  { label: 'Vendor Banner', sizes: '1200×400', group: 'vendor_banner' },
                  { label: 'Deal Thumbnail', sizes: '200×150', group: 'deal' },
                  { label: 'Deal Card', sizes: '400×300', group: 'deal' },
                  { label: 'Deal Full', sizes: '800×600', group: 'deal' },
                  { label: 'Deal Hero', sizes: '1200×800', group: 'deal' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-xs font-bold text-[#1a1c1e]">{item.label}</p>
                      <p className="text-[10px] text-[#717971]">{item.group}</p>
                    </div>
                    <code className="text-[10px] text-[#E53935] bg-[#E53935]/5 px-2 py-0.5 rounded">
                      {item.sizes}
                    </code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white active:scale-95 transition-transform"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1.5" /> Save Settings</>}
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================
// BOTTOM NAVIGATION - FOODIE (Foodpanda Style)
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
                isActive ? 'text-[#E53935]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#E53935]" />
                )}
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-[#E53935]' : ''}`}>{tab.label}</span>
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
                isActive ? 'text-[#E53935]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#E53935]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#E53935]' : ''}`}>{tab.label}</span>
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
                isActive ? 'text-[#E53935]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#E53935]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#E53935]' : ''}`}>{tab.label}</span>
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
        case 'register-vendor': return <VendorRegistrationView />
        case 'vendor-public': return <VendorPublicView />
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
        case 'vendor-public': return <VendorPublicView />
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
        case 'admin-deals': return <AdminDealsView />
        case 'upload-settings': return <AdminUploadSettingsView />
        case 'media': return <AdminMediaView />
        case 'profile': return <FoodieProfileView />
        case 'register-vendor': return <VendorRegistrationView />
        case 'broadcast-log': return <AdminBroadcastLogView />
        case 'vendor-public': return <VendorPublicView />
        default: return <AdminDashboardView />
      }
    }

    return <FoodieHomeView />
  }

  const renderBottomNav = () => {
    // Don't show bottom nav on detail/full-screen views
    if (
      currentView === 'deal-detail' ||
      currentView === 'register-vendor' ||
      currentView === 'vendor-public'
    ) return null
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
  const [role, setRole] = useState<'foodie' | 'vendor'>('foodie')
  const [loading, setLoading] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showAuthModal) {
      setEmail('')
      setPassword('')
      setName('')
      setPhone('')
      setRole('foodie')
    }
  }, [showAuthModal])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin
        ? { email, password }
        : { email, password, name, phone, role }

      const res = await apiFetch<AuthUser>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.success && res.data) {
        login(res.data, res.tokens)
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
        <div className="bg-gradient-to-br from-[#EF5350]/20 to-[#E53935]/10 px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[#1a1c1e]">
              {isLogin ? 'Welcome Back' : 'Join SnapJe'}
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
                isLogin ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                !isLogin ? 'bg-white text-[#E53935] shadow-chip' : 'text-[#414841]'
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
            {!isLogin && (
              <div>
                <Label className="text-sm font-semibold text-[#1a1c1e] mb-2 block">I want to...</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('foodie')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      role === 'foodie'
                        ? 'border-[#E53935] bg-[#E53935]/10'
                        : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                    }`}
                  >
                    <Utensils className={`w-5 h-5 ${role === 'foodie' ? 'text-[#E53935]' : 'text-[#717971]'}`} />
                    <span className={`text-xs font-bold ${role === 'foodie' ? 'text-[#E53935]' : 'text-[#414841]'}`}>Find Deals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('vendor')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      role === 'vendor'
                        ? 'border-[#E53935] bg-[#E53935]/10'
                        : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                    }`}
                  >
                    <Store className={`w-5 h-5 ${role === 'vendor' ? 'text-[#E53935]' : 'text-[#717971]'}`} />
                    <span className={`text-xs font-bold ${role === 'vendor' ? 'text-[#E53935]' : 'text-[#414841]'}`}>Sell Food</span>
                  </button>
                </div>
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-base font-bold bg-gradient-to-b from-[#EF5350] to-[#E53935] text-white hover:opacity-90 active:scale-95 transition-all"
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
export default function SnapJeApp() {
  const { isAuthenticated, isLoading, login, logout, setLoading } = useAuthStore()

  // Initialize socket connection
  useSocket()

  // Check auth on mount
  useEffect(() => {
    setLoading(true)
    apiFetch<AuthUser>('/api/auth/me').then((res) => {
      if (res.success && res.data) {
        login(res.data)
      } else {
        // Canonical auth check: if /api/auth/me fails (even after a refresh
        // attempt inside apiFetch), clear any stale rehydrated auth state so
        // the user sees the sign-in screen. This is the ONLY place logout()
        // is called on a 401 — never inside apiFetch itself (that caused a
        // login loop where background requests clobbered active sessions).
        //
        // HIGH 7: do NOT call logout() on a transient network error — that
        // would throw a logged-in user back to the sign-in screen just because
        // their connection dropped for a moment. Only log out on a definitive
        // auth failure (401/403 returned by the server).
        if (res.error !== 'Network error') {
          logout()
        }
      }
    }).finally(() => setLoading(false))
  }, [login, logout, setLoading])

  // Fetch notifications (polling fallback — catches DB notifications even if socket misses)
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchNotifications = async () => {
      const res = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications?unReadOnly=true')
      if (res.success && res.data) {
        const serverUnread = res.data.unreadCount ?? 0
        const newNotifs = res.data.notifications || []

        // Toast deduplication: only fire a social-proof toast for notification
        // IDs we have NOT shown yet this session. This prevents re-firing
        // toasts on every remount (e.g. when auth state briefly changes and
        // the polling effect re-runs).
        newNotifs.forEach((n) => {
          if (shownToastNotifIds.has(n.id)) return
          shownToastNotifIds.add(n.id)
          // Broadcast format: "📣 <Vendor Name>:" as title + the message in
          // BOLD as the description (per user spec — Facebook-style social proof).
          if (n.type === 'broadcast') {
            const msg = n.message || ''
            toast.info(`📣 ${n.title}:`, {
              description: (
                <span className="font-bold text-[#1a1c1e]">
                  {msg.slice(0, 140) + (msg.length > 140 ? '…' : '')}
                </span>
              ),
              duration: 6000,
            })
          } else if (n.type === 'claim_confirmed') {
            toast.success(`✅ ${n.title}`, { duration: 4000 })
          } else if (n.type === 'order_status_update') {
            toast.info(`📦 ${n.title}`, { duration: 4000 })
          } else if (n.type === 'deal_new' || n.type === 'deal_expiring') {
            toast.success(`🔥 ${n.title}`, { duration: 4000 })
          }
        })
        // Cap the dedupe set to prevent unbounded growth over a long session.
        if (shownToastNotifIds.size > 200) {
          const arr = Array.from(shownToastNotifIds)
          arr.splice(0, arr.length - 200)
          shownToastNotifIds.clear()
          arr.forEach((id) => shownToastNotifIds.add(id))
        }

        // Reconcile the bell badge count with the server.
        // `pendingReadsCount` tracks mark-as-read API calls that the
        // NotificationBell fired but the server hasn't acknowledged yet.
        // Without this subtraction, the badge would briefly re-appear
        // between the user's click and the server's ack (5s polling window).
        const adjustedUnread = Math.max(0, serverUnread - pendingReadsCount)
        useNotificationStore.getState().setUnreadCount(adjustedUnread)
      }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 5000) // 5s polling for near-real-time
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#EF5350] to-[#E53935] mb-4 shadow-card">
            <Flame className="w-10 h-10 text-white" />
          </div>
          <p className="text-[#414841] text-sm">Loading SnapJe...</p>
        </motion.div>
      </div>
    )
  }

  // Always render ViewRouter (public access to homepage), with AuthModal for protected features
  return (
    <>
      <ViewRouter />
      <AuthModal />
      <GeolocationGate />
    </>
  )
}
