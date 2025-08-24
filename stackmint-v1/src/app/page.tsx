import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Shield, BarChart3, Users, Globe, ArrowRight, Play, Menu } from "lucide-react"
import Link from "next/link"
import { SignedIn, SignedOut, SignInButton, SignOutButton } from "@clerk/nextjs"
import Image from "next/image"

export default function StackmintLanding() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <Image
                  src="/stackmint logo blue white bg.png"
                  alt="Stackmint Logo"
                  width={64}
                  height={64}
                />
                <span className="text-xl font-bold text-[#0057FF]">
                  stackmint
                </span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <Link
                href="#"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Product
              </Link>
              <Link
                href="#"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Solutions
              </Link>
              <Link
                href="#"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Resources
              </Link>
              <Link
                href="#"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Pricing
              </Link>
              <Link
                href="#"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Company
              </Link>
            </nav>

            {/* CTA Buttons */}
            <div className="flex items-center space-x-3">
              <SignedOut>
                <SignInButton forceRedirectUrl={"/redirect"}>
                  <Button
                    variant="ghost"
                    className="hidden sm:inline-flex text-gray-600 hover:text-gray-900 cursor-pointer"
                  >
                    <Link href="/sign-in">Sign In</Link>
                  </Button>
                </SignInButton>
                <Button className="bg-[#0057FF] hover:bg-[#0057FF]/90 text-white">
                  Contact Sales
                </Button>
              </SignedOut>
              <SignedIn>
                <SignOutButton>
                  <Button
                    variant="ghost"
                    className="hidden sm:inline-flex text-gray-600 hover:text-gray-900"
                  >
                    Logout
                  </Button>
                </SignOutButton>
                <Link href="/redirect">
                  <Button className="bg-[#0057FF] hover:bg-[#0057FF]/90 text-white">
                    Dashboard
                  </Button>
                </Link>
              </SignedIn>
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              The most comprehensive
              <br />
              <span className="text-[#0057FF]">ESG Compliance Platform</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Need more than just basic compliance tracking? Stackmint is a
              complete suite of ESG tools, automated reporting, and analytics
              dashboards to manage your sustainability goals.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="bg-[#0057FF] hover:bg-[#0057FF]/90 text-white px-8 py-3"
              >
                Start free trial
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="px-8 py-3 border-gray-300 bg-transparent"
              >
                <Play className="w-4 h-4 mr-2" />
                Watch demo
                <span className="ml-2 text-xs text-gray-500">2 min</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-12 border-t border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-8">
              Trusted by sustainability leaders worldwide
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="w-24 h-12 bg-gray-200 rounded flex items-center justify-center"
                >
                  <span className="text-xs text-gray-400">Logo {i}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="bg-[#0057FF]/10 text-[#0057FF] hover:bg-[#0057FF]/20 mb-4">
                Stackmint Platform
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Comprehensive ESG management,
                <br />
                deployed in minutes
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Simply integrate our platform with your existing systems for
                complete ESG functionality. Match your brand with customizable
                dashboards, then deploy to your domain — no complex setup
                required!
              </p>
              <div className="space-y-4">
                {[
                  "Automated ESG data collection and reporting",
                  "Real-time compliance monitoring and alerts",
                  "Customizable sustainability dashboards",
                ].map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-[#0057FF]" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-[#0057FF]/5 to-[#0057FF]/10 rounded-2xl p-8">
                <div className="bg-white rounded-xl shadow-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">
                      ESG Dashboard
                    </h3>
                    <Badge className="bg-green-100 text-green-800">
                      Compliant
                    </Badge>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        Carbon Footprint
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        -12% YoY
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-[#0057FF] h-2 rounded-full w-3/4"></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#0057FF]">
                          94%
                        </div>
                        <div className="text-xs text-gray-500">Compliance</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          A+
                        </div>
                        <div className="text-xs text-gray-500">ESG Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          156
                        </div>
                        <div className="text-xs text-gray-500">Metrics</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Grid */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need for ESG compliance
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive tools to track, manage, and report on your
              environmental, social, and governance initiatives.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: "Compliance Monitoring",
                description:
                  "Real-time tracking of regulatory requirements and automated compliance alerts.",
              },
              {
                icon: BarChart3,
                title: "Advanced Analytics",
                description:
                  "Deep insights into your ESG performance with customizable reporting dashboards.",
              },
              {
                icon: Users,
                title: "Stakeholder Management",
                description:
                  "Engage stakeholders with transparent reporting and collaborative goal setting.",
              },
              {
                icon: Globe,
                title: "Global Standards",
                description:
                  "Support for international ESG frameworks including GRI, SASB, and TCFD.",
              },
              {
                icon: CheckCircle,
                title: "Audit Ready",
                description:
                  "Maintain audit trails and documentation for seamless compliance verification.",
              },
              {
                icon: ArrowRight,
                title: "Integration Ready",
                description:
                  "Connect with your existing systems through our comprehensive API platform.",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className="border-0 shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <feature.icon className="w-8 h-8 text-[#0057FF] mb-2" />
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 sm:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Ready to transform your ESG strategy?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Get started with a personalized consultation to understand how
              Stackmint can meet your specific compliance needs.
            </p>
          </div>
          <div className="max-w-md mx-auto">
            <Card className="border-2 border-[#0057FF] shadow-lg">
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Enterprise Solution
                </CardTitle>
                <CardDescription className="text-gray-600 mt-2">
                  Tailored ESG compliance platform for your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {[
                    "Custom ESG framework implementation",
                    "Dedicated compliance specialist",
                    "Advanced analytics and reporting",
                    "Priority support and training",
                    "API access and integrations",
                    "White-label options available",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <CheckCircle className="w-5 h-5 text-[#0057FF]" />
                      <span className="text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-6 border-t">
                  <Button className="w-full bg-[#0057FF] hover:bg-[#0057FF]/90 text-white py-3">
                    Schedule Consultation
                  </Button>
                  <p className="text-center text-sm text-gray-500 mt-3">
                    Get a personalized demo and pricing quote
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#0057FF]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Start your ESG transformation today
          </h2>
          <p className="text-lg text-blue-100 max-w-2xl mx-auto mb-8">
            Join leading organizations who trust Stackmint to manage their
            sustainability goals and compliance requirements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-white text-[#0057FF] hover:bg-gray-100 px-8 py-3"
            >
              Start Free Trial
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white hover:text-[#0057FF] px-8 py-3 bg-transparent"
            >
              Contact Sales
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-[#0057FF] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <span className="text-xl font-semibold">Stackmint</span>
              </div>
              <p className="text-gray-400 text-sm">
                The comprehensive ESG compliance platform for modern
                organizations.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="#" className="hover:text-white">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    API
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Security
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="#" className="hover:text-white">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Blog
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="#" className="hover:text-white">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Community
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white">
                    Status
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Stackmint. All rights reserved.
            </p>
            <div className="flex space-x-6 mt-4 sm:mt-0">
              <Link href="#" className="text-gray-400 hover:text-white text-sm">
                Privacy
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white text-sm">
                Terms
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white text-sm">
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
