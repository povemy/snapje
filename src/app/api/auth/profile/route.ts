import { NextResponse } from 'next/server'
import { getAuthUser, parseRoles } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PUT(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, phone } = body

    // Build update object with only provided fields
    const updateData: Record<string, string> = {}
    if (name && name.trim()) updateData.name = name.trim()
    if (phone !== undefined) updateData.phone = phone.trim() || null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Update user in database
    const { data: updatedUser, error: updateError } = await supabase
      .from('User')
      .update(updateData)
      .eq('id', authUser.userId)
      .select()
      .single()

    if (updateError) {
      console.error('Profile update error:', updateError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const { passwordHash: _, ...userWithoutPassword } = updatedUser
    return NextResponse.json({
      success: true,
      data: {
        ...userWithoutPassword,
        roles: parseRoles(updatedUser.roles),
      },
    })
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
