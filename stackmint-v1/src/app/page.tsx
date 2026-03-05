import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Leaf,
  BarChart3,
  Building2,
  LineChart,
  ArrowRight,
  Menu,
  Gauge,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Image from "next/image";

export default function StackmintLanding() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Image
                src="/Casaverde_Logo_v1-removebg-preview.png"
                alt="Casaverde Logo"
                width={55}
                height={55}
              />
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <Link
                href="#"
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
              >
                Solutions
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
              >
                Features
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
              >
                Resources
              </Link>
              <Link
                href="/pricing"
                className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
              >
                Pricing
              </Link>
            </nav>

            <div className="flex items-center space-x-3">
              <SignedOut>
                <SignInButton forceRedirectUrl={"/redirect"}>
                  <Button variant="ghost">Sign In</Button>
                </SignInButton>
                <Button>Book a Demo</Button>
              </SignedOut>
              <SignedIn>
                <Link href="/redirect">
                  <Button>Dashboard</Button>
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
      <section className="relative bg-gradient-to-b from-primary/5 to-background pt-20 pb-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6">Carbon Management Made Simple</Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-foreground leading-tight mb-6 text-balance">
              Automate your carbon accounting
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10 text-pretty">
              Measure, reduce and offset your carbon footprint with our
              comprehensive platform designed for modern businesses.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="px-8 py-6 text-lg">
                Book a Demo
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="px-8 py-6 text-lg bg-transparent"
              >
                View Pricing
              </Button>
            </div>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Gauge className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Quick Setup</h3>
                <p className="text-muted-foreground text-sm">
                  Get started measuring your emissions in minutes
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LineChart className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Real-time Tracking</h3>
                <p className="text-muted-foreground text-sm">
                  Monitor your carbon footprint in real-time
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Expert Support</h3>
                <p className="text-muted-foreground text-sm">
                  Dedicated team to guide your sustainability journey
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <UserButton />

      {/* Trusted By Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-8 font-medium">
              Trusted by leading companies worldwide
            </p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-32 h-12 bg-muted rounded-lg flex items-center justify-center"
                >
                  <span className="text-xs text-muted-foreground">
                    Logo {i}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <Badge className="mb-6">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-6 text-balance">
              Everything you need to manage your carbon footprint
            </h2>
            <p className="text-lg text-muted-foreground text-pretty">
              Our comprehensive platform helps you track, reduce, and offset
              your emissions with powerful automation and expert guidance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
            {[
              {
                icon: Leaf,
                title: "Automated Data Collection",
                description:
                  "Connect your business tools and automate your emissions calculations.",
              },
              {
                icon: BarChart3,
                title: "Real-time Dashboard",
                description:
                  "Monitor your carbon footprint with detailed analytics and insights.",
              },
              {
                icon: Building2,
                title: "Custom Reporting",
                description:
                  "Generate professional reports for stakeholders and compliance.",
              },
              {
                icon: CheckCircle,
                title: "Reduction Strategies",
                description:
                  "Get actionable recommendations to reduce your emissions.",
              },
              {
                icon: Users2,
                title: "Expert Support",
                description:
                  "Access our team of carbon accounting experts for guidance.",
              },
              {
                icon: ArrowRight,
                title: "Carbon Offsetting",
                description:
                  "Access verified carbon offset projects and track your impact.",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className="hover:border-primary/50 transition-all hover:shadow-lg"
              >
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl mb-2">
                    {feature.title}
                  </CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <Badge className="mb-6">How It Works</Badge>
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-6 text-balance">
              Start measuring your carbon footprint in minutes
            </h2>
            <p className="text-lg text-muted-foreground text-pretty">
              Our simple process helps you get started quickly and efficiently
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Connect Your Data",
                description: "Easily connect your business tools and systems",
              },
              {
                step: "02",
                title: "Analyze Emissions",
                description:
                  "Get detailed insights about your carbon footprint",
              },
              {
                step: "03",
                title: "Take Action",
                description:
                  "Implement strategies to reduce and offset emissions",
              },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-2xl font-semibold text-primary tabular-nums">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold mb-4">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold mb-6 text-balance">
            Ready to start your sustainability journey?
          </h2>
          <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 text-pretty">
            Join leading companies using Stackmint to measure and reduce their
            carbon footprint.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="px-8 py-6 text-lg">
              Book a Demo
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="px-8 py-6 text-lg bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10"
            >
              View Pricing
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Image
                  src="/Casaverde_Logo_v1-removebg-preview.png"
                  alt="Casaverde Logo"
                  width={55}
                  height={55}
                />
                <span className="text-xl font-semibold">Casaverde</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Empowering businesses to measure and reduce their carbon
                footprint.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Solutions
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Security
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Careers
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Case Studies
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Blog
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Casaverde. All rights reserved.
            </p>
            <div className="flex space-x-6 mt-4 sm:mt-0">
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Terms
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
