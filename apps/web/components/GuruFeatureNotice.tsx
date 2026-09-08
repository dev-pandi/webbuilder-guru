import { GraduationCap } from "lucide-react";

// GuruFeatureNotice — banner info di top halaman fitur guru. Menegaskan
// bahwa Tulisan / Tanggapan / Ruang Promosi / Pembelajaran dirancang untuk
// site berbasis template "Rumah Digital Guru" (spec: Spesifikasi-Developer-
// Portal-dan-Website-Guru-Final.md §20-25). Fitur tetap berfungsi di site
// generic — hanya UX rendering di renderer yang mengikuti template guru.
export function GuruFeatureNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-100">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
        <GraduationCap className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold leading-tight">
          {title}
          <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Rumah Digital Guru
          </span>
        </p>
        <p className="text-xs leading-relaxed text-violet-800/85 dark:text-violet-100/85">
          {description}
        </p>
      </div>
    </div>
  );
}
