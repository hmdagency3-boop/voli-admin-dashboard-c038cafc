import { CaretLeftOutlined, CaretRightOutlined, PauseOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Slider, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ImageEdgeEditor } from "@/components/ImageEdgeEditor";

const CHECKER: React.CSSProperties = {
  backgroundColor: "#fff", backgroundImage: "repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%)", backgroundSize: "20px 20px",
};
const STEP = 1 / 30;

/** Grabs the frame currently shown by the video as a PNG file (keeps see-through parts). */
export async function grabFrame(v: HTMLVideoElement): Promise<File> {
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d")!.drawImage(v, 0, 0);
  const blob = await new Promise<Blob | null>((r) => { try { c.toBlob(r, "image/png"); } catch { r(null); } });
  if (!blob) throw new Error("تعذّر أخذ صورة من الفيديو ده. نزّله على جهازك واختاره من هناك.");
  return new File([blob], `frame-${v.currentTime.toFixed(2)}s.png`, { type: "image/png" });
}

/** Scrub through a video (a chosen file or an uploaded link) and pick the frame to use as the picture. */
export function VideoFramePicker({ source, onCancel, onPick }: { source: File | string | null; onCancel: () => void; onPick: (f: File) => void }) {
  const url = useMemo(() => (source instanceof File ? URL.createObjectURL(source) : source), [source]);
  useEffect(() => () => { if (source instanceof File && url) URL.revokeObjectURL(url); }, [source, url]);
  const [v, setV] = useState<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setT(0); setDur(0); setErr(null); setPlaying(false); }, [url]);

  const seek = (x: number) => { if (!v) return; const y = Math.max(0, Math.min(dur || 0, x)); v.pause(); v.currentTime = y; setT(y); };
  const toggle = () => { if (!v) return; if (v.paused) void v.play(); else v.pause(); };
  const pick = async () => {
    if (!v) return;
    setBusy(true); setErr(null);
    try { v.pause(); onPick(await grabFrame(v)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!source} title="اختيار الصورة من الفيديو" width={560} centered maskClosable={false} destroyOnHidden onCancel={onCancel}
      footer={[
        <Button key="c" onClick={onCancel}>إلغاء</Button>,
        <Button key="ok" type="primary" loading={busy} disabled={!dur} onClick={pick}>استخدام هذا الفريم</Button>,
      ]}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div style={{ ...CHECKER, borderRadius: 10, display: "flex", justifyContent: "center", padding: 8 }}>
          {url && <video ref={setV} src={url} crossOrigin="anonymous" muted playsInline preload="auto"
            aria-label="الفيديو لاختيار الفريم" style={{ maxWidth: "100%", maxHeight: 320, display: "block" }}
            onLoadedMetadata={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
            onLoadedData={(e) => { if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = 0.001; }}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onError={() => setErr("تعذّر تشغيل الفيديو في المتصفح.")} />}
        </div>
        <Slider min={0} max={dur || 1} step={0.01} value={t} disabled={!dur} onChange={seek}
          tooltip={{ formatter: (x) => `${(x ?? 0).toFixed(2)} ث` }} />
        <Space style={{ width: "100%", justifyContent: "center" }}>
          <Button icon={<CaretRightOutlined />} disabled={!dur} onClick={() => seek(t - STEP)} aria-label="فريم قبل" />
          <Button icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />} disabled={!dur} onClick={toggle}>{playing ? "إيقاف" : "تشغيل"}</Button>
          <Button icon={<CaretLeftOutlined />} disabled={!dur} onClick={() => seek(t + STEP)} aria-label="فريم بعد" />
          <Typography.Text type="secondary">{t.toFixed(2)} / {dur.toFixed(2)} ث</Typography.Text>
        </Space>
        {err && <Alert type="error" showIcon message={err} />}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>حرّك الشريط لحد اللقطة اللي عايزها، وبعدها تظبطها: مربعة وأطرافها ناعمة.</Typography.Text>
      </Space>
    </Modal>
  );
}

/** Pick a frame, then adjust it (square + soft edges). Cancelling the adjust step goes back to the frame picker. */
export function FrameToArt({ source, title, onCancel, onDone }: {
  source: File | string | null; title: string; onCancel: () => void; onDone: (f: File) => void;
}) {
  const [frame, setFrame] = useState<File | null>(null);
  useEffect(() => { setFrame(null); }, [source]);
  return (
    <>
      <VideoFramePicker source={frame ? null : source} onCancel={onCancel} onPick={setFrame} />
      <ImageEdgeEditor file={frame} title={title} onCancel={() => setFrame(null)} onDone={(f) => { setFrame(null); onDone(f); }} />
    </>
  );
}
