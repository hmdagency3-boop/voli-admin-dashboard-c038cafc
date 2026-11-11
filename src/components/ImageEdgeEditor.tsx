import { Alert, Button, Modal, Segmented, Slider, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { giftArtProblem } from "@/lib/admin";
import { drawSoftSquare, isAnimated, isSquare, loadImage, softenImageEdges, type SquareFit } from "@/lib/image-edges";
import { EDGE_DEFAULT, FEATHER_MAX, type EdgeSettings, type EdgeShape } from "@/lib/video-edges";

const CHECKER: React.CSSProperties = {
  backgroundColor: "#fff", backgroundImage: "repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%)", backgroundSize: "20px 20px",
};
const BG = { checker: CHECKER, dark: { background: "#14151a" }, light: { background: "#f3f0ff" } } as const;
type Bg = keyof typeof BG;

/**
 * Entrance picture editor: makes the picture square and softens its edges, with a live preview.
 * "Upload as is" only appears when the original is already square (entrance pictures must be square).
 */
export function ImageEdgeEditor({ file, onCancel, onDone, title = "صورة الدخولية: مربعة بأطراف ناعمة" }: {
  file: File | null; onCancel: () => void; onDone: (f: File) => void; title?: string;
}) {
  const [s, setS] = useState<EdgeSettings>(EDGE_DEFAULT);
  const [fit, setFit] = useState<SquareFit>("cover");
  const [bg, setBg] = useState<Bg>("checker");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    setImg(null); setErr(null); setS(EDGE_DEFAULT); setFit("cover");
    if (url) loadImage(url).then(setImg, (e: Error) => setErr(e.message));
  }, [url]);
  useEffect(() => { if (img && canvas) drawSoftSquare(canvas, img, fit, s, 360); }, [img, canvas, fit, s]);

  const square = !!img && isSquare(img.naturalWidth, img.naturalHeight);
  const gif = !!file && isAnimated(file);

  const apply = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const out = await softenImageEdges(file, fit, s);
      const problem = giftArtProblem(out);
      if (problem) throw new Error(problem);
      onDone(out);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!file} title={title} width={520} centered maskClosable={false} destroyOnHidden
      onCancel={() => !busy && onCancel()} footer={[
        <Button key="c" disabled={busy} onClick={onCancel}>إلغاء</Button>,
        ...(square ? [<Button key="raw" disabled={busy} onClick={() => file && onDone(file)}>رفع بدون تعديل</Button>] : []),
        <Button key="ok" type="primary" loading={busy} disabled={!img} onClick={apply}>تطبيق</Button>,
      ]}>
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div style={{ ...BG[bg], borderRadius: 10, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 260, padding: 12 }}>
          <canvas ref={setCanvas} aria-label="معاينة صورة الدخولية بعد التعديل" style={{ width: 240, height: 240, outline: "1px dashed rgba(127,127,127,.5)" }} />
        </div>
        <Segmented<Bg> block value={bg} onChange={setBg} options={[
          { value: "checker", label: "خلفية شفافة" }, { value: "dark", label: "غرفة غامقة" }, { value: "light", label: "غرفة فاتحة" },
        ]} />
        <Segmented<SquareFit> block value={fit} disabled={busy} onChange={setFit} options={[
          { value: "cover", label: "قص من المنتصف" }, { value: "contain", label: "الصورة كاملة" },
        ]} />
        <div>
          <Typography.Text strong>نعومة الأطراف: {s.feather}%</Typography.Text>
          <Slider min={0} max={FEATHER_MAX} value={s.feather} disabled={busy} onChange={(feather) => setS((o) => ({ ...o, feather }))}
            marks={{ 0: "حادة", 12: "خفيفة", 25: "متوسطة", [FEATHER_MAX]: "قوية" }} />
        </div>
        <Segmented<EdgeShape> block value={s.shape} disabled={busy} onChange={(shape) => setS((o) => ({ ...o, shape }))} options={[
          { value: "rect", label: "الأطراف الأربعة" }, { value: "oval", label: "شكل بيضاوي" },
        ]} />
        {gif && <Alert type="warning" showIcon message="صورة GIF المتحركة هتتحفظ كصورة ثابتة (أول لقطة) بعد التعديل." />}
        {err && <Alert type="error" showIcon message={err} />}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          تتحفظ مربعة بصيغة PNG وأطرافها شفافة متدرجة.
        </Typography.Text>
      </Space>
    </Modal>
  );
}
