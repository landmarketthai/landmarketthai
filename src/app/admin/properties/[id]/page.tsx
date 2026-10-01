import AdminSubmissionDetail from "@/components/admin/AdminSubmissionDetail";

export default async function AdminPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="bg-slate-50 px-4 py-10 sm:px-6"><div className="mx-auto max-w-4xl">
    <AdminSubmissionDetail id={id} />
  </div></main>;
}
