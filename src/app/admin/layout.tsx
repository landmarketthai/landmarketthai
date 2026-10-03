import Link from 'next/link';

const links = [
  ['properties', 'ตรวจสอบทรัพย์'],
  ['buyer-requirements', 'ความต้องการซื้อ'],
  ['leads', 'ลีด CRM'],
  ['deals', 'ดีล'],
  ['partners', 'พาร์ทเนอร์'],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>
    <nav aria-label="เมนูผู้ดูแล" className="container mx-auto flex flex-wrap gap-4 border-b border-slate-200 px-4 py-4 text-sm">
      {links.map(([path, label]) => <Link key={path} href={`/admin/${path}`} className="text-brand-600 hover:underline">{label}</Link>)}
    </nav>
    {children}
  </>;
}
