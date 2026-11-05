import {
  ShieldCheck,
  Truck,
  CreditCard,
  RefreshCw,
  Phone,
  Mail,
  MessageCircle,
  Lock,
  Award,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useStorefrontStore } from "@/stores/storefront-store";

const FALLBACK_CATEGORIES = [
  { slug: "mac", name: "MacBook & Apple" },
  { slug: "ultrabooks", name: "Windows Ultrabooks" },
  { slug: "gaming-laptops", name: "Gaming Laptops" },
  { slug: "monitors", name: "Pro Creator Monitors" },
  { slug: "accessories", name: "Mechanical Keyboards & Gear" },
];

export function Footer() {
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const categories = useStorefrontStore((state) => state.categories);
  const valueProps = [
    {
      icon: ShieldCheck,
      title: "100% Authorized Genuine",
      desc: "Direct brand warranty with official local repair centers",
    },
    {
      icon: Truck,
      title: "Free 3-Hour Delivery",
      desc: "Express courier in Greater Bangkok on orders before 16:00",
    },
    {
      icon: CreditCard,
      title: "0% Installment up to 10 Mo.",
      desc: "Participating banks: KBank, SCB, Krungsri, and BBL",
    },
    {
      icon: RefreshCw,
      title: "7-Day DOA Replacement",
      desc: "Instant 1-to-1 swap for hardware manufacturing defects",
    },
  ];

  return (
    <footer className="w-full bg-zinc-950 text-zinc-400 border-t border-zinc-800 text-sm">
      {/* Top Value Proposition Strip */}
      <div className="border-b border-zinc-900 bg-zinc-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {valueProps.map((item) => (
            <div key={item.title} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 text-white">
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-white font-semibold text-xs sm:text-sm">
                  {item.title}
                </h4>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main 5-Column Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
        {/* Column 1: Brand & Contact */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white text-zinc-950 flex items-center justify-center font-bold text-sm">
              A
            </div>
            <span className="font-bold text-white text-base tracking-tight">
              AURA TECH
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Thailand's authorized premier IT gadget & high-performance laptop destination. Engineered for creators, gamers, and tech enthusiasts.
          </p>
          <div className="space-y-2 pt-2 text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <Phone className="w-3.5 h-3.5 text-zinc-500" />
              <span>02-118-9999 (09:00 - 21:00)</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Mail className="w-3.5 h-3.5 text-zinc-500" />
              <span>support@auratech.co.th</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Line ID: @auratech</span>
            </div>
          </div>
        </div>

        {/* Column 2: Shop Categories */}
        <div>
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">
            Shop Categories
          </h4>
          <ul className="space-y-2.5 text-xs">
            {(categories.length ? categories : FALLBACK_CATEGORIES).map((c) => (
              <li key={c.slug}>
                <Link to="/catalog" search={{ category: c.slug }} className="hover:text-white transition-colors">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Customer Services */}
        <div>
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">
            Customer Services
          </h4>
          <ul className="space-y-2.5 text-xs">
            <li>
              <span>
                0% Installment Guide
              </span>
            </li>
            <li>
              <span>
                Education Pricing (U-Store)
              </span>
            </li>
            <li>
              <span>
                Laptop Trade-In Value Estimator
              </span>
            </li>
            <li>
              <span>
                Corporate B2B Quotations
              </span>
            </li>
            <li>
              <span>
                Same-Day Express Courier
              </span>
            </li>
          </ul>
        </div>

        {/* Column 4: Warranty & Support */}
        <div>
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">
            Warranty & Support
          </h4>
          <ul className="space-y-2.5 text-xs">
            <li>
              <Link to="/orders/lookup" className="hover:text-white transition-colors">
                Track Order Status
              </Link>
            </li>
            <li>
              <span>
                Serial Number (S/N) Warranty Check
              </span>
            </li>
            <li>
              <span>
                7-Day Dead-Pixel Replacement Policy
              </span>
            </li>
            <li>
              <span>
                Authorized Service Center Locations
              </span>
            </li>
            {isAdmin && (
              <li>
                <Link to="/admin" className="text-amber-400 hover:text-amber-300 transition-colors font-medium">
                  Admin Console
                </Link>
              </li>
            )}
            <li>
              <span>
                Frequently Asked Questions
              </span>
            </li>
          </ul>
        </div>

        {/* Column 5: Security & Payment Partners */}
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
            Verified & Security
          </h4>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>DBD Registered e-Commerce</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>256-Bit SSL Encrypted Checkout</span>
            </div>
          </div>

          <h5 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider pt-2">
            Payment Partners
          </h5>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">PromptPay QR</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">Visa</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">Mastercard</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">K-Bank</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">SCB</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">Krungsri</span>
          </div>

          <h5 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider pt-1">
            Logistics Partners
          </h5>
          <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">DHL Express</span>
            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Kerry</span>
            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Flash</span>
          </div>
        </div>
      </div>

      {/* Bottom Legal Strip */}
      <div className="border-t border-zinc-900 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
        <div>© 2026 AURA TECH CO., LTD. All Rights Reserved.</div>
        <div className="flex items-center gap-6">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Cookie Preferences</span>
        </div>
      </div>
    </footer>
  );
}
