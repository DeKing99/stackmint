import { SignIn } from '@clerk/nextjs'
import React from 'react'

const SignInPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <SignIn
        appearance={{
          elements: {
            footer: null,
            formButtonPrimary: 'bg-[#0057FF] hover:bg-[#0057FF]/90 text-white',
          },
        }}
      />
    </div>
  )
}

export default SignInPage