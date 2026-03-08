'use server'

import { checkOrgAdminPower } from '@/utils/roles'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export async function setRole(formData: FormData): Promise<void> {
  const client = await clerkClient()

  // Check that the user trying to set the role has org admin power
  const canManage = await checkOrgAdminPower()
  if (!canManage) {
    return
  }

  try {
    const userId = formData.get('id') as string
    const role = formData.get('role') as string

    const user = await client.users.getUser(userId)
    await client.users.updateUser(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        role: role,
      },
    })

    revalidatePath('/admin')
    return
  } catch (err) {
    console.error('Error updating role:', err)
    return
  }
}

export async function removeRole(formData: FormData): Promise<void> {
  const client = await clerkClient()

  // Check that the user trying to remove the role has org admin power
  const canManage = await checkOrgAdminPower()
  if (!canManage) {
    return
  }

  try {
    const userId = formData.get('id') as string

    const user = await client.users.getUser(userId)
    await client.users.updateUser(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        role: 'member', // Default to member instead of null
      },
    })

    revalidatePath('/admin')
    return
  } catch (err) {
    console.error('Error removing role:', err)
    return
  }
}