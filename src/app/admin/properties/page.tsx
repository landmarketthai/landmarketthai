import AdminSubmissions from "@/components/admin/AdminSubmissions";

export default async function AdminPropertiesPage() {
  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-8 text-white sm:px-6 sm:py-10">
        <div className="container-xl">
          <div className="text-xs font-bold tracking-[0.16em] text-gold-400">PROPERTY REVIEW</div>
          <h1 className="mt-1 text-3xl font-black">ตรวจสอบทรัพย์</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
            รายการจากเจ้าของทรัพย์จะยังไม่เผยแพร่ จนกว่าทีมงานจะตรวจสอบ อนุมัติ และสั่งเผยแพร่
          </p>
        </div>
      </section>
      <section className="px-4 py-8 sm:px-6 sm:py-10">
        <div className="container-xl">
          <AdminSubmissions />
        </div>
      </section>
    </main>
  );
}
