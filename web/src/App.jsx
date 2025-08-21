import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import "./index.css";
import axios from "axios";

const humanBytes = (n = 0) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fdate = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function App() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dzRef = useRef(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/videos", { params: { page, pageSize } });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar lista.");
    } finally {
      setLoading(false);
    }
  }

  const [dl, setDl] = useState({});

  async function handleDownload(v, type) {
    const key = `${v.id}:${type}`;
    setDl((s) => ({ ...s, [key]: 0 }));
    try {
      const url = `/api/videos/${v.id}/download/${type}`;
      const res = await axios.get(url, {
        responseType: "blob",
        onDownloadProgress: (ev) => {
          if (ev.total) {
            const pct = Math.round((ev.loaded * 100) / ev.total);
            setDl((s) => ({ ...s, [key]: pct }));
          }
        },
      });

      const disp = res.headers["content-disposition"] || "";
      const m = /filename\*?=(?:UTF-8'')?"?([^\";]+)/i.exec(disp);
      const filename = m ? decodeURIComponent(m[1]) : `${v.id}_${type}.mp4`;

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } finally {
      setTimeout(
        () =>
          setDl((s) => {
            const n = { ...s };
            delete n[key];
            return n;
          }),
        1000
      );
    }
  }

  useEffect(() => {
    load();
  }, [page, pageSize]);

  useEffect(() => {
    const dz = dzRef.current;
    if (!dz) return;
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const over = (e) => {
      stop(e);
      dz.classList.add("ring-2", "ring-brand-500/50");
    };
    const leave = (e) => {
      stop(e);
      dz.classList.remove("ring-2", "ring-brand-500/50");
    };
    const drop = (e) => {
      stop(e);
      dz.classList.remove("ring-2", "ring-brand-500/50");
      const f = e.dataTransfer?.files?.[0];
      if (f) setFile(f);
    };
    dz.addEventListener("dragover", over);
    dz.addEventListener("dragleave", leave);
    dz.addEventListener("drop", drop);
    return () => {
      dz.removeEventListener("dragover", over);
      dz.removeEventListener("dragleave", leave);
      dz.removeEventListener("drop", drop);
    };
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setProgress(0);

    try {
      const presign = await api.post("/api/videos/presign", {
        filename: file.name,
        contentType: file.type || "video/mp4",
      });
      const { id, uploadUrl } = presign.data;

      await axios.put(uploadUrl, file, {
        headers: { "Content-Type": file.type || "video/mp4" },
        onUploadProgress: (ev) => {
          const total = ev.total ?? file.size ?? 1;
          const pct = Math.round((ev.loaded * 100) / total);
          setProgress(pct);
        },
      });

      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });

      const res = await api.post("/api/videos/complete", {
        id,
        size: file.size,
      });

      setItems((prev) => [res.data, ...prev]);
      setTotal((t) => t + 1);
      setFile(null);
      setProgress(0);
    } catch (e) {
      console.error(e);
      setError("Falha no upload via URL pré-assinada.");
    }
  }

  return (
    <div className="min-h-screen font-display text-slate-100">
      {/* HEADER */}
      <header className="mx-auto max-w-7xl px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-500 shadow-[0_0_0_3px_rgba(52,139,255,.15),0_8px_24px_rgba(52,139,255,.35)] grid place-items-center">
              <span className="font-bold text-slate-50">T</span>
            </div>
            <div className="text-xl font-bold tracking-tight">
              <span className="text-slate-200">trakto</span>
              <span className="ml-2 text-slate-400 text-sm">
                video processor
              </span>
            </div>
          </div>
          <a
            href="https://trakto.io/"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition"
          >
            Trakto site →
          </a>
        </nav>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-7xl px-6 pb-24">
        {/* Upload Card */}
        <section className="card p-6 md:p-8">
          <h1 className="text-2xl md:text-[28px] font-bold mb-2">
            Simplifique seu fluxo.{" "}
            <span className="text-brand-300">Escalone</span> com design.
          </h1>
          <p className="text-slate-400 mb-6">
            Envie um vídeo para armazenar o original e gerar automaticamente a
            versão <i>low-res</i>.
          </p>

          <form onSubmit={handleUpload} className="space-y-4">
            <div
              ref={dzRef}
              role="button"
              tabIndex={0}
              aria-label="Área para arrastar e soltar vídeo"
              className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 md:p-8 grid place-items-center text-center select-none focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("file-input")?.click();
                }
              }}
            >
              <div className="space-y-3">
                <p className="text-slate-300">
                  Arraste o arquivo aqui ou
                  <label className="mx-2 inline-flex text-brand-300 hover:text-brand-200 cursor-pointer">
                    <input
                      id="file-input"
                      type="file"
                      accept="video/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    clique para escolher
                  </label>
                </p>
                <p className="text-xs text-slate-400">
                  Formatos: mp4, mov, mkv, avi · até 200MB
                </p>
              </div>
            </div>

            {file && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="truncate text-sm text-slate-300">
                  <span className="text-slate-400">Arquivo:</span>{" "}
                  <span className="font-medium">{file.name}</span>{" "}
                  <span className="text-slate-500">
                    ({humanBytes(file.size)})
                  </span>
                </div>
                <button type="submit" className="btn-primary w-full md:w-auto">
                  Enviar
                </button>
              </div>
            )}

            {progress > 0 && (
              <div>
                <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 bg-brand-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-xs text-slate-400">
                  {progress}%
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </form>
        </section>

        {/* Lista / Histórico */}
        <section className="card p-6 md:p-8 mt-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold">Histórico</h2>
              <p className="text-slate-400 text-sm">{total} registro(s)</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">
                Itens:{" "}
                <select
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1"
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(+e.target.value);
                  }}
                >
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg px-2 py-1 bg-white/5 border border-white/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  type="button"
                >
                  ◀
                </button>
                <span className="text-sm text-slate-300">
                  {page}/{totalPages}
                </span>
                <button
                  className="rounded-lg px-2 py-1 bg-white/5 border border-white/10 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  type="button"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-300">
                <tr className="border-t border-b border-white/10">
                  <th className="py-3 pr-4 text-left font-semibold">Data</th>
                  <th className="py-3 pr-4 text-left font-semibold">Status</th>
                  <th className="py-3 pr-4 text-left font-semibold">Tamanho</th>
                  <th className="py-3 pr-4 text-left font-semibold">
                    Original
                  </th>
                  <th className="py-3 pr-0  text-left font-semibold">Low</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="py-6 text-slate-400" colSpan={5}>
                      Carregando…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="py-6 text-slate-400" colSpan={5}>
                      Nenhum vídeo ainda.
                    </td>
                  </tr>
                ) : (
                  items.map((v) => (
                    <tr key={v.id} className="border-b border-white/10">
                      <td className="py-3 pr-4">{fdate(v.createdAt)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`badge ${
                            v.status === "done"
                              ? "badge-done"
                              : v.status === "error"
                              ? "badge-error"
                              : "badge-pending"
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{humanBytes(v.size)}</td>
                      <td className="py-3 pr-4">
                        {v.originalUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDownload(v, "original")}
                              className="text-brand-300 hover:text-brand-200 underline underline-offset-4 disabled:opacity-40"
                              disabled={dl[`${v.id}:original`] >= 0}
                            >
                              Baixar
                            </button>
                            {dl[`${v.id}:original`] >= 0 && (
                              <div className="mt-1 h-1 w-24 rounded bg-white/10">
                                <div
                                  className="h-1 rounded bg-brand-500"
                                  style={{
                                    width: `${dl[`${v.id}:original`] || 0}%`,
                                  }}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-0">
                        {v.lowUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDownload(v, "low")}
                              className="text-brand-300 hover:text-brand-200 underline underline-offset-4 disabled:opacity-40"
                              disabled={dl[`${v.id}:low`] >= 0}
                            >
                              Baixar
                            </button>
                            {dl[`${v.id}:low`] >= 0 && (
                              <div className="mt-1 h-1 w-24 rounded bg-white/10">
                                <div
                                  className="h-1 rounded bg-brand-500"
                                  style={{
                                    width: `${dl[`${v.id}:low`] || 0}%`,
                                  }}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
