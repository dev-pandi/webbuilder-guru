import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Compass,
  LayoutTemplate,
  Library,
  Lock,
  PenLine,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { HomeNavAuth } from "@/components/HomeNavAuth";
import { HomeMobileNav } from "@/components/HomeMobileNav";
import { HomeArticlesSection } from "@/components/HomeArticlesSection";
import { HomeGuruDirectory } from "@/components/HomeGuruDirectory";
import { IsiWebsitePreview } from "@/components/IsiWebsitePreview";
import { RuangPromosiCarousel } from "@/components/RuangPromosiCarousel";
import { Button } from "@/components/ui/button";

// Marketing landing page — port palette + section order dari mockup
// /rumah-digital-guru/index.html. Fokus positioning: "Rumah Digital untuk
// Guru Indonesia" co-branding PANDI × UPI. Palette custom:
//   bg cream #fbfaf7 · text navy #172033 · red-accent #d73f45 (primary CTA)
//   blue-accent #285f9e (eyebrow) · gold #d7a24a · green #337a62
// Dark navy header dengan backdrop-blur.

const pillars = [
  {
    icon: User,
    title: "Identitas Digital Pribadi",
    desc: "Alamat website .id yang mewakili diri guru — bukan hanya profil di platform milik orang lain.",
  },
  {
    icon: PenLine,
    title: "Rekam Jejak Pengetahuan",
    desc: "Tulisan, materi, refleksi, dan dokumentasi kelas tersimpan rapi sebagai arsip yang bisa dibaca ulang.",
  },
  {
    icon: LayoutTemplate,
    title: "Etalase Profesional",
    desc: "Karya, keahlian, dan pengalaman ditampilkan dalam satu ruang yang mudah dibagikan ke kolega maupun institusi.",
  },
  {
    icon: Library,
    title: "Knowledge Hub",
    desc: "Kumpulan pengetahuan guru se-Indonesia yang terhubung — memperkaya wawasan bersama dan konteks lokal.",
  },
];

const benefits = [
  {
    icon: ShieldCheck,
    title: "Membangun reputasi profesional",
    desc: "Karya, pengalaman, dan bidang keahlian jadi lebih mudah dikenali lewat kanal pribadi guru.",
  },
  {
    icon: BookOpen,
    title: "Menyimpan praktik baik & pengalaman",
    desc: "Pengetahuan dari kelas bisa dituangkan ke tulisan, materi, refleksi, dokumentasi, atau video.",
  },
  {
    icon: Users,
    title: "Membangun interaksi dengan pembaca",
    desc: "Website jadi saluran hubungan guru dengan siswa, orang tua, guru lain, dan pembaca yang lebih luas.",
  },
  {
    icon: Compass,
    title: "Membuka peluang pengembangan profesi",
    desc: "Etalase karya + keahlian yang memperluas jaringan dan kemungkinan pengembangan profesional.",
  },
];

const ownership = [
  {
    icon: Sparkles,
    title: "Domain .id sendiri",
    desc: "Alamat pribadi guru — bukan sub-path platform. Identitas tetap milik guru meski platform berubah.",
  },
  {
    icon: BookOpen,
    title: "Konten yang terus dapat dikembangkan",
    desc: "Tulisan, materi, dan karya dapat ditambah, disunting, atau diarsip kapan saja tanpa batasan format.",
  },
  {
    icon: Lock,
    title: "Tidak terkunci pada satu layanan",
    desc: "Export ke file statis — konten guru dapat dipindah ke hosting apapun tanpa kehilangan.",
  },
];

const steps = [
  {
    n: "01",
    label: "IDENTITAS",
    title: "Buat identitas Anda",
    desc: "Siapkan profil dan alamat website pribadi yang mewakili diri serta bidang yang Anda tekuni.",
  },
  {
    n: "02",
    label: "TAMPILAN",
    title: "Pilih tampilan",
    desc: "Gunakan template ringan, mudah dipahami, dan nyaman dibuka dari desktop maupun ponsel.",
  },
  {
    n: "03",
    label: "CERITA",
    title: "Mulai bercerita",
    desc: "Isi website dengan cerita, bacaan, inspirasi, pengalaman, karya, dan bidang yang Anda kuasai.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen text-[#172033]" style={{
      background:
        "radial-gradient(circle at 12% 3%, rgba(40,95,158,.08), transparent 27rem)," +
        "radial-gradient(circle at 91% 2%, rgba(215,63,69,.07), transparent 30rem)," +
        "#fbfaf7",
    }}>
      {/* Header — dark navy backdrop-blur */}
      <header className="sticky top-0 z-50 border-b border-white/10 shadow-[0_10px_28px_rgba(2,8,23,.24)] backdrop-blur-xl"
        style={{ background: "rgba(8,17,36,.92)" }}>
        <div className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between gap-6 px-6">
          <Link href="/" className="flex items-center gap-3 text-white" aria-label="Beranda Rumah Digital Guru — PANDI × UPI">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pandi-upi-logo.png"
              alt="Logo .id dan Universitas Pendidikan Indonesia"
              className="block h-auto w-[min(27vw,240px)] max-w-full"
              fetchPriority="high"
              decoding="async"
            />
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            <Link href="#tentang" className="text-sm font-bold text-white/85 hover:text-white">
              Tentang
            </Link>
            <Link href="#manfaat" className="text-sm font-bold text-white/85 hover:text-white">
              Manfaat
            </Link>
            <Link href="#isi-website" className="text-sm font-bold text-white/85 hover:text-white">
              Isi Website
            </Link>
            <Link href="#mulai" className="text-sm font-bold text-white/85 hover:text-white">
              Cara Memulai
            </Link>
            <Link href="/artikel" className="text-sm font-bold text-white/85 hover:text-white">
              Indonesia Hebat!
            </Link>
            <Link href="/panduan-guru" className="text-sm font-bold text-white/85 hover:text-white">
              Dokumentasi
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <HomeNavAuth />
            <HomeMobileNav />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto max-w-6xl px-6 pt-20 pb-24 lg:pt-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
              <span className="h-0.5 w-6 rounded-full bg-current" />
              Program guru Indonesia
            </div>
            <h1 className="text-[clamp(2.5rem,5.5vw,4.25rem)] font-extrabold leading-[1.05] tracking-tight">
              Rumah Digital untuk{" "}
              <span className="relative text-[#d73f45]">Guru Indonesia</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#637083]">
              Ruang pribadi bagi guru untuk membangun identitas digital,
              mendokumentasikan pengetahuan, dan menampilkan karya profesional.
              Website .id yang tetap menjadi milik guru — hasil kolaborasi
              PANDI × UPI.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                asChild
                className="h-12 gap-2 rounded-[14px] bg-[#d73f45] px-6 font-extrabold text-white shadow-[0_12px_30px_rgba(215,63,69,.20)] hover:bg-[#b82e34]"
              >
                <Link href="/register">
                  Daftar Sekarang
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 rounded-[14px] border-[#172033]/15 bg-white px-6 font-extrabold text-[#172033] hover:bg-[#f4f7fb]"
              >
                <Link href="#tentang">Pelajari lebih dahulu</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e6e9ef] bg-white/70 p-4 text-sm text-[#637083] backdrop-blur">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#eaf2fb] text-[#285f9e]">
                <Sparkles className="size-4" />
              </div>
              <p className="min-w-0 flex-1 leading-snug">
                Website pribadi guru dengan domain <strong className="text-[#172033]">.id</strong> —
                identitas digital yang berumur panjang, terpindahkan, dan siap
                menghubungkan pengetahuan lintas guru.
              </p>
            </div>
          </div>

          {/* Hero visual — mockup-faithful: visual-orbit + blob + teacher figure
              CSS-only + browser card mini preview + 6 chip floating. Inline
              <style> untuk pseudo-element (::before ::after) yang tidak bisa
              di Tailwind. Scoped via .rdg-* prefix (Rumah Digital Guru). */}
          <div className="rdg-hero-visual relative min-h-[520px] lg:min-h-[570px]">
            <style
              dangerouslySetInnerHTML={{
                __html: `
              .rdg-hero-visual .rdg-orbit{position:absolute;inset:18px -16px 0 8px;border:1px dashed rgba(40,95,158,.22);border-radius:49% 51% 44% 56%/45% 44% 56% 55%;transform:rotate(-6deg)}
              .rdg-hero-visual .rdg-blob{position:absolute;width:410px;height:410px;right:5px;top:53px;border-radius:42% 58% 56% 44%/53% 41% 59% 47%;background:linear-gradient(145deg,#edf4fb 0%,#fbeef0 100%);transform:rotate(7deg)}
              .rdg-hero-visual .rdg-illustration{position:absolute;z-index:4;right:18px;top:28px;width:min(430px,78%);filter:drop-shadow(0 20px 42px rgba(20,31,53,.18));animation:rdg-float 6s ease-in-out infinite}
              .rdg-hero-visual .rdg-illustration img{display:block;width:100%;height:auto}
              @keyframes rdg-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
              .rdg-hero-visual .rdg-browser{position:absolute;left:-30px;bottom:10px;z-index:5;width:390px;overflow:hidden;border:1px solid rgba(222,227,235,.94);border-radius:20px;background:rgba(255,255,255,.96);box-shadow:0 30px 64px rgba(22,34,56,.17);transform:rotate(-2deg)}
              .rdg-chip{position:absolute;z-index:8;display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid rgba(225,229,236,.95);border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 10px 30px rgba(24,34,53,.06);color:#46566b;font-size:.75rem;font-weight:800}
              .rdg-chip::before{content:'';width:7px;height:7px;border-radius:50%;background:#285f9e}
              .rdg-chip-1{top:38px;left:4px}
              .rdg-chip-2{top:105px;left:-10px}
              .rdg-chip-3{top:28px;right:8px}
              .rdg-chip-4{right:-13px;top:165px}
              .rdg-chip-5{right:18px;bottom:54px}
              .rdg-chip-6{left:13px;bottom:132px}
              @media(max-width:900px){
                .rdg-hero-visual{transform:scale(.9);transform-origin:center top;margin:0 auto}
              }
              @media(max-width:640px){
                .rdg-hero-visual{transform:scale(.75)}
              }
            `,
              }}
            />
            <div className="rdg-orbit" aria-hidden />
            <div className="rdg-blob" aria-hidden />
            {/* Actual teacher illustration image — floating animation subtle */}
            <div className="rdg-illustration" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/rdg/teacher-hero.webp"
                alt=""
                fetchPriority="high"
                decoding="async"
              />
            </div>
            {/* Browser mini website preview */}
            <div className="rdg-browser">
              <div className="flex items-center gap-1.5 border-b border-[#e6e9ef] bg-[#f8f9fb] px-3.5 py-3">
                <span className="size-2 rounded-full bg-[#d5d9e1]" />
                <span className="size-2 rounded-full bg-[#d5d9e1]" />
                <span className="size-2 rounded-full bg-[#d5d9e1]" />
                <div className="ml-1 flex-1 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-[#7a8495]">
                  gururatna.id
                </div>
              </div>
              <div className="p-5">
                <div className="mb-5 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/rdg/mini-avatar.webp"
                    alt=""
                    className="size-10 shrink-0 rounded-[13px] border border-[#172033]/8 object-cover"
                    decoding="async"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-extrabold leading-tight text-[#172033]">
                      Ratna Prameswari
                    </div>
                    <div className="text-[10px] text-[#637083]">
                      Guru Bahasa Indonesia · tokoh fiktif
                    </div>
                  </div>
                  <span className="rounded-full bg-[#eff6fd] px-2 py-1 text-[10px] font-extrabold text-[#285f9e]">
                    .id
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_112px] items-center gap-4">
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-[72%] rounded-full bg-[#28374e]" />
                    <div className="h-1.5 w-[95%] rounded-full bg-[#edf0f4]" />
                    <div className="h-1.5 w-[85%] rounded-full bg-[#edf0f4]" />
                    <div className="h-1.5 w-[68%] rounded-full bg-[#edf0f4]" />
                  </div>
                  <div className="h-24 rounded-xl bg-gradient-to-br from-[#f5d6d9] to-[#d9e7f6]" />
                </div>
              </div>
            </div>
            {/* 6 chip floating */}
            <span className="rdg-chip rdg-chip-1">Ceritaku</span>
            <span className="rdg-chip rdg-chip-2">Bacaanku</span>
            <span className="rdg-chip rdg-chip-3">Inspirasiku</span>
            <span className="rdg-chip rdg-chip-4">Bangsaku</span>
            <span className="rdg-chip rdg-chip-5">Peradaban</span>
            <span className="rdg-chip rdg-chip-6">Forum Diskusi</span>
          </div>
        </div>

        {/* Trust strip — 4 pillar dari mockup (01 Identitas / 02 Karya /
            03 Knowledge Hub / 04 Indonesia). Border top+bottom, grid 4-col. */}
        <div className="mt-16 border-y border-[#e6e9ef] py-5">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { n: "01", label: "Identitas Digital" },
              { n: "02", label: "Karya & Pengalaman" },
              { n: "03", label: "Knowledge Hub" },
              { n: "04", label: "Indonesia" },
            ].map((t, i) => (
              <div
                key={t.n}
                className={`flex min-h-[42px] items-center justify-center gap-2.5 text-[#4c5b70] ${
                  i < 3 ? "md:border-r border-[#e6e9ef]" : ""
                } text-sm font-extrabold`}
              >
                <span className="grid size-7 place-items-center rounded-[9px] bg-[#eaf2fb] text-[#285f9e] text-[11px]">
                  {t.n}
                </span>
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars — "Lebih dari Sekadar Website" */}
      <section id="tentang" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
            <span className="h-0.5 w-6 rounded-full bg-current" />
            Tentang program
          </div>
          <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight">
            Lebih dari Sekadar Website
          </h2>
          <p className="mt-4 text-base text-[#637083] sm:text-lg">
            Website pribadi guru bukan sekadar halaman online — ia adalah
            identitas, rekam jejak, etalase, dan simpul dalam ekosistem
            pengetahuan lintas guru.
          </p>
        </div>

        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            // Icon color per position (sesuai mockup .value-card:nth-child)
            const accents = [
              { bg: "bg-[#eaf2fb]", color: "text-[#285f9e]" }, // blue
              { bg: "bg-[#faecee]", color: "text-[#d73f45]" }, // red
              { bg: "bg-[#f7f1e6]", color: "text-[#9c6b1c]" }, // amber
              { bg: "bg-[#eaf5f1]", color: "text-[#337a62]" }, // green
            ];
            const acc = accents[i];
            return (
              <div
                key={p.title}
                className="relative min-h-[305px] overflow-hidden rounded-[22px] border border-[#e6e9ef] bg-white p-7 shadow-[0_10px_30px_rgba(24,34,53,.06)] transition-all duration-250 hover:-translate-y-[5px] hover:border-[#d4dae4] hover:shadow-[0_24px_60px_rgba(24,34,53,.10)]"
              >
                {/* Numbered prefix "01/02/03/04" — muted grey letter-spaced */}
                <div className="text-[.76rem] font-black uppercase tracking-[.12em] text-[#b6c0cc]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                {/* Icon 48x48 with spacious top margin per mockup */}
                <div className={`mt-[34px] mb-7 grid size-12 place-items-center rounded-[14px] ${acc.bg} ${acc.color}`}>
                  <Icon className="size-6" />
                </div>
                <h3 className="mb-3 text-[1.2rem] font-extrabold leading-tight tracking-tight text-[#172033]">
                  {p.title}
                </h3>
                <p className="m-0 text-[.94rem] leading-relaxed text-[#637083]">
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Isi Website — interactive 6-tab preview */}
      <section id="isi-website" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
            <span className="h-0.5 w-6 rounded-full bg-current" />
            Isi Website
          </div>
          <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight">
            Apa yang Bisa Ada di Website Saya?
          </h2>
          <p className="mt-4 text-base text-[#637083] sm:text-lg">
            Setiap guru punya cerita, pengalaman, minat, dan cara mengajar yang
            berbeda. Enam area berikut menjadi kerangka awal yang bisa terus
            disempurnakan.
          </p>
        </div>
        <IsiWebsitePreview />
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e6e9ef] bg-[#f4f7fb]/60 p-4 text-sm text-[#637083]">
          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eaf2fb] text-[#285f9e]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </div>
          <span className="leading-relaxed">
            Enam menu ini adalah kerangka awal. Guru tetap dapat menyesuaikan
            nama, isi, submenu, dan area mata pelajaran sesuai karakter serta
            kebutuhannya.
          </span>
        </div>
      </section>

      {/* Benefits */}
      <section id="manfaat" className="border-y border-[#e6e9ef] bg-[#fbfaf7]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
              <span className="h-0.5 w-6 rounded-full bg-current" />
              Manfaat
            </div>
            <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight">
              Bagaimana Website Ini Membantu Guru?
            </h2>
            <p className="mt-4 text-base text-[#637083] sm:text-lg">
              Bukan sekadar tempat menyimpan konten, tetapi ruang untuk
              membangun jejak, keahlian, dan hubungan profesional.
            </p>
          </div>
          {/* Layout: human illustration kiri (.88fr) + numbered card list + quote kanan (1.12fr) */}
          <div className="grid items-stretch gap-14 lg:grid-cols-[.88fr_1.12fr]">
            {/* Human illustration — actual asset dari mockup */}
            <div
              className="relative flex min-h-[400px] items-center justify-center overflow-hidden rounded-[32px] lg:min-h-[620px]"
              aria-label="Ilustrasi guru sedang menulis dan mendokumentasikan pengalaman mengajar"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/rdg/human-illustration.webp"
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full max-h-[620px] w-full object-contain drop-shadow-[0_20px_38px_rgba(24,42,70,.12)]"
              />
            </div>
            {/* Benefit list + quote */}
            <div className="grid content-center gap-3.5">
              {benefits.map((b, i) => (
                <article
                  key={b.title}
                  className="grid grid-cols-[46px_1fr] items-start gap-4 rounded-2xl border border-[#e6e9ef] bg-white px-6 py-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#285f9e]/25 hover:shadow-[0_18px_40px_rgba(24,34,53,.08)]"
                >
                  <div className="grid size-[46px] place-items-center rounded-[14px] bg-[#f0f5fa] text-sm font-black text-[#285f9e]">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h3 className="mb-1.5 text-[1.12rem] font-extrabold leading-tight text-[#172033]">
                      {b.title}
                    </h3>
                    <p className="m-0 text-[0.9rem] leading-relaxed text-[#637083]">
                      {b.desc}
                    </p>
                  </div>
                </article>
              ))}
              {/* Quote — red left-border pull-quote */}
              <div className="mt-1 rounded-r-2xl border-l-4 border-[#d73f45] bg-[#fff4f5] px-6 py-5 text-[1.03rem] font-extrabold leading-relaxed text-[#763a3d]">
                &ldquo;Website adalah etalase profesional guru, bukan pengganti
                ruang kelas.&rdquo;
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Knowledge Flow — dark navy section, journey-shell + ai-panel side-by-side */}
      <section id="knowledge" className="rdg-knowledge relative overflow-hidden text-white">
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .rdg-knowledge{background:#192b43}
          .rdg-knowledge::before{content:'';position:absolute;width:460px;height:460px;border-radius:50%;right:-160px;top:-160px;background:rgba(60,120,182,.19);filter:blur(4px);pointer-events:none}
          .rdg-knowledge .rdg-eyebrow{color:#9cc4eb}
          .rdg-knowledge .rdg-lead{color:#c2cfdd}
          .rdg-journey-shell{position:relative;overflow:hidden;padding:30px 26px 26px;border:1px solid rgba(255,255,255,.10);border-radius:26px;background:radial-gradient(circle at 78% 15%,rgba(68,125,184,.13),transparent 28%),rgba(255,255,255,.035)}
          .rdg-journey{position:relative;display:grid;grid-template-columns:.72fr .9fr 1.28fr 1fr 1.35fr;gap:18px;align-items:start}
          .rdg-journey::before{content:'';position:absolute;left:7%;right:7%;top:34px;height:2px;background:linear-gradient(90deg,rgba(143,190,233,.28),rgba(143,190,233,.88) 55%,rgba(216,63,69,.82));box-shadow:0 0 18px rgba(143,190,233,.18)}
          .rdg-node{position:relative;z-index:1;min-width:0;text-align:center;color:#fff}
          .rdg-node-icon{width:68px;height:68px;display:grid;place-items:center;margin:0 auto 17px;border:1px solid rgba(156,196,235,.24);border-radius:22px;background:linear-gradient(145deg,rgba(89,141,196,.24),rgba(255,255,255,.07));color:#a9d0f4;box-shadow:0 14px 30px rgba(3,12,25,.16),inset 0 1px 0 rgba(255,255,255,.07)}
          .rdg-node-icon svg{width:30px;height:30px}
          .rdg-node h3{margin:0;color:#fff;font-size:.93rem;line-height:1.3;letter-spacing:-.01em;font-weight:800}
          .rdg-node p{margin:7px auto 0;max-width:170px;color:#aebed0;font-size:.74rem;line-height:1.5}
          .rdg-journey-detail{margin-top:9px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
          .rdg-journey-detail span{padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.055);color:#cad9e8;font-size:.65rem;font-weight:700;white-space:nowrap}
          .rdg-node.rdg-hub .rdg-node-icon{color:#e8f4ff;background:linear-gradient(145deg,rgba(64,116,172,.46),rgba(104,154,204,.18));border-color:rgba(156,196,235,.42)}
          .rdg-node.rdg-outcome{margin-top:-8px;padding:12px 10px 14px;border:1px solid rgba(238,104,109,.26);border-radius:22px;background:linear-gradient(155deg,rgba(215,63,69,.18),rgba(255,255,255,.04));box-shadow:0 16px 34px rgba(7,16,31,.18)}
          .rdg-node.rdg-outcome .rdg-node-icon{width:72px;height:72px;margin-bottom:14px;color:#ffd4d6;border-color:rgba(238,104,109,.34);background:linear-gradient(145deg,rgba(215,63,69,.38),rgba(255,255,255,.07))}
          .rdg-node.rdg-outcome h3{color:#fff;font-size:.98rem}
          .rdg-node.rdg-outcome p{color:#d7c4ca}
          .rdg-ai-panel{padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:linear-gradient(160deg,rgba(38,72,120,.35),rgba(24,42,72,.6));box-shadow:0 20px 44px rgba(4,12,26,.22)}
          .rdg-status-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 10px;border-radius:999px;background:rgba(215,63,69,.14);border:1px solid rgba(238,104,109,.3);color:#ffb6b9;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px}
          .rdg-status-badge::before{content:'';width:7px;height:7px;border-radius:50%;background:#ef777c;box-shadow:0 0 0 0 rgba(239,119,124,.6);animation:rdg-pulse 2s ease-out infinite}
          @keyframes rdg-pulse{0%{box-shadow:0 0 0 0 rgba(239,119,124,.6)}70%{box-shadow:0 0 0 8px rgba(239,119,124,0)}100%{box-shadow:0 0 0 0 rgba(239,119,124,0)}}
          .rdg-ai-panel h3{margin:0 0 13px;color:#fff;font-size:1.65rem;letter-spacing:-.02em;line-height:1.15;font-weight:800}
          .rdg-ai-panel p{margin:0;color:#cbd7e3;font-size:.93rem;line-height:1.7}
          @media(max-width:980px){
            .rdg-knowledge-layout{grid-template-columns:1fr!important}
            .rdg-journey{grid-template-columns:1fr;gap:22px}
            .rdg-journey::before{display:none}
            .rdg-node.rdg-outcome{margin-top:0}
          }
        `,
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <div className="mb-10 max-w-3xl">
            <div className="rdg-eyebrow mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em]">
              <span className="h-0.5 w-6 rounded-full bg-current" />
              Knowledge Hub
            </div>
            <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight text-white">
              Pengetahuan Guru, Menjadi Pengetahuan Indonesia
            </h2>
            <p className="rdg-lead mt-4 text-base sm:text-lg">
              Cerita, pengalaman, praktik baik, dan karya guru tidak berhenti di
              satu kelas. Semuanya dapat menjadi bagian dari knowledge hub yang
              terus tumbuh.
            </p>
          </div>

          <div className="rdg-knowledge-layout grid items-stretch gap-7 lg:grid-cols-[1.25fr_.75fr]">
            {/* Journey shell — 5 nodes horizontal with gradient connector */}
            <div className="rdg-journey-shell">
              <div className="rdg-journey" aria-label="Alur pengetahuan dari guru ke ekosistem">
                {/* Node 1: Guru */}
                <article className="rdg-node">
                  <div className="rdg-node-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
                      <path d="m4 6 8-4 8 4-8 4-8-4Z" />
                      <path d="M20 6v5" />
                    </svg>
                  </div>
                  <h3>Guru</h3>
                  <p>Sumber pengalaman dan pengetahuan.</p>
                </article>
                {/* Node 2: Website Pribadi */}
                <article className="rdg-node">
                  <div className="rdg-node-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <rect height="14" rx="2" width="18" x="3" y="4" />
                      <path d="M3 8h18M8 21h8M12 18v3" />
                    </svg>
                  </div>
                  <h3>Website Pribadi</h3>
                  <p>Rumah digital yang dimiliki guru.</p>
                </article>
                {/* Node 3: Pengetahuan Guru — with detail chips */}
                <article className="rdg-node">
                  <div className="rdg-node-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M5 3h10l4 4v14H5z" />
                      <path d="M15 3v5h5M8 12h8M8 16h6" />
                    </svg>
                  </div>
                  <h3>Pengetahuan Guru</h3>
                  <div className="rdg-journey-detail">
                    <span>Tulisan</span>
                    <span>Pengalaman</span>
                    <span>Praktik Baik</span>
                    <span>Materi</span>
                  </div>
                </article>
                {/* Node 4: Knowledge Hub — hub variant */}
                <article className="rdg-node rdg-hub">
                  <div className="rdg-node-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="5" cy="6" r="2" />
                      <circle cx="19" cy="6" r="2" />
                      <circle cx="5" cy="18" r="2" />
                      <circle cx="19" cy="18" r="2" />
                      <path d="m7 7.5 3 2.7M17 7.5l-3 2.7M7 16.5l3-2.7M17 16.5l-3-2.7" />
                    </svg>
                  </div>
                  <h3>Knowledge Hub</h3>
                  <p>Pengetahuan terhubung dan terus tumbuh.</p>
                </article>
                {/* Node 5: Pengetahuan Indonesia — outcome variant */}
                <article className="rdg-node rdg-outcome">
                  <div className="rdg-node-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
                    </svg>
                  </div>
                  <h3>Pengetahuan Indonesia</h3>
                  <p>Ekosistem pengetahuan yang berakar pada pengalaman guru Indonesia.</p>
                </article>
              </div>
            </div>

            {/* AI panel — side card with status badge */}
            <aside className="rdg-ai-panel">
              <div className="rdg-status-badge">Dalam Pengembangan</div>
              <h3>Menuju AI yang memahami konteks kita</h3>
              <p>
                Kumpulan pengetahuan dari website guru diarahkan menjadi sumber
                dataset bagi platform AI yang dikembangkan sendiri untuk
                kebutuhan ekosistem pendidikan. Fitur ini belum diposisikan
                sebagai layanan yang sudah tersedia.
              </p>
            </aside>
          </div>
        </div>
      </section>

      {/* Ownership */}
      <section className="border-y border-[#e6e9ef] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
              <span className="h-0.5 w-6 rounded-full bg-current" />
              Prinsip
            </div>
            <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight">
              Dibangun untuk Tetap Menjadi Milik Guru
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {ownership.map((o) => {
              const Icon = o.icon;
              return (
                <div
                  key={o.title}
                  className="rounded-[22px] border border-[#e6e9ef] bg-white p-[30px] shadow-[0_10px_30px_rgba(24,34,53,.06)] transition-all duration-250 hover:-translate-y-1 hover:border-[#d4dae4] hover:shadow-[0_18px_40px_rgba(24,34,53,.08)]"
                >
                  {/* Icon 46x46 rounded-14 blue-soft — all 3 cards use same blue per mockup */}
                  <div className="mb-6 grid size-[46px] place-items-center rounded-[14px] bg-[#f2f6fb] text-[#285f9e]">
                    <Icon className="size-[22px]" />
                  </div>
                  <h3 className="mb-2.5 text-[1.15rem] font-extrabold leading-tight text-[#172033]">
                    {o.title}
                  </h3>
                  <p className="m-0 text-[.9rem] leading-relaxed text-[#637083]">
                    {o.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Komunitas Guru — teacher directory. Client component fetch real data
          dari /api/v1/public/guru dengan sort tabs (popular/newest). Fallback
          empty state kalau belum ada guru yang bergabung. */}
      <section
        id="guru-bergabung"
        className="bg-gradient-to-b from-[#eaf2fb]/40 to-transparent"
      >
        <div className="mx-auto max-w-6xl px-6 py-24">
          <HomeGuruDirectory />
        </div>
      </section>
      {/* Ruang Promosi Guru — wrapper .promotion-shell white card (padding 34px,
          radius 30px, shadow-sm) + .promo-section-layout 2-col 1fr:1fr equal.
          Dalam wrapper: carousel dark navy + section-copy text right. */}
      <section id="ruang-promosi" className="border-y border-[#e6e9ef] bg-[#fbfaf7]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-[30px] border border-[#e6e9ef] bg-white p-6 shadow-[0_10px_30px_rgba(24,34,53,.06)] sm:p-[34px]">
            <div className="grid items-center gap-[clamp(34px,5vw,72px)] lg:grid-cols-2">
              <RuangPromosiCarousel />
              <div className="min-w-0">
                <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
                  <span className="h-0.5 w-6 rounded-full bg-current" />
                  Ruang Promosi Guru
                </div>
                <h2 className="mb-[22px] max-w-[620px] text-[clamp(2rem,4vw,3.3rem)] font-extrabold leading-[1.02] tracking-[-.055em] text-[#172033]">
                  Informasi dan peluang untuk pengembangan guru
                </h2>
                <p className="m-0 max-w-[610px] text-[clamp(1rem,1.55vw,1.22rem)] leading-[1.65] text-[#637083]">
                  Program, pelatihan, buku, dan layanan pendidikan yang relevan
                  untuk mendukung pengembangan profesional guru.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mulai — wrapper card cream dengan radial gradient blue+red +
          head heading+CTA horizontal + 3 semi-transparent white step cards +
          tech-note bawah. Faithful mockup .start-wrap. */}
      <section id="mulai" className="mx-auto max-w-6xl px-6 py-24">
        <div
          className="rounded-[32px] border border-[#dde3ec] p-8 shadow-[0_24px_60px_rgba(24,34,53,.10)] sm:p-14"
          style={{
            background:
              "radial-gradient(circle at 0 100%, rgba(40,95,158,.10), transparent 30rem)," +
              "radial-gradient(circle at 100% 0, rgba(215,63,69,.08), transparent 27rem)," +
              "#ffffff",
          }}
        >
          {/* Head: heading+desc kiri, primary CTA kanan */}
          <div className="mb-9 flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div className="max-w-xl">
              <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
                <span className="h-0.5 w-6 rounded-full bg-current" />
                Cara Memulai
              </div>
              <h2 className="mb-2.5 text-[clamp(2rem,4vw,3.3rem)] font-extrabold leading-tight tracking-tight text-[#172033]">
                Mulai Website Anda
              </h2>
              <p className="m-0 text-base text-[#637083]">
                Mulai dari hal sederhana: kenalkan diri, pilih tampilan yang
                nyaman, lalu isi dengan cerita dan pengetahuan yang ingin Anda
                bagikan.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button
                size="lg"
                asChild
                className="h-12 gap-2 rounded-[14px] bg-[#d73f45] px-6 font-extrabold text-white shadow-[0_12px_30px_rgba(215,63,69,.20)] transition-transform hover:-translate-y-0.5 hover:bg-[#b82e34]"
              >
                <Link href="/register">
                  Buat Website Saya
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 gap-2 rounded-[14px] border-[#d4dae4] bg-white px-6 font-extrabold text-[#172033] hover:-translate-y-0.5 hover:border-[#285f9e] hover:text-[#285f9e]"
              >
                <Link href="/panduan-guru">
                  Baca Panduan Lengkap
                </Link>
              </Button>
            </div>
          </div>

          {/* 3 step cards — semi-transparent white pada wrapper gradient */}
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <article
                key={s.n}
                className="min-h-[190px] rounded-[18px] border border-[#e6e9ef] bg-white/85 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#d4dae4] hover:shadow-[0_18px_40px_rgba(24,34,53,.08)]"
              >
                {/* Step number RED per mockup ".step-number color: var(--red)" */}
                <div className="text-[.76rem] font-black uppercase tracking-[.12em] text-[#d73f45]">
                  {s.n} — {s.label}
                </div>
                <h3 className="mb-2 mt-[26px] text-[1.15rem] font-extrabold leading-tight text-[#172033]">
                  {s.title}
                </h3>
                <p className="m-0 text-[.9rem] leading-relaxed text-[#637083]">
                  {s.desc}
                </p>
              </article>
            ))}
          </div>

          {/* Tech-note bottom: info icon + muted text */}
          <div className="flex items-start gap-3 rounded-2xl border border-[#e6e9ef] bg-white/60 p-4 text-sm text-[#637083]">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eaf2fb] text-[#285f9e]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </div>
            <span className="leading-relaxed">
              Pada tahap awal, implementasi platform disiapkan secara bertahap.
              Kustomisasi tema dan fitur khusus guru terus dikembangkan.
            </span>
          </div>
        </div>
      </section>

      {/* Final CTA — bg #f1f5f9 + radial blob decorations (blue kiri-atas +
          red kanan-bawah). Eyebrow "Mulai dari satu cerita" + big centered
          heading serif-tight + brand text bottom. Sesuai mockup .final-cta. */}
      <section
        aria-labelledby="final-title"
        className="relative overflow-hidden px-6 py-24 sm:py-[95px]"
        style={{ background: "#f1f5f9" }}
      >
        {/* Decorative blobs */}
        <div
          className="pointer-events-none absolute -left-[120px] -top-[150px] size-[330px] rounded-full blur-[1px]"
          style={{ background: "rgba(40,95,158,.08)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-[170px] -right-[130px] size-[350px] rounded-full blur-[1px]"
          style={{ background: "rgba(215,63,69,.07)" }}
          aria-hidden
        />
        <div className="relative z-[2] mx-auto max-w-[850px] text-center">
          <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
            <span className="h-0.5 w-6 rounded-full bg-current" />
            Mulai dari satu cerita
          </div>
          <h2
            id="final-title"
            className="mb-[18px] text-[clamp(2.4rem,5vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-.045em] text-[#172033]"
          >
            Setiap guru punya pengetahuan{" "}
            <span className="text-[#d73f45]">yang layak diwariskan.</span>
          </h2>
          <p className="mx-auto mb-[30px] max-w-[650px] text-[1.1rem] leading-relaxed text-[#637083]">
            Mulai simpan cerita, refleksi, dan karya di rumah digital Anda
            sendiri — hari ini.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              asChild
              className="h-12 gap-2 rounded-[14px] bg-[#d73f45] px-6 font-extrabold text-white shadow-[0_12px_30px_rgba(215,63,69,.20)] transition-transform hover:-translate-y-0.5 hover:bg-[#b82e34]"
            >
              <Link href="/register">
                Buat Rumah Digital
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 rounded-[14px] border-[#172033]/15 bg-white px-6 font-extrabold text-[#172033] hover:bg-[#f4f7fb]"
            >
              <Link href="#tentang">Pelajari lagi</Link>
            </Button>
          </div>
          {/* Brand footer text — muted uppercase tracking */}
          <div className="mt-6 text-[.82rem] font-black uppercase tracking-[.12em] text-[#7a8594]">
            PANDI × UPI — Rumah Digital Guru
          </div>
        </div>
      </section>

      {/* Blog Platform — 1 featured + 3 side. Client component fetch dari
          /public/platform-articles. Hide kalau kosong (loaded && 0 items). */}
      <HomeArticlesSection />

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0a1428] text-white/70">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#d73f45] shadow-md">
                  <Sparkles className="size-5 text-white" />
                </div>
                <div className="leading-tight">
                  <div className="text-base font-extrabold text-white">Rumah Digital Guru</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/50">PANDI × UPI</div>
                </div>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed">
                Program co-branding PANDI × UPI untuk mendukung guru Indonesia
                memiliki identitas digital pribadi yang berumur panjang.
              </p>
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[.15em] text-white/50">
                  Kolaborasi
                </div>
                <div className="mt-1 text-sm font-extrabold text-white">
                  PANDI × UPI
                </div>
                <div className="mt-0.5 text-[11px] text-white/60">
                  Program pengembangan website pribadi guru
                </div>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-white/50">
                Program
              </h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#tentang" className="hover:text-white">Tentang</Link></li>
                <li><Link href="#manfaat" className="hover:text-white">Manfaat</Link></li>
                <li><Link href="#knowledge" className="hover:text-white">Knowledge Hub</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-white/50">
                Guru
              </h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#guru-bergabung" className="hover:text-white">Direktori</Link></li>
                <li><Link href="/register" className="hover:text-white">Daftar</Link></li>
                <li><Link href="/login" className="hover:text-white">Masuk</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-white/50">
                Platform
              </h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/daftar-reseller" className="hover:text-white">Reseller / Agency</Link></li>
                <li><Link href="/register" className="hover:text-white">Bikin Website</Link></li>
                <li><Link href="/aduan" className="hover:text-white">Laporkan Konten</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50 md:flex-row md:items-center">
            <p>© {new Date().getFullYear()} PANDI × UPI — Rumah Digital Guru</p>
            <p>Website .id · Identitas digital yang tetap milik guru</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
