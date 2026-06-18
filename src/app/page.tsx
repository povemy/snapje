'use client'

import { useEffect, useState, useCallback, memo, useRef } from 'react'
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
  AlertTriangle, AlertCircle, Ban, RefreshCw, DollarSign, ShoppingCart,
  Utensils, Bike, Building2, Crown, Sparkles, MoreVertical,
  Pencil, Trash2, Timer, Save, ScanLine, Camera, XCircle,
  Lock, Globe, Volume2, BellRing, KeyRound, Smartphone,
  Moon, Wallet, Megaphone, EyeOff,
  Plus, Minus, Navigation, Route, Footprints,
  Image as ImageIcon, HardDrive, FileImage, AlertOctagon
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
import { toast } from 'sonner'

// ============================================
// API Helper (Bearer-token auth with transparent refresh on 401)
// ============================================
// Auth uses Bearer tokens stored in localStorage (via the auth store) as the
// PRIMARY mechanism, because cookies are unreliable in preview iframes
// (third-party cookie blocking). The server's getAuthUser() checks the
// Authorization header first, then falls back to cookies.
//
// Flow: every request gets `Authorization: Bearer <accessToken>`. On 401 we
// call /api/auth/refresh (sending the refresh token in the body), store the
// new tokens, and retry once. Concurrent 401s share a single refresh.
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const { refreshToken } = useAuthStore.getState()
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false
      const json = await res.json()
      if (json.success && json.tokens) {
        useAuthStore.getState().setTokens(json.tokens)
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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string; tokens?: { accessToken: string; refreshToken: string } }> {
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
    let res = await fetch(path, { ...options, headers: buildHeaders(options) })

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
        res = await fetch(path, { ...options, headers: buildHeaders(options) })
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
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#8FC5E8] to-[#6CB4EE] mb-4 shadow-card"
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
              isLogin ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              !isLogin ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
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
                      ? 'border-[#6CB4EE] bg-[#6CB4EE]/10 shadow-chip'
                      : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                  }`}
                >
                  <Utensils className={`w-6 h-6 ${role === 'foodie' ? 'text-[#6CB4EE]' : 'text-[#717971]'}`} />
                  <span className={`text-sm font-bold ${role === 'foodie' ? 'text-[#6CB4EE]' : 'text-[#414841]'}`}>
                    Find Deals
                  </span>
                  <span className="text-[10px] text-[#717971]">Browse & claim food</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('vendor')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    role === 'vendor'
                      ? 'border-[#6CB4EE] bg-[#6CB4EE]/10 shadow-chip'
                      : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                  }`}
                >
                  <Store className={`w-6 h-6 ${role === 'vendor' ? 'text-[#6CB4EE]' : 'text-[#717971]'}`} />
                  <span className={`text-sm font-bold ${role === 'vendor' ? 'text-[#6CB4EE]' : 'text-[#414841]'}`}>
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
            className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white hover:opacity-90 active:scale-95 transition-all shadow-card"
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
      timeLeft === 'Expired' ? 'text-[#717971]' : isUrgent ? 'text-[#FB923C] animate-pulse-urgent' : 'text-[#6CB4EE]'
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
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#6CB4EE] text-white text-[10px] font-bold shadow-sm">
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
                <MapPin className="w-2.5 h-2.5 text-[#6CB4EE]" />
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
            <span className={`font-black text-[#6CB4EE] ${isHalfWidth ? 'text-sm' : 'text-lg'}`}>
              RM{deal.dealPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-[#717971] line-through">
              RM{deal.originalPrice.toFixed(2)}
            </span>
          </div>
          
          {/* Stock indicator */}
          <div className={`text-[10px] font-bold mt-1 ${isLowStock ? 'text-[#FB923C]' : isSoldOut ? 'text-[#717971]' : 'text-[#6CB4EE]'}`}>
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
        <QrCode className="w-20 h-20 text-[#6CB4EE]" />
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
          className={`relative cursor-pointer group ${circular ? 'rounded-full' : 'rounded-xl'} overflow-hidden ${dragging ? 'ring-2 ring-[#6CB4EE]' : ''}`}
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
              <div className="w-6 h-6 rounded-full border-2 border-[#6CB4EE] border-t-transparent animate-spin" />
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
          dragging ? 'border-[#6CB4EE] bg-[#6CB4EE]/5' : 'border-[#d7ddd9] bg-[#f8faf9] hover:border-[#8FC5E8]'
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
                <div className="w-10 h-10 rounded-full border-3 border-[#6CB4EE] border-t-transparent animate-spin mb-2" />
                <p className="text-xs text-[#717971]">Uploading... {progress}%</p>
                <Progress value={progress} className="w-32 h-1.5 mt-2" />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[#6CB4EE]/10 flex items-center justify-center mx-auto mb-2">
                  <Camera className="w-6 h-6 text-[#6CB4EE]" />
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
  { key: 'All', label: 'Flash Deals', icon: Zap, color: '#6CB4EE', bg: '#E8F4FD' },
  { key: 'Malay', label: 'Malay', icon: Utensils, color: '#e74c3c', bg: '#fde8e8' },
  { key: 'Chinese', label: 'Chinese', icon: Utensils, color: '#f39c12', bg: '#fef3e2' },
  { key: 'Indian', label: 'Indian', icon: Utensils, color: '#e67e22', bg: '#fef0e0' },
  { key: 'Western', label: 'Western', icon: Utensils, color: '#3498db', bg: '#e8f4fd' },
  { key: 'Japanese', label: 'Japanese', icon: Utensils, color: '#e91e63', bg: '#fce4ec' },
  { key: 'Korean', label: 'Korean', icon: Utensils, color: '#9b59b6', bg: '#f3e5f5' },
  { key: 'Dessert', label: 'Dessert', icon: Utensils, color: '#ff6b81', bg: '#ffe8ed' },
]

// ============================================
// FOODIE: HOME VIEW - Foodpanda Style
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
      {/* ===== Sticky Header - Foodpanda Style ===== */}
      <div 
        className="sticky top-0 z-30 bg-white" 
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 8px))' }}
      >
        {/* Delivery Address Bar */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#6CB4EE] flex items-center justify-center flex-shrink-0">
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
                  className="h-8 px-4 rounded-full text-xs font-bold bg-[#6CB4EE] text-white hover:bg-[#4A96D5] active:scale-95 transition-all"
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
              className="pl-10 h-10 rounded-full text-sm bg-[#F4F7F6] border-0 focus:bg-white focus:border-[#6CB4EE]"
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
                  isActive ? 'bg-[#6CB4EE]/10 ring-1 ring-[#6CB4EE]/30' : ''
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: cat.bg }}
                >
                  <Icon className="w-5 h-5" style={{ color: cat.color }} />
                </div>
                <span className={`text-[10px] font-bold leading-tight ${
                  isActive ? 'text-[#6CB4EE]' : 'text-[#1a1c1e]'
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
  const [quantity, setQuantity] = useState(1)
  const { user, isAuthenticated } = useAuthStore()
  const { location, request: requestLocation } = useGeolocation()
  const [distance, setDistance] = useState<number | null>(null)
  const [walkTime, setWalkTime] = useState<number | null>(null)
  const [driveTime, setDriveTime] = useState<number | null>(null)

  // Fetch deal
  useEffect(() => {
    if (!viewParams.id) return
    setLoading(true)
    apiFetch<Deal>(`/api/deals/${viewParams.id}`).then((res) => {
      if (res.success && res.data) setDeal(res.data)
    }).finally(() => setLoading(false))
  }, [viewParams.id])

  // Reset quantity when deal changes
  useEffect(() => {
    setQuantity(1)
  }, [viewParams.id])

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
    setClaiming(true)
    try {
      // Step 1: Claim (create reservation with quantity)
      const claimRes = await apiFetch<{ reservation: { id: string }; quantity: number; totalPrice: number }>(
        `/api/deals/${deal.id}/claim`,
        {
          method: 'POST',
          body: JSON.stringify({ quantity }),
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
            <Utensils className="w-20 h-20 text-[#8FC5E8]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {/* Discount tag — moved UP 10% (bottom-[8%]) */}
        <div className="absolute bottom-[8%] left-5">
          <Badge className="bg-gradient-to-r from-[#FB923C] to-[#F97316] text-white font-bold border-0 rounded-full shadow-lg px-3 py-1.5 flex items-center gap-1">
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

        {/* Deal Highlight Banner (rounded-2xl, orange gradient accent) */}
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#FFF7ED] to-[#FFEDD5] border border-[#FB923C]/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#9A3412] font-medium">Flash Deal Price</p>
            <div className="flex items-end gap-2 mt-0.5">
              <span className="text-2xl font-black text-[#F97316]">
                RM{deal.dealPrice.toFixed(2)}
              </span>
              <span className="text-sm text-[#717971] line-through mb-0.5">
                RM{deal.originalPrice.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#9A3412] font-medium">{quantity}x total</p>
            <span className="text-lg font-bold text-[#1a1c1e]">RM{totalPrice.toFixed(2)}</span>
          </div>
        </div>

        {/* Info Cards (3-col grid) */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {/* Ends in */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Clock className="w-5 h-5 text-[#6CB4EE] mx-auto mb-1" />
            <p className="text-[10px] text-[#414841]">Ends in</p>
            <CountdownTimer expiresAt={deal.expiresAt} compact />
          </div>
          {/* Stock */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Flame
              className={`w-5 h-5 mx-auto mb-1 ${
                deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#6CB4EE]'
              }`}
            />
            <p className="text-[10px] text-[#414841]">Stock</p>
            <p
              className={`text-sm font-bold ${
                deal.availableQuantity <= 5 ? 'text-[#FB923C]' : 'text-[#1a1c1e]'
              }`}
            >
              {deal.availableQuantity} left
            </p>
          </div>
          {/* Distance */}
          <div className="bg-[#f0f4f2] rounded-xl p-3 text-center">
            <Navigation className="w-5 h-5 text-[#6CB4EE] mx-auto mb-1" />
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
            <MapPin className="w-4 h-4 text-[#6CB4EE]" /> Pickup Location
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
                    <Navigation className="w-3.5 h-3.5 text-[#6CB4EE]" />
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
                      <Route className="w-3.5 h-3.5 text-[#F97316]" />
                      {driveTime} min drive
                    </span>
                  )}
                </div>
              ) : (
                <button
                  onClick={requestLocation}
                  className="mt-3 text-xs text-[#6CB4EE] font-medium flex items-center gap-1 hover:underline"
                >
                  <Navigation className="w-3.5 h-3.5" /> Enable location to see distance
                </button>
              )}

              {/* Open in Maps */}
              <a
                href={`https://www.openstreetmap.org/?mlat=${vendorLat}&mlon=${vendorLng}#map=17/${vendorLat}/${vendorLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[#6CB4EE] font-medium hover:underline"
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

        {/* Claimed Success */}
        {claimed && order && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-5 bg-[#FFF7ED] border border-[#FB923C]/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-[#F97316]" />
              <span className="font-bold text-[#F97316]">
                Claimed {quantity}x for RM{totalPrice.toFixed(2)}!
              </span>
            </div>
            <p className="text-xs text-[#9A3412] break-all">
              Order <span className="font-mono">{order.orderNumber || '—'}</span>
            </p>
            {order.pickupDeadline && (
              <p className="text-xs text-[#9A3412] mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Pickup by{' '}
                {new Date(order.pickupDeadline).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            <Button
              onClick={() => navigate('orders')}
              className="mt-3 w-full h-10 rounded-xl text-sm font-bold bg-gradient-to-b from-[#FB923C] to-[#F97316] text-white hover:opacity-90 active:scale-95 transition-all"
            >
              <QrCode className="w-4 h-4 mr-1.5" />
              View QR Code &amp; Pickup Details
            </Button>
          </motion.div>
        )}
      </div>

      {/* Sticky Bottom — Quantity + Claim Deal (side by side, same h-14) */}
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
                : 'bg-gradient-to-r from-[#FB923C] to-[#F97316] hover:opacity-90 text-white'
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
function PickupProgressSlider({ pickupDeadline }: { pickupDeadline: string }) {
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const calcProgress = () => {
      const deadline = new Date(pickupDeadline).getTime()
      // Assume 2-hour pickup window from order creation
      const totalWindow = 2 * 60 * 60 * 1000
      const created = deadline - totalWindow
      const now = Date.now()
      const elapsed = now - created
      const pct = Math.min(100, Math.max(0, (elapsed / totalWindow) * 100))
      setProgress(pct)

      const remaining = deadline - now
      if (remaining <= 0) {
        setTimeLeft('Expired')
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
  }, [pickupDeadline])

  const isUrgent = progress > 75
  const isWarning = progress > 50

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold ${isUrgent ? 'text-red-500' : isWarning ? 'text-[#FB923C]' : 'text-[#6CB4EE]'}`}>
          {timeLeft}
        </span>
      </div>
      <div className="h-1.5 bg-[#f0f4f2] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            isUrgent ? 'bg-red-500' : isWarning ? 'bg-[#FB923C]' : 'bg-[#6CB4EE]'
          }`}
          style={{
            background: isUrgent
              ? 'linear-gradient(90deg, #FB923C, #EF4444)'
              : isWarning
              ? 'linear-gradient(90deg, #6CB4EE, #FB923C)'
              : 'linear-gradient(90deg, #8FC5E8, #6CB4EE)',
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
  const [orderTab, setOrderTab] = useState<'active' | 'completed' | 'expired'>('active')
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
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white rounded-xl">
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const activeOrders = orders.filter(o => o.status === 'pending_pickup' || o.status === 'picked_up')
  const completedOrders = orders.filter(o => o.status === 'completed')
  const expiredOrders = orders.filter(o => o.status === 'expired' || o.status === 'cancelled')

  const tabConfig = [
    { key: 'active' as const, label: 'Active', count: activeOrders.length, icon: Clock, color: '#FB923C' },
    { key: 'completed' as const, label: 'Completed', count: completedOrders.length, icon: CheckCircle, color: '#6CB4EE' },
    { key: 'expired' as const, label: 'Expired', count: expiredOrders.length, icon: Timer, color: '#EF4444' },
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
          <Button onClick={() => navigate('home')} className="mt-4 bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white rounded-xl">
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
                {activeOrders.map((order) => (
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
                                <Utensils className="w-6 h-6 text-[#8FC5E8]" />
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
                              <QrCode className="w-5 h-5 text-[#6CB4EE] flex-shrink-0" />
                            </div>
                            {/* Pickup time with orange */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Clock className="w-3 h-3 text-[#FB923C]" />
                              <span className="text-[11px] font-bold text-[#FB923C]">
                                Pickup by {new Date(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <PickupProgressSlider pickupDeadline={order.pickupDeadline} />
                            {/* Price & Status */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#e8edea]">
                              <div>
                                <span className="text-base font-extrabold text-[#6CB4EE]">RM{order.dealPrice.toFixed(2)}</span>
                                {order.originalPrice > order.dealPrice && (
                                  <span className="text-[10px] text-[#EF4444] line-through ml-1.5">RM{order.originalPrice.toFixed(2)}</span>
                                )}
                              </div>
                              <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg font-bold text-[10px]">
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
                                <Utensils className="w-5 h-5 text-[#8FC5E8]" />
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
                                <p className="text-sm font-extrabold text-[#6CB4EE]">RM{order.dealPrice.toFixed(2)}</p>
                                {order.originalPrice > order.dealPrice && (
                                  <p className="text-[10px] text-[#EF4444] line-through">RM{order.originalPrice.toFixed(2)}</p>
                                )}
                              </div>
                            </div>
                            <Badge className="bg-[#7EC8E3]/10 text-[#3D8AC4] border-0 rounded-lg font-bold text-[10px] mt-1.5">
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
              <div className="bg-white rounded-2xl p-4 inline-block border-2 border-[#6CB4EE]/20 shadow-card">
                <QRCodeImage qrCode={selectedOrder.qrCode} />
              </div>
              <p className="mt-4 font-bold text-[#1a1c1e] text-sm font-mono break-all">#{selectedOrder.orderNumber}</p>
              <p className="text-sm text-[#414841] mt-1">RM{selectedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs font-bold text-[#FB923C] mt-2 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Pickup by {new Date(selectedOrder.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              {selectedOrder.status === 'completed' && (
                <Badge className="mt-3 bg-[#7EC8E3]/10 text-[#3D8AC4] border-0 rounded-lg">
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
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('flashbite_settings')
      if (saved) return JSON.parse(saved)
    }
    return {
      pushNotifications: true,
      dealAlerts: true,
      expiringDealAlerts: true,
      locationServices: true,
      orderUpdates: true,
      darkMode: false,
      // Foodie specific
      dietaryPrefs: [] as string[],
      dealAlertRadius: 5,
      // Vendor specific
      autoAcceptOrders: false,
      orderNotificationSound: true,
      lowStockAlerts: true,
      businessHoursVisible: true,
      // Upload
      autoCompress: true,
    }
  })

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('flashbite_settings', JSON.stringify(settings))
    }
  }, [settings])

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
          <Button onClick={() => useAppStore.getState().setShowAuthModal(true)} className="mt-4 bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white rounded-xl">
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
    // Send refresh token in body so the server can delete it even if the
    // access token is expired (cookie may not be available in preview iframe)
    const { refreshToken } = useAuthStore.getState()
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
    logout()
    // Redirect to public homepage for all roles
    // Reset activeRole to 'foodie' so ViewRouter renders FoodieHomeView
    // (auth-store logout() leaves useAppStore.activeRole as previous role)
    useAppStore.getState().setActiveRole('foodie')
    useAppStore.getState().navigate('home')
    useAppStore.getState().setShowAuthModal(false)
    useAppStore.getState().setSidebarOpen(false)
    toast.success('Signed out successfully')
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
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.success) {
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
                isActive ? 'bg-[#6CB4EE] text-white shadow-card' : 'bg-[#f0f4f2] text-[#1a1c1e]'
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
                // Save to profile via API
                apiFetch('/api/auth/profile', {
                  method: 'PUT',
                  body: JSON.stringify({ avatarUrl: url }),
                })
              }}
              circular
              compact
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[#1a1c1e] text-sm truncate">{user?.name}</h2>
              <p className="text-[11px] text-[#414841] truncate">{user?.email}</p>
            </div>
            <Badge className="bg-[#6CB4EE]/10 text-[#6CB4EE] border-0 rounded-lg text-[10px] flex-shrink-0">
              {activeRole === 'foodie' ? '🍽️ Foodie' : activeRole === 'vendor' ? '🏪 Vendor' : '🛡️ Admin'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ===== SETTINGS SECTION ===== */}
      <div className="mb-4">
        <h3 className="font-bold text-[#1a1c1e] text-sm mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#6CB4EE]" /> Settings
        </h3>

        <Accordion type="multiple" defaultValue={[]} className="space-y-2">
          {/* ── Basic Settings ── */}
          <AccordionItem value="basic" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#6CB4EE]" /> Basic
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
                    <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile} className="flex-1 h-9 rounded-xl bg-[#6CB4EE] hover:bg-[#4A96D5] text-white text-xs font-bold">
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
                      <Pencil className="w-3.5 h-3.5 text-[#6CB4EE]" />
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
                      <Pencil className="w-3.5 h-3.5 text-[#6CB4EE]" />
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

          {/* ── Notifications ── */}
          <AccordionItem value="notifications" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FB923C]" /> Notifications
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
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#3D8AC4]" /> Security
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="w-full flex items-center justify-between p-0"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-[#3D8AC4]" />
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

          {/* ── Appearance ── */}
          <AccordionItem value="appearance" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-[#717971]" /> Appearance
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Dark Mode</p>
                  <p className="text-[11px] text-[#717971]">Switch to dark theme</p>
                </div>
                <Switch checked={settings.darkMode} onCheckedChange={v => updateSetting('darkMode', v)} />
              </div>
              <Separator />
              <div>
                <p className="text-sm font-bold text-[#1a1c1e] mb-2">Deal Card Size</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Compact', 'Normal', 'Large'] as const).map(size => (
                    <button
                      key={size}
                      className={`py-2 text-[11px] font-bold rounded-lg transition-all ${
                        size === 'Normal' ? 'bg-[#6CB4EE] text-white' : 'bg-[#e8edea] text-[#1a1c1e]'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Upload & Photos ── */}
          <AccordionItem value="photos" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#6CB4EE]" /> Photos & Uploads
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
              {/* Profile Photo */}
              <ImageUploader
                group="profile"
                currentUrl={avatarUrl}
                onUploadComplete={(url) => {
                  setAvatarUrl(url)
                  apiFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ avatarUrl: url }) })
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
                      apiFetch('/api/vendors/my/logo', { method: 'PUT', body: JSON.stringify({ logoUrl: url }) })
                    }}
                    label="Vendor Logo"
                    sizeHint="200×200px • Auto-resized"
                    circular
                  />
                  <Separator />
                  <ImageUploader
                    group="vendor_banner"
                    onUploadComplete={(url) => {
                      apiFetch('/api/vendors/my/banner', { method: 'PUT', body: JSON.stringify({ bannerUrl: url }) })
                    }}
                    label="Store Banner"
                    sizeHint="1200×400px • Auto-resized"
                  />
                  <Separator />
                </>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a1c1e]">Auto-compress</p>
                  <p className="text-[11px] text-[#717971]">Reduce file size before upload</p>
                </div>
                <Switch checked={settings.autoCompress !== false} onCheckedChange={v => updateSetting('autoCompress', v)} />
              </div>
              <Separator />
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
              <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
                <span className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-[#FB923C]" /> Foodie Preferences
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
                            ? 'bg-[#6CB4EE] text-white'
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
                    <p className="text-xs font-bold text-[#6CB4EE]">{settings.dealAlertRadius} km</p>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={settings.dealAlertRadius}
                    onChange={e => updateSetting('dealAlertRadius', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#e8edea] rounded-full appearance-none cursor-pointer accent-[#6CB4EE]"
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

          {/* ── Vendor-specific Settings ── */}
          {activeRole === 'vendor' && roles.includes('vendor') && (
            <AccordionItem value="vendor" className="border-0">
              <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
                <span className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#6CB4EE]" /> Vendor Settings
                </span>
              </AccordionTrigger>
              <AccordionContent className="bg-[#f8faf9] rounded-b-xl px-3 pb-3 pt-2 space-y-3">
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
                    <CreditCard className="w-4 h-4 text-[#6CB4EE]" />
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
                    <Package className="w-4 h-4 text-[#6CB4EE]" />
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

          {/* ── Advanced ── */}
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="py-2.5 px-3 rounded-xl bg-[#f0f4f2] hover:no-underline hover:bg-[#dfe5e1] text-sm font-bold text-[#1a1c1e] [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7EC8E3]" /> Advanced
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
                  <p className="text-[11px] text-[#717971]">Help improve FlashBite with usage data</p>
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
                      localStorage.removeItem('flashbite_settings')
                      localStorage.removeItem('flashbite_cache')
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
                <p className="text-[11px] text-[#717971]">FlashBite v1.0.0 (MVP)</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Quick Links */}
      <div className="space-y-2 mb-4">
        {roles.includes('vendor') && activeRole !== 'vendor' && (
          <button onClick={() => navigate('subscription')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
            <CreditCard className="w-5 h-5 text-[#6CB4EE]" />
            <div className="text-left flex-1">
              <p className="font-bold text-sm text-[#1a1c1e]">Subscription Plan</p>
              <p className="text-[11px] text-[#414841]">Manage your vendor subscription</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#717971]" />
          </button>
        )}
        {!roles.includes('vendor') && (
          <button onClick={() => navigate('register-vendor')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#8FC5E8]/20 to-[#6CB4EE]/5 hover:from-[#8FC5E8]/30 hover:to-[#6CB4EE]/10 transition-colors">
            <Sparkles className="w-5 h-5 text-[#6CB4EE]" />
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
              <KeyRound className="w-5 h-5 text-[#3D8AC4]" /> Change Password
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
              className="w-full h-10 rounded-xl bg-gradient-to-b from-[#3D8AC4] to-[#2E6DA4] text-white font-bold"
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

  const fetchVendorData = useCallback(() => {
    setLoading(true)
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
          })
        }
      }
      if (oRes.success && oRes.data) {
        const o = (oRes.data as { orders?: Order[] }).orders || oRes.data
        setOrders(Array.isArray(o) ? o : [])
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchVendorData() }, [fetchVendorData])

  // Classify deals into active and expired
  const isActiveDeal = (d: Deal) => {
    if (d.status === 'expired' || d.status === 'cancelled') return false
    if (d.status === 'active' && new Date(d.expiresAt) <= new Date()) return false
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
      expiresAt: new Date(deal.expiresAt).toISOString().slice(0, 16),
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
    const d = new Date(dateStr)
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
            <User className="w-5 h-5 text-[#6CB4EE]" />
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
                <DollarSign className="w-6 h-6 text-[#6CB4EE] mx-auto mb-1" />
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
                <ShoppingBag className="w-6 h-6 text-[#7EC8E3] mx-auto mb-1" />
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
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate('create-deal')} className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 rounded-2xl shadow-chip">
              <div className="w-10 h-10 rounded-xl bg-[#6CB4EE] flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Create Deal</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate('fulfillment')} className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-[#FB923C]/20 to-[#F97316]/10 rounded-2xl shadow-chip">
              <div className="w-10 h-10 rounded-xl bg-[#FB923C] flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#1a1c1e]">Fulfillment</span>
            </motion.button>
          </div>

          {/* Shop Location */}
          {vendor && (
            <Card className="border-0 shadow-card rounded-2xl mb-6 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#FB923C]" />
                    <h3 className="font-bold text-[#1a1c1e] text-sm">Shop Location</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openLocationModal}
                    className="h-8 rounded-lg text-xs font-bold border-[#6CB4EE]/30 text-[#6CB4EE] hover:bg-[#6CB4EE]/10"
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
                activeTab === 'active' ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
              }`}
            >
              <Flame className="w-4 h-4" />
              Active
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'active' ? 'bg-[#6CB4EE] text-white' : 'bg-[#d7ddd9] text-[#717971]'
              }`}>{activeDeals.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('expired')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'expired' ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
              }`}
            >
              <Clock className="w-4 h-4" />
              Expired
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'expired' ? 'bg-[#6CB4EE] text-white' : 'bg-[#d7ddd9] text-[#717971]'
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
                            <span className="ml-1 text-[#FB923C] font-bold">-{deal.discountPercent}%</span>
                          </p>
                        </div>
                        <Badge className={`border-0 rounded-lg text-xs flex-shrink-0 ${
                          activeTab === 'active'
                            ? 'bg-[#7EC8E3]/10 text-[#3D8AC4]'
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
                          className="flex-1 h-9 rounded-xl text-xs font-bold border-[#6CB4EE]/30 text-[#6CB4EE] hover:bg-[#6CB4EE]/10"
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
              <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
                    isActiveDeal(selectedDeal) ? 'bg-[#7EC8E3]/10 text-[#3D8AC4]' : 'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {isActiveDeal(selectedDeal) ? 'Active' : selectedDeal.status}
                  </Badge>
                  <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg text-xs">
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
                  <div className="bg-[#6CB4EE]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#6CB4EE]">RM{selectedDeal.dealPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Inventory */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{selectedDeal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#FB923C]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#FB923C]">{selectedDeal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#7EC8E3]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#3D8AC4]">{selectedDeal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#6CB4EE]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Left</p>
                    <p className="font-bold text-[#6CB4EE]">{selectedDeal.availableQuantity}</p>
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Timer className="w-4 h-4 text-[#FB923C]" />
                    <span className="text-[#414841]">Expires: {formatDate(selectedDeal.expiresAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-[#6CB4EE]" />
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
                    className="flex-1 h-11 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white"
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
          <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
              <div className="bg-[#EBF5FB] rounded-xl p-3 text-center">
                <p className="text-sm text-[#3D8AC4] font-bold">🔥 {editDiscount}% Discount</p>
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
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1.5" /> Save Changes</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Shop Location Modal ===== */}
      <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
        <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
            >
              {savingLocation ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-1.5" /> Save Location</>}
            </Button>
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
              s <= step ? 'bg-[#6CB4EE] text-white' : 'bg-[#e8edea] text-[#717971]'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 rounded ${s < step ? 'bg-[#6CB4EE]' : 'bg-[#e8edea]'}`} />}
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
          <Button onClick={() => setStep(2)} className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white">
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
            <div className="bg-[#EBF5FB] rounded-xl p-3 text-center">
              <p className="text-sm text-[#3D8AC4] font-bold">🔥 {discountPercent}% Discount</p>
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
            <Button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white">
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
                <Badge className="bg-[#6CB4EE]/10 text-[#6CB4EE] border-0 rounded-lg">{form.category}</Badge>
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
                  <p className="font-bold text-[#6CB4EE] text-lg">RM{form.dealPrice}</p>
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
              className="flex-1 h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
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
    if (d.status === 'active' && new Date(d.expiresAt) <= new Date()) return false
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
            activeTab === 'active' ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
          }`}
        >
          <Flame className="w-4 h-4" />
          Active
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'active' ? 'bg-[#6CB4EE] text-white' : 'bg-[#d7ddd9] text-[#717971]'
          }`}>{activeDeals.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'expired' ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
          }`}
        >
          <Clock className="w-4 h-4" />
          Expired
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            activeTab === 'expired' ? 'bg-[#6CB4EE] text-white' : 'bg-[#d7ddd9] text-[#717971]'
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
                    isActiveDeal(deal) ? 'bg-[#7EC8E3]/10 text-[#3D8AC4]' : 'bg-[#717971]/10 text-[#717971]'
                  }`}>
                    {isActiveDeal(deal) ? 'Active' : deal.status}
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
                  <div className="bg-[#7EC8E3]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#3D8AC4]">{deal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#6CB4EE]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Available</p>
                    <p className="font-bold text-[#6CB4EE]">{deal.availableQuantity}</p>
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
  const [cameraActive, setCameraActive] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending')

  // Camera scanner refs
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrcodeRef = useRef<unknown>(null)

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

  // Start camera scanner
  const startScanner = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scannerId = 'qr-scanner-container'

      const html5QrCode = new Html5Qrcode(scannerId)
      html5QrcodeRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          // QR code detected — auto scan
          handleScanFromCamera(decodedText)
        },
        () => {
          // QR code not found (ignore - continuous scanning)
        }
      )
      setCameraActive(true)
    } catch (err) {
      console.error('Camera error:', err)
      toast.error('Camera access denied or not available. Use manual QR input instead.')
      setCameraActive(false)
    }
  }

  // Stop camera scanner
  const stopScanner = async () => {
    try {
      const html5QrCode = html5QrcodeRef.current as { stop: () => Promise<void>; clear: () => void } | null
      if (html5QrCode) {
        await html5QrCode.stop()
        html5QrCode.clear()
      }
    } catch {
      // Ignore stop errors
    }
    html5QrcodeRef.current = null
    setCameraActive(false)
  }

  // Handle scan from camera
  const handleScanFromCamera = async (qrCode: string) => {
    // Stop scanner while processing
    await stopScanner()
    setScanning(true)
    try {
      const res = await apiFetch<{
        order: { id: string; orderNumber: string; status: string; quantity: number; totalPrice: number; pickupDeadline: string; createdAt: string }
        deal: { id: string; title: string; description?: string; imageUrl?: string; category?: string; pickupInstructions?: string; originalPrice: number; dealPrice: number } | null
        vendor: { id: string; businessName: string; address: string } | null
        canComplete: boolean
      }>('/api/orders/scan', {
        method: 'POST',
        body: JSON.stringify({ qrCode }),
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

  // Scan QR code — lookup order (manual input)
  const handleScan = async () => {
    if (!qrInput.trim()) return
    setScanning(true)
    try {
      const res = await apiFetch<{
        order: { id: string; orderNumber: string; status: string; quantity: number; totalPrice: number; pickupDeadline: string; createdAt: string }
        deal: { id: string; title: string; description?: string; imageUrl?: string; category?: string; pickupInstructions?: string; originalPrice: number; dealPrice: number } | null
        vendor: { id: string; businessName: string; address: string } | null
        canComplete: boolean
      }>('/api/orders/scan', {
        method: 'POST',
        body: JSON.stringify({ qrCode: qrInput.trim() }),
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

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current) {
        const html5QrCode = html5QrcodeRef.current as { stop: () => Promise<void>; clear: () => void }
        html5QrCode.stop().catch(() => {})
      }
    }
  }, [])

  return (
    <div className="pb-28 px-5 pt-2">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={goBack} className="p-2 rounded-xl bg-[#f0f4f2] hover:bg-[#dfe5e1] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#1a1c1e]" />
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1c1e]">Fulfillment</h1>
      </div>

      {/* QR Scanner Card — compact */}
      <Card className="border-0 shadow-card rounded-2xl mb-4 overflow-hidden">
        <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-4 pt-3 pb-1.5">
          <h3 className="font-bold text-sm text-[#1a1c1e] flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-[#6CB4EE]" /> Scan QR Code
          </h3>
          <p className="text-[10px] text-[#414841]">Scan customer&apos;s QR to verify & complete pickup</p>
        </div>
        <CardContent className="p-3 space-y-2">
          {/* Camera Scanner Toggle */}
          {!cameraActive ? (
            <Button
              onClick={startScanner}
              className="w-full h-10 rounded-xl font-bold text-sm bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Open Camera Scanner
            </Button>
          ) : (
            <div className="space-y-3">
              <div
                ref={scannerRef}
                id="qr-scanner-container"
                className="w-full rounded-xl overflow-hidden border-2 border-[#6CB4EE]/30"
                style={{ minHeight: '180px' }}
              />
              <Button
                onClick={stopScanner}
                variant="outline"
                className="w-full h-9 rounded-xl font-bold text-xs text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/10"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Stop Scanner
              </Button>
            </div>
          )}

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
              className="h-10 px-4 rounded-xl font-bold text-sm bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white"
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
              ? 'bg-[#FB923C] text-white shadow-card'
              : 'bg-[#f0f4f2] text-[#414841]'
          }`}
        >
          <Clock className="w-4 h-4" /> Pending ({pendingPickup.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'completed'
              ? 'bg-[#6CB4EE] text-white shadow-card'
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
                      Pickup by: {new Date(order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg text-xs">Pending</Badge>
                    <Button
                      size="sm"
                      onClick={() => quickScan(order)}
                      className="h-8 px-3 rounded-lg text-xs font-bold bg-[#6CB4EE] text-white hover:bg-[#4A96D5]"
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
                        <Utensils className="w-4 h-4 text-[#8FC5E8]" />
                      </div>
                    )}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {/* Deal name above order ID */}
                    <p className="text-xs font-bold text-[#1a1c1e] truncate">{order.deal?.title || 'Deal'}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-[#717971] font-mono truncate">#{order.orderNumber}</p>
                      <Badge className="bg-[#7EC8E3]/10 text-[#3D8AC4] border-0 rounded text-[8px] h-3.5 px-1">Done</Badge>
                    </div>
                    {/* Timestamps — compact */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[9px] text-[#717971] flex items-center gap-0.5">
                        <Zap className="w-2 h-2 text-[#FB923C]" />
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-[9px] text-[#717971] flex items-center gap-0.5">
                        <ScanLine className="w-2 h-2 text-[#6CB4EE]" />
                        Redeemed: {order.qrVerifiedAt
                          ? new Date(order.qrVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                      </p>
                    </div>
                  </div>
                  {/* Price right-center */}
                  <div className="flex-shrink-0 flex flex-col items-end justify-center">
                    <p className="text-xs font-extrabold text-[#6CB4EE]">RM{order.dealPrice.toFixed(2)}</p>
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
              <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
                      ? 'bg-[#FB923C]/10 text-[#FB923C]'
                      : 'bg-[#7EC8E3]/10 text-[#3D8AC4]'
                  }`}>
                    {scanResult.order.status === 'pending_pickup' ? 'Pending Pickup' : scanResult.order.status}
                  </Badge>
                </div>

                {/* Deal Info */}
                {scanResult.deal && (
                  <div className="bg-[#f0f4f2] rounded-xl p-3">
                    <p className="font-bold text-sm text-[#1a1c1e]">{scanResult.deal.title}</p>
                    {scanResult.deal.category && (
                      <Badge className="mt-1 bg-[#6CB4EE]/10 text-[#6CB4EE] border-0 rounded-lg text-[10px]">
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
                  <div className="bg-[#6CB4EE]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#6CB4EE]">
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
                  <div className="bg-[#6CB4EE]/10 rounded-lg p-2 text-center">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#6CB4EE]">RM{scanResult.order.totalPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Pickup Deadline */}
                <div className="flex items-center gap-2 text-sm text-[#414841]">
                  <Clock className="w-4 h-4 text-[#FB923C]" />
                  Pickup by: {new Date(scanResult.order.pickupDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                {/* Actions */}
                {scanResult.canComplete ? (
                  <Button
                    onClick={handleComplete}
                    disabled={completing}
                    className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
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
                className="w-16 h-16 rounded-full bg-[#6CB4EE]/20 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="w-8 h-8 text-[#6CB4EE]" />
              </motion.div>
              <h3 className="text-xl font-extrabold text-[#1a1c1e]">Order Completed!</h3>
              <p className="text-sm text-[#414841] mt-2">
                Order #{completedOrder.orderNumber} has been picked up successfully.
              </p>
              {completedOrder.dealTitle && (
                <p className="text-sm text-[#6CB4EE] font-bold mt-1">{completedOrder.dealTitle}</p>
              )}
              <p className="text-lg font-extrabold text-[#1a1c1e] mt-2">RM{completedOrder.totalPrice.toFixed(2)}</p>
              <p className="text-xs text-[#717971] mt-1">
                Completed at {new Date(completedOrder.completedAt).toLocaleTimeString()}
              </p>
              <Button
                onClick={() => setCompletedOrder(null)}
                className="mt-4 w-full h-11 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white"
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
        <Card className="border-0 shadow-card rounded-2xl mb-5 bg-gradient-to-br from-[#6CB4EE] to-[#4A96D5]">
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
        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_basic' ? 'ring-2 ring-[#6CB4EE]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-[#1a1c1e]">Basic</h3>
                <p className="text-2xl font-extrabold text-[#6CB4EE]">RM99<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_basic' && (
                <Badge className="bg-[#6CB4EE] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Unlimited flash deals</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Inventory management</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> QR fulfillment</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Basic statistics</li>
            </ul>
            {vendor?.subscriptionPlan !== 'vendor_basic' && (
              <Button onClick={() => handleActivate('vendor_basic')} disabled={activating} className="w-full mt-4 h-11 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white">
                {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Choose Basic'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-card rounded-2xl ${vendor?.subscriptionPlan === 'vendor_premium' ? 'ring-2 ring-[#6CB4EE]' : ''}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-[#1a1c1e]">Premium</h3>
                  <Sparkles className="w-4 h-4 text-[#FB923C]" />
                </div>
                <p className="text-2xl font-extrabold text-[#6CB4EE]">RM199<span className="text-sm font-normal text-[#717971]">/month</span></p>
              </div>
              {vendor?.subscriptionPlan === 'vendor_premium' && (
                <Badge className="bg-[#6CB4EE] text-white border-0 rounded-lg">Active</Badge>
              )}
            </div>
            <ul className="space-y-1.5 text-sm text-[#414841]">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Everything in Basic</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Advanced analytics</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Priority ranking</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#7EC8E3]" /> Marketing tools</li>
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

      <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-[#6CB4EE] flex items-center justify-center">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-[#1a1c1e]">Start Selling on FlashBite</h2>
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
          <Label className="font-semibold text-[#1a1c1e]">Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Tell customers about your food..." className="mt-1.5 rounded-xl min-h-[80px]" />
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
          className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
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
            <User className="w-5 h-5 text-[#6CB4EE]" />
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
                <Users className="w-6 h-6 text-[#6CB4EE] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Total Users</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalUsers as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('vendors')}>
              <CardContent className="p-4 text-center">
                <Store className="w-6 h-6 text-[#7EC8E3] mx-auto mb-1" />
                <p className="text-xs text-[#414841]">Vendors</p>
                <p className="text-lg font-extrabold text-[#1a1c1e]">{(analytics?.overview?.totalVendors as number) || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover transition-shadow active:scale-95" onClick={() => navigate('admin-deals')}>
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 text-[#FB923C] mx-auto mb-1" />
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
              { icon: Store, label: 'Vendor Management', view: 'vendors' as AppView, color: 'text-[#7EC8E3]' },
              { icon: Users, label: 'User Management', view: 'users' as AppView, color: 'text-[#6CB4EE]' },
              { icon: BarChart3, label: 'Analytics', view: 'analytics' as AppView, color: 'text-[#FB923C]' },
              { icon: Camera, label: 'Upload Settings', view: 'upload-settings' as AppView, color: 'text-[#8FC5E8]' },
              { icon: ImageIcon, label: 'Media Settings', view: 'media' as AppView, color: 'text-[#FB923C]' },
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
                  <div className="w-10 h-10 rounded-lg bg-[#6CB4EE]/10 flex items-center justify-center flex-shrink-0">
                    <Flame className="w-5 h-5 text-[#6CB4EE]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#1a1c1e] truncate">{deal.title}</p>
                    <p className="text-[11px] text-[#717971] truncate">
                      {deal.vendor?.businessName || 'Unknown Vendor'} • RM{deal.dealPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                    <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-md text-[10px] px-1.5 py-0">
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
              <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
                  <Badge className="bg-[#7EC8E3]/10 text-[#3D8AC4] border-0 rounded-lg text-xs">Active</Badge>
                  <Badge className="bg-[#FB923C]/10 text-[#FB923C] border-0 rounded-lg text-xs">-{selectedDeal.discountPercent}%</Badge>
                </div>

                {/* Description */}
                <p className="text-sm text-[#414841]">{selectedDeal.description}</p>

                {/* Vendor Info */}
                {selectedDeal.vendor && (
                  <div className="bg-[#f0f4f2] rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-bold text-[#1a1c1e] flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#6CB4EE]" /> Vendor Details
                    </p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Name:</span> {selectedDeal.vendor.businessName}</p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Address:</span> {selectedDeal.vendor.address}</p>
                    <p className="text-xs text-[#414841]"><span className="font-semibold">Email:</span> {selectedDeal.vendor.contactEmail}</p>
                    <Badge className={`border-0 rounded-md text-[10px] px-1.5 py-0 ${
                      selectedDeal.vendor.verificationStatus === 'approved' ? 'bg-[#7EC8E3]/10 text-[#3D8AC4]' :
                      selectedDeal.vendor.verificationStatus === 'pending' ? 'bg-[#FB923C]/10 text-[#FB923C]' :
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
                  <div className="bg-[#6CB4EE]/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-[#717971]">Deal Price</p>
                    <p className="font-bold text-[#6CB4EE]">RM{selectedDeal.dealPrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Inventory */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#f0f4f2] rounded-lg p-2">
                    <p className="text-[#717971]">Total</p>
                    <p className="font-bold text-[#1a1c1e]">{selectedDeal.totalQuantity}</p>
                  </div>
                  <div className="bg-[#FB923C]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Reserved</p>
                    <p className="font-bold text-[#FB923C]">{selectedDeal.reservedQuantity}</p>
                  </div>
                  <div className="bg-[#7EC8E3]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Sold</p>
                    <p className="font-bold text-[#3D8AC4]">{selectedDeal.soldQuantity}</p>
                  </div>
                  <div className="bg-[#6CB4EE]/10 rounded-lg p-2">
                    <p className="text-[#717971]">Left</p>
                    <p className="font-bold text-[#6CB4EE]">{selectedDeal.availableQuantity}</p>
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#414841]">
                    <Timer className="w-4 h-4 text-[#FB923C]" />
                    Expires: {new Date(selectedDeal.expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#414841]">
                    <Clock className="w-4 h-4 text-[#6CB4EE]" />
                    Created: {new Date(selectedDeal.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
  const [filter, setFilter] = useState('new')
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
          vList = vList.filter((v) => new Date(v.createdAt) >= threeDaysAgo)
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
              filter === f ? 'bg-[#6CB4EE] text-white' : 'bg-[#e8edea] text-[#414841]'
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
                <div className="w-8 h-8 rounded-lg bg-[#7EC8E3]/10 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-[#7EC8E3]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-xs text-[#1a1c1e] truncate">{v.businessName}</p>
                    <Badge className={`border-0 rounded-md text-[9px] px-1 py-0 flex-shrink-0 ${
                      v.verificationStatus === 'approved' ? 'bg-[#7EC8E3]/10 text-[#3D8AC4]' :
                      v.verificationStatus === 'pending' ? 'bg-[#FB923C]/10 text-[#FB923C]' :
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
                      <Button size="sm" onClick={() => handleAction(v.id, 'approve')} className="h-7 px-2 rounded-lg bg-[#7EC8E3] hover:bg-[#3D8AC4] text-white text-[10px] font-bold">
                        ✓
                      </Button>
                      <Button size="sm" onClick={() => handleAction(v.id, 'reject', 'Does not meet requirements')} variant="outline" className="h-7 px-2 rounded-lg text-[10px] font-bold text-[#EF4444] border-[#EF4444]/30">
                        ✗
                      </Button>
                    </>
                  )}
                  {v.verificationStatus === 'suspended' && (
                    <Button size="sm" onClick={() => handleAction(v.id, 'restore')} className="h-7 px-2 rounded-lg text-[10px] font-bold bg-[#6CB4EE] text-white">
                      ↻
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(v)}
                    className="h-7 px-2 rounded-lg text-[10px] font-bold border-[#6CB4EE]/30 text-[#6CB4EE] hover:bg-[#6CB4EE]/10"
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
          <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-5 pt-5 pb-3">
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
              className="w-full h-11 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
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
  const [filter, setFilter] = useState('new')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

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

  // Client-side filter for "new" (registered within 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const filteredUsers = filter === 'new'
    ? users.filter(u => (u as AuthUser & { createdAt?: string }).createdAt && new Date((u as AuthUser & { createdAt?: string }).createdAt!) >= threeDaysAgo)
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
              filter === f ? 'bg-[#6CB4EE] text-white' : 'bg-[#e8edea] text-[#414841]'
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
              const userWithDate = u as AuthUser & { createdAt?: string }
              const isNew = userWithDate.createdAt && new Date(userWithDate.createdAt) >= threeDaysAgo
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-2.5 p-2.5 bg-white shadow-card rounded-lg"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#6CB4EE]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#6CB4EE]">{u.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-xs text-[#1a1c1e] truncate">{u.name}</p>
                      {isNew && (
                        <span className="text-[8px] font-bold text-[#6CB4EE] bg-[#6CB4EE]/10 px-1 py-0 rounded">NEW</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#717971] truncate">{u.email}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {getRoles(u.roles).map((r) => (
                      <Badge key={r} className="bg-[#e8edea] text-[#6CB4EE] border-0 rounded-md text-[9px] px-1 py-0">
                        {r}
                      </Badge>
                    ))}
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
              { label: 'Total Users', value: analytics?.overview?.totalUsers || 0, icon: Users, color: 'text-[#6CB4EE]', bg: 'bg-[#6CB4EE]/10' },
              { label: 'Total Vendors', value: analytics?.overview?.totalVendors || 0, icon: Store, color: 'text-[#7EC8E3]', bg: 'bg-[#7EC8E3]/10' },
              { label: 'Active Deals', value: (analytics?.dealsByStatus as Record<string, number>)?.active || 0, icon: Flame, color: 'text-[#FB923C]', bg: 'bg-[#FB923C]/10' },
              { label: 'Total Orders', value: analytics?.overview?.totalOrders || 0, icon: ShoppingBag, color: 'text-[#4A6A8A]', bg: 'bg-[#4A6A8A]/10' },
              { label: 'Total Revenue', value: `RM${(analytics?.overview?.totalRevenue || 0).toFixed(0)}`, icon: DollarSign, color: 'text-[#6CB4EE]', bg: 'bg-[#6CB4EE]/10' },
              { label: 'Meals Saved', value: analytics?.overview?.totalOrders || 0, icon: Heart, color: 'text-[#7EC8E3]', bg: 'bg-[#7EC8E3]/10' },
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
              <AdminBarChart data={analytics.historical.dailyDeals} label="Active Deals" color="#6CB4EE" />
            )}
            {analytics?.historical?.dailyOrders && (
              <AdminBarChart data={analytics.historical.dailyOrders} label="Total Orders" color="#FB923C" />
            )}
          </div>
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
      <Bell className="w-5 h-5 text-[#6CB4EE]" />
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
  info: { bg: 'bg-[#eaf4fb]', text: 'text-[#2563a8]', border: 'border-[#bfe0f5]', dot: 'bg-[#6CB4EE]', label: 'Info' },
  warning: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500', label: 'Warning' },
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
                    <FileImage className="w-4 h-4 text-[#6CB4EE]" />
                    <span className="text-xs font-semibold text-[#717971] uppercase tracking-wide">Total Files</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1a1c1e]">{data.overview.totalFiles}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-card rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-[#FB923C]" />
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
                className={`rounded-2xl border p-4 ${alertLevels.critical ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${alertLevels.critical ? 'bg-red-500' : 'bg-orange-500'}`}>
                    <AlertOctagon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-sm ${alertLevels.critical ? 'text-red-700' : 'text-orange-700'}`}>
                      {alertLevels.critical ? 'Critical Alert' : 'Warning Alert'}
                    </h3>
                    <p className={`text-xs mt-0.5 ${alertLevels.critical ? 'text-red-600' : 'text-orange-600'}`}>
                      {alertLevels.critical || 0} critical file(s) over 1.5MB · {alertLevels.warning || 0} warning file(s) over 700KB
                    </p>
                  </div>
                  <BellRing className={`w-5 h-5 ${alertLevels.critical ? 'text-red-400' : 'text-orange-400'} animate-pulse`} />
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
                    <span className="text-[#6CB4EE]">&lt;700KB</span>·
                    <span className="text-orange-500">&gt;700KB</span>·
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
                            isLargest ? 'bg-[#FB923C] text-white' : 'bg-white text-[#717971] border border-[#e8edea]'
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
                              {file.group} · {file.uploader?.name || 'Unknown'} · {new Date(file.createdAt).toLocaleDateString()}
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
                              {file.group} · {new Date(file.createdAt).toLocaleString()}
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
                              ? 'linear-gradient(to top, #6CB4EE, #FB923C)'
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
    watermarkText: 'FlashBite',
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
                <Shield className="w-4 h-4 text-[#6CB4EE]" /> File Limits
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
                <Sparkles className="w-4 h-4 text-[#6CB4EE]" /> Auto-Processing
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
                <Eye className="w-4 h-4 text-[#6CB4EE]" /> Moderation
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
                      value={String(settings.watermarkText || 'FlashBite')}
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
                          ? 'bg-[#6CB4EE] text-white'
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
                <Globe className="w-4 h-4 text-[#6CB4EE]" /> CDN
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
                <Camera className="w-4 h-4 text-[#6CB4EE]" /> Size Reference
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
                    <code className="text-[10px] text-[#6CB4EE] bg-[#6CB4EE]/5 px-2 py-0.5 rounded">
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
            className="w-full h-12 rounded-xl font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white active:scale-95 transition-transform"
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
                isActive ? 'text-[#6CB4EE]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#6CB4EE]" />
                )}
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-[#6CB4EE]' : ''}`}>{tab.label}</span>
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
                isActive ? 'text-[#6CB4EE]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#6CB4EE]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#6CB4EE]' : ''}`}>{tab.label}</span>
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
                isActive ? 'text-[#6CB4EE]' : 'text-[#717971]'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {isActive && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#6CB4EE]" />}
              </div>
              <span className={`text-[9px] font-semibold ${isActive ? 'text-[#6CB4EE]' : ''}`}>{tab.label}</span>
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
        case 'admin-deals': return <AdminDealsView />
        case 'upload-settings': return <AdminUploadSettingsView />
        case 'media': return <AdminMediaView />
        case 'profile': return <FoodieProfileView />
        case 'register-vendor': return <VendorRegistrationView />
        default: return <AdminDashboardView />
      }
    }

    return <FoodieHomeView />
  }

  const renderBottomNav = () => {
    // Don't show bottom nav on deal-detail or register-vendor views
    if (currentView === 'deal-detail' || currentView === 'register-vendor') return null
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
        <div className="bg-gradient-to-br from-[#8FC5E8]/20 to-[#6CB4EE]/10 px-6 pt-6 pb-2">
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
                isLogin ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                !isLogin ? 'bg-white text-[#6CB4EE] shadow-chip' : 'text-[#414841]'
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
                        ? 'border-[#6CB4EE] bg-[#6CB4EE]/10'
                        : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                    }`}
                  >
                    <Utensils className={`w-5 h-5 ${role === 'foodie' ? 'text-[#6CB4EE]' : 'text-[#717971]'}`} />
                    <span className={`text-xs font-bold ${role === 'foodie' ? 'text-[#6CB4EE]' : 'text-[#414841]'}`}>Find Deals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('vendor')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      role === 'vendor'
                        ? 'border-[#6CB4EE] bg-[#6CB4EE]/10'
                        : 'border-[#e8edea] bg-white hover:border-[#d7ddd9]'
                    }`}
                  >
                    <Store className={`w-5 h-5 ${role === 'vendor' ? 'text-[#6CB4EE]' : 'text-[#717971]'}`} />
                    <span className={`text-xs font-bold ${role === 'vendor' ? 'text-[#6CB4EE]' : 'text-[#414841]'}`}>Sell Food</span>
                  </button>
                </div>
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-base font-bold bg-gradient-to-b from-[#8FC5E8] to-[#6CB4EE] text-white hover:opacity-90 active:scale-95 transition-all"
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
        logout()
      }
    }).finally(() => setLoading(false))
  }, [login, logout, setLoading])

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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#8FC5E8] to-[#6CB4EE] mb-4 shadow-card">
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
      <GeolocationGate />
    </>
  )
}
