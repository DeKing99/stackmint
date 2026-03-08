export {}

// Create a type for the Roles
export type Roles = 'owner' | 'manager' | 'member' | 'admin'

declare global {
  interface CustomJwtSessionClaims {
    user_public_metadata: {
      allowed_locations?: string[]
    }
  }
}