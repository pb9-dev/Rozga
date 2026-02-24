export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#07090d] text-white">
      <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
    </div>
  );
}
