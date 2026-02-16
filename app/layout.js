import './globals.css';
import Link from 'next/link';
import { LayoutDashboard, Users, CreditCard, MessageSquare, Mail, Settings } from 'lucide-react';

export const metadata = {
  title: 'BY KIY — Recovery Dashboard',
  description: 'Customer recovery and chargeback management for BY KIY',
};

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/chargebacks', label: 'Chargebacks', icon: CreditCard },
  { href: '/chat', label: 'AI Chat', icon: MessageSquare },
  { href: '/templates', label: 'Templates', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-dark-700 border-r border-dark-500 flex flex-col fixed h-full">
          <div className="p-6 border-b border-dark-500">
            <h1 className="text-xl font-bold">
              <span className="text-brand">BY KIY</span>
              <span className="text-gray-400 text-sm block">Recovery Dashboard</span>
            </h1>
          </div>
          <nav className="flex-1 p-4">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-dark-500 hover:text-brand transition-colors mb-1"
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-dark-500">
            <p className="text-xs text-gray-500">BY KIY Recovery v1.0</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-64 p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
