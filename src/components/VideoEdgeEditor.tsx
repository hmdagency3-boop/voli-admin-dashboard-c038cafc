import { Alert, Button, Modal, Progress, Segmented, Slider, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { giftVideoProblem } from "@/lib/admin";
import {
  drawSoftFrame, EDGE_DEFAULT, edgeMask, FEATHER_MAX, outputSize, softEdgesSupported, softenVideoEdges,
  type EdgeSettings, type EdgeShape,
} from "@/lib/video-edges";

type Bg = "checker" | "dark" | "light";
const BG: Record<Bg, React.CSSProperties> = {
  checker: { backgroundColor: "#fff", backgroundImage: "repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%)", backgroundSize: "20px 20px" },
  dark: { background: "#14151a" },
  light: { background: "#f3f0ff" },
};

/**
 * Opens on a chosen video: live preview of soft (faded) edges, then makes the edited copy before upload.
 * onDone receives either the edited .webm or the original file ("upload as is").
 */
export function VideoEdgeEditor({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (f: File) => void }) {
  const [s, setS] = useState<EdgeSettings>(EDGE_DEFAULT);
  const [bg, setBg] = useState<Bg>("checker");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // State (not refs): the modal mounts its content after the first render.
  const [v, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [c, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const supported = useMemo(() => softEdgesSupported(), []);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (file) { setS(EDGE_DEFAULT); setErr(null); setPct(0); setBusy(false); } }, [file]);

  // Live preview: small canvas redrawn every frame through the current mask.
  useEffect(() => {
    if (!v || !c || !url) return;
    let raf = 0, mask: HTMLCanvasElement | null = null, w = 0, h = 0, srcW = -1;
    const setup = () => {
      srcW = v.videoWidth;
      ({ width: w, height: h } = outputSize(v.videoWidth || 16, v.videoHeight || 9, 420));
      c.width = w; c.height = h;
      mask = edgeMask(w, h, s);
    };
    const tick = () => {
      if (v.readyState >= 2) {
        if (!mask || v.videoWidth !== srcW) setup();
        drawSoftFrame(c.getContext("2d")!, v, mask!, w, h);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [url, s, v, c]);

  const apply = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setPct(0);
    abort.current = new AbortController();
    try {
      const out = await softenVideoEdges(file, s, setPct, abort.current.signal);
      const problem = giftVideoProblem(out);
      if (problem) throw new Error(`${problem} بعد التعديل. جرّب فيديو أقصر.`);
      onDone(out);
    } catch (e) {
      const hint = (e as { hint?: string }).hint;
      if (hint !== "cancelled") setErr(hint === "soft_edges_unsupported" ? "المتصفح ده مش بيدعم التعديل، افتح اللوحة من Chrome." : (e as Error).message);
    } finally { setBusy(false); abort.current = null; }
  };
  const cancel = () => { if (busy) abort.current?.abort(); else onCancel(); };

  return (
    <Modal open={!!file} title="تنعيم أطراف الفيديو قبل الرفع" width={560} centered maskClosable={false} destroyOnHidden
      onCancel={cancel} footer={[
        <Button key="c" onClick={cancel}>{busy ? "إيقاف" : "إلغاء"}</Button>,
        <Button key="raw" disabled={busy} onClick={() => file && onDone(file)}>رفع بدون تعديل</Button>,
        <Button key="ok" type="primary" loading={busy} disabled={!supported || s.feather <= 0} onClick={apply}>تطبيق النعومة</Button>,
      ]}>
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div style={{ ...BG[bg], borderRadius: 10, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 240, padding: 12 }}>
          {url && <video ref={setVideoEl} src={url} muted loop autoPlay playsInline style={{ display: "none" }} />}
          <canvas ref={setCanvasEl} aria-label="معاينة الفيديو بعد التنعيم" style={{ maxWidth: "100%", maxHeight: 340 }} />
        </div>
        <Segmented<Bg> block value={bg} onChange={setBg} options={[
          { value: "checker", label: "خلفية شفافة" }, { value: "dark", label: "غرفة غامقة" }, { value: "light", label: "غرفة فاتحة" },
        ]} />
        <div>
          <Typography.Text strong>نعومة الأطراف: {s.feather}%</Typography.Text>
          <Slider min={0} max={FEATHER_MAX} value={s.feather} disabled={busy} onChange={(feather) => setS((o) => ({ ...o, feather }))}
            marks={{ 0: "حادة", 12: "خفيفة", 25: "متوسطة", [FEATHER_MAX]: "قوية" }} />
        </div>
        <Segmented<EdgeShape> block value={s.shape} disabled={busy} onChange={(shape) => setS((o) => ({ ...o, shape }))} options={[
          { value: "rect", label: "الأطراف الأربعة" }, { value: "oval", label: "شكل بيضاوي" },
        ]} />
        {!supported && <Alert type="warning" showIcon message="المتصفح ده مش بيدعم التعديل، افتح اللوحة من Chrome أو ارفع بدون تعديل." />}
        {busy && <div>
          <Progress percent={pct} status="active" />
          <Typography.Text type="secondary">جارٍ تجهيز الفيديو بنفس مدته… خلّي الصفحة مفتوحة وما تبدّلش التبويب.</Typography.Text>
        </div>}
        {err && <Alert type="error" showIcon message={err} />}
        {!busy && <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          يتحفظ الفيديو بصيغة WebM وأطرافه شفافة متدرجة، والصوت يفضل زي ما هو.
        </Typography.Text>}
      </Space>
    </Modal>
  );
}
