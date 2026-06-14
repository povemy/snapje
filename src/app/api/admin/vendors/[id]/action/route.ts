import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasRole } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = await getAuthUser()

    if (!authUser || !hasRole(authUser.roles.join(','), 'admin')) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const vendor = await db.vendor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { action, reason } = body

    const validActions = ['approve', 'reject', 'suspend', 'restore']
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    // Map actions to verification status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      suspend: 'suspended',
      restore: 'approved',
    }

    const newStatus = statusMap[action]

    // Update vendor and create notification in transaction
    const updatedVendor = await db.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data: {
          verificationStatus: newStatus,
          ...(action === 'approve' ? { verifiedAt: new Date(), rejectionReason: null } : {}),
          ...(action === 'reject' ? { rejectionReason: reason || 'No reason provided' } : {}),
          ...(action === 'restore' ? { rejectionReason: null } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Create notification for the vendor user
      const notificationMap: Record<string, { type: string; title: string; message: string }> = {
        approve: {
          type: 'vendor_approved',
          title: 'Vendor Account Approved! 🎉',
          message: `Your vendor account "${vendor.businessName}" has been approved. You can now create flash deals!`,
        },
        reject: {
          type: 'vendor_rejected',
          title: 'Vendor Account Rejected',
          message: `Your vendor account "${vendor.businessName}" application has been rejected. Reason: ${reason || 'No reason provided'}`,
        },
        suspend: {
          type: 'vendor_rejected',
          title: 'Vendor Account Suspended',
          message: `Your vendor account "${vendor.businessName}" has been suspended. Reason: ${reason || 'No reason provided'}`,
        },
        restore: {
          type: 'vendor_approved',
          title: 'Vendor Account Restored',
          message: `Your vendor account "${vendor.businessName}" has been restored and is now active.`,
        },
      }

      const notif = notificationMap[action]
      await tx.notification.create({
        data: {
          userId: vendor.userId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          data: JSON.stringify({
            vendorId: vendor.id,
            action,
            reason: reason || null,
          }),
        },
      })

      return updated
    })

    return NextResponse.json({
      success: true,
      data: updatedVendor,
      message: `Vendor ${action}d successfully`,
    })
  } catch (error) {
    console.error('Admin vendor action error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
