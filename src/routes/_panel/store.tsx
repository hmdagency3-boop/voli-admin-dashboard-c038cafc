import { createFileRoute } from "@tanstack/react-router";
import { EditableProTable, ModalForm, PageContainer, ProForm, ProFormDigit, ProFormSelect, ProFormText, StatisticCard } from "@ant-design/pro-components";
import { DeleteOutlined, LinkOutlined, PictureOutlined, PlayCircleOutlined, PlusOutlined, UploadOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, Dropdown, Image, Modal, Row, Segmented, Space, Tabs, Tag, Upload, type UploadFile } from "antd";
import { useMemo, useState } from "react";
import { pageHead } from "@/components/meta";
import { VideoEdgeEditor } from "@/components/VideoEdgeEditor";
import { ImageEdgeEditor } from "@/components/ImageEdgeEditor";
import { ArtField } from "@/components/ArtField";
import { FrameToArt } from "@/components/VideoFramePicker";
import { useAction, useLoad } from "@/components/hooks";
import { fmt, GIFT_ART_TYPES, GIFT_VIDEO_TYPES, giftArtProblem, giftVideoProblem, giftVideoUrlOk, normalizeGiftVideoUrl, type UploadStatus } from "@/lib/admin";
import {
  changeStoreArt, changeStoreVideo, createStoreItem, getStoreItems, KIND_LABEL, removeStoreVideo, setStoreVideoUrl, STORE_DAYS_MAX,
  STORE_KINDS, STORE_STYLES, storeUploadText, updateStoreItem, type StoreItem, type StoreKind, type StoreStyle,
} from "@/lib/store";

export const Route = createFileRoute("/_panel/store")({
  head: pageHead("المتجر", "إضافة الإطارات والدخوليات وتسعيرها ومددها في متجر فولي"),
  component: Store,
});

const ACCEPT = GIFT_ART_TYPES.join(",");
const VIDEO_ACCEPT = GIFT_VIDEO_TYPES.join(",");
const ART_HELP: Record<StoreKind, string> = {
  frame: "PNG أو WebP أو GIF متحرك بخلفية شفافة، مربع، والوسط فاضي لصورة العضو. حتى 5 ميجا.",
  ride: "صورة مصغّرة للدخولية تظهر في المتجر والحقيبة: تتحوّل مربعة بأطراف ناعمة قبل الرفع. PNG أو WebP أو JPG، حتى 5 ميجا.",
};
const VIDEO_HELP = "MP4 أو WebM أو MOV حتى 50 ميجا. للدخوليات: يشتغل عند دخول الغرفة وعند الضغط ▶ في المتجر.";
const styleLabel = (s: StoreStyle) => STORE_STYLES.find((x) => x.value === s)?.label ?? s;

const fileRule = (check: (f: File) => string | null) => ({
  validator: async (_: unknown, list?: UploadFile[]) => {
    const f = list?.[0]?.originFileObj;
    const problem = f ? check(f) : null;
    if (problem) throw new Error(problem);
  },
});
const lastFile = (e: { fileList: UploadFile[] }) => e.fileList.slice(-1);

/** Video picker for the add form: every chosen video goes through the soft-edge editor first. */
function EdgeVideoField({ value, onChange }: { value?: UploadFile[]; onChange?: (v: UploadFile[]) => void }) {
  const [pending, setPending] = useState<File | null>(null);
  return (
    <>
      <Upload accept={VIDEO_ACCEPT} maxCount={1} fileList={value ?? []} beforeUpload={(f) => { setPending(f); return Upload.LIST_IGNORE; }}
        onRemove={() => onChange?.([])}>
        <Button icon={<VideoCameraOutlined />}>{value?.length ? "تغيير الفيديو" : "اختر فيديو"}</Button>
      </Upload>
      <VideoEdgeEditor file={pending} onCancel={() => setPending(null)} onDone={(f) => {
        setPending(null);
        onChange?.([{ uid: `${Date.now()}`, name: f.name, size: f.size, type: f.type, status: "done", originFileObj: f as NonNullable<UploadFile["originFileObj"]> }]);
      }} />
    </>
  );
}

function useProgress() {
  const { message } = App.useApp();
  const key = useMemo(() => `store-upload-${Math.random()}`, []);
  return {
    onProgress: (s: UploadStatus) => message.open({ key, type: "loading", content: storeUploadText(s), duration: 0 }),
    done: () => message.destroy(key),
  };
}

function AddItem({ kind, onDone }: { kind: StoreKind; onDone: () => void }) {
  const act = useAction();
  const progress = useProgress();
  return (
    <ModalForm<{ style: StoreStyle; name: string; price: number; days: number; sort?: number; art: UploadFile[]; video?: UploadFile[] }>
      title={`إضافة ${KIND_LABEL[kind]} للمتجر`} width={480} modalProps={{ destroyOnHidden: true }}
      initialValues={{ style: "simple", days: 30 }}
      trigger={<Button type="primary" icon={<PlusOutlined />}>إضافة {KIND_LABEL[kind]}</Button>}
      onFinish={async (v) => {
        const art = v.art?.[0]?.originFileObj as File | undefined;
        if (!art) return false;
        const video = (v.video?.[0]?.originFileObj as File | undefined) ?? null;
        try {
          return await act(() => createStoreItem({ kind, style: v.style, name: v.name, price: v.price, days: v.days, sort: v.sort ?? null, art, video }, progress.onProgress),
            "أُضيف المنتج وظهر في متجر التطبيق", onDone);
        } finally { progress.done(); }
      }}>
      <ProFormText name="name" label="الاسم (كما يظهر في المتجر)" placeholder="Ghost Cemetery" rules={[{ required: true, message: "اكتب الاسم" }, { max: 40 }]} />
      <ProFormSelect name="style" label="التصنيف" options={STORE_STYLES} rules={[{ required: true }]} />
      <ProFormDigit name="price" label="السعر (كوينز)" min={1} fieldProps={{ precision: 0 }} rules={[{ required: true, message: "اكتب السعر" }]} />
      <ProFormDigit name="days" label="المدة (يوم)" min={1} max={STORE_DAYS_MAX} fieldProps={{ precision: 0 }} rules={[{ required: true, message: "اكتب المدة" }]}
        extra="الشراء مرة ثانية يضيف نفس المدة على الأيام المتبقية." />
      <ProFormDigit name="sort" label="الترتيب (فارغ = في الآخر)" min={0} fieldProps={{ precision: 0 }} />
      {kind === "ride" ? (
        <ProForm.Item name="art" label="الصورة" extra={ART_HELP[kind]} rules={[{ required: true, message: "اختر صورة" }, fileRule(giftArtProblem)]}>
          <ArtField alwaysEdit editorTitle="صورة الدخولية: مربعة بأطراف ناعمة" />
        </ProForm.Item>
      ) : (
        <ProForm.Item name="art" label="الصورة" valuePropName="fileList" getValueFromEvent={lastFile} extra={ART_HELP[kind]}
          rules={[{ required: true, message: "اختر صورة" }, fileRule(giftArtProblem)]}>
          <Upload accept={ACCEPT} listType="picture-card" maxCount={1} beforeUpload={() => false}>
            <div><PlusOutlined /><div style={{ marginTop: 6 }}>اختر صورة</div></div>
          </Upload>
        </ProForm.Item>
      )}
      <ProForm.Item name="video" label={kind === "ride" ? "فيديو الدخولية (يفضّل)" : "فيديو (اختياري)"}
        extra={`${VIDEO_HELP} بعد اختيار الفيديو تقدر تنعّم أطرافه قبل الرفع.`} rules={[fileRule(giftVideoProblem)]}>
        <EdgeVideoField />
      </ProForm.Item>
    </ModalForm>
  );
}

function ChangeArt({ item, onDone }: { item: StoreItem; onDone: () => void }) {
  const act = useAction();
  const [pending, setPending] = useState<File | null>(null);
  const [frameFrom, setFrameFrom] = useState<string | null>(null);
  const save = (file: File) => act(() => changeStoreArt(item.id, file), "تغيّرت الصورة", onDone);
  return (
    <>
      <Upload accept={ACCEPT} showUploadList={false} customRequest={() => {}}
        beforeUpload={(file) => { if (item.kind === "ride") setPending(file); else save(file); return false; }}>
        <a><UploadOutlined /> الصورة</a>
      </Upload>
      {item.kind === "ride" && item.video_url && <a onClick={() => setFrameFrom(item.video_url)} style={{ marginInlineStart: 8 }}><PictureOutlined /> من الفيديو</a>}
      <ImageEdgeEditor file={pending} onCancel={() => setPending(null)} onDone={(f) => { setPending(null); save(f); }} />
      <FrameToArt source={frameFrom} title="صورة الدخولية: مربعة بأطراف ناعمة" onCancel={() => setFrameFrom(null)}
        onDone={(f) => { setFrameFrom(null); save(f); }} />
    </>
  );
}

function VideoActions({ item, onDone }: { item: StoreItem; onDone: () => void }) {
  const act = useAction();
  const progress = useProgress();
  const { modal } = App.useApp();
  const [linkOpen, setLinkOpen] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const upload = (file: File) => {
    act(async () => { try { await changeStoreVideo(item.id, file, progress.onProgress); } finally { progress.done(); } },
      item.video_url ? "تغيّر الفيديو" : "أُضيف الفيديو", onDone);
  };
  return (
    <Space size={4}>
      <Upload accept={VIDEO_ACCEPT} showUploadList={false} customRequest={() => {}} beforeUpload={(f) => { setPending(f); return false; }}>
        <a><VideoCameraOutlined /> {item.video_url ? "تغيير الفيديو" : "فيديو"}</a>
      </Upload>
      <VideoEdgeEditor file={pending} onCancel={() => setPending(null)} onDone={(f) => { setPending(null); upload(f); }} />
      <Dropdown trigger={["click"]} menu={{ items: [
        { key: "link", icon: <LinkOutlined />, label: "ربط فيديو موجود برابط", onClick: () => setLinkOpen(true) },
        ...(item.video_url ? [{
          key: "rm", danger: true, icon: <DeleteOutlined />, label: "حذف الفيديو",
          onClick: () => modal.confirm({
            title: "حذف الفيديو من المنتج؟", content: "الملف يبقى محفوظ في Cloudinary.", okText: "حذف", cancelText: "إلغاء",
            okButtonProps: { danger: true }, onOk: () => act(() => removeStoreVideo(item.id), "حُذف الفيديو", onDone),
          }),
        }] : []),
      ] }}><a>…</a></Dropdown>
      <ModalForm<{ url: string }> title={`ربط فيديو — ${item.name}`} width={460} open={linkOpen}
        modalProps={{ destroyOnHidden: true, onCancel: () => setLinkOpen(false) }} initialValues={{ url: item.video_url ?? "" }}
        onFinish={async (v) => { const ok = await act(() => setStoreVideoUrl(item.id, v.url), "حُفظ الفيديو", onDone); if (ok) setLinkOpen(false); return ok; }}>
        <ProFormText name="url" label="رابط الفيديو على Cloudinary" fieldProps={{ dir: "ltr" }}
          rules={[{ required: true, message: "الصق الرابط" }, { validator: async (_: unknown, value?: string) => {
            if (value && !giftVideoUrlOk(normalizeGiftVideoUrl(value))) throw new Error("لازم يكون رابط فيديو من Cloudinary الخاص بفولي");
          } }]} />
      </ModalForm>
    </Space>
  );
}

type StyleFilter = "all" | StoreStyle;

function KindTable({ kind, items, loading, reload, onPlay }: {
  kind: StoreKind; items: StoreItem[]; loading: boolean; reload: () => void; onPlay: (i: StoreItem) => void;
}) {
  const act = useAction();
  const [style, setStyle] = useState<StyleFilter>("all");
  const mine = items.filter((i) => i.kind === kind);
  const shown = style === "all" ? mine : mine.filter((i) => i.style === style);
  return (
    <EditableProTable<StoreItem> rowKey="id" loading={loading} value={shown} recordCreatorProps={false}
      headerTitle={STORE_KINDS.find((k) => k.value === kind)?.hint}
      toolBarRender={() => [
        <Segmented<StyleFilter> key="s" value={style} onChange={setStyle} options={[
          { value: "all", label: `الكل (${mine.length})` },
          ...STORE_STYLES.map((s) => ({ value: s.value, label: `${s.label.split(" — ")[0]} (${mine.filter((i) => i.style === s.value).length})` })),
        ]} />,
        <AddItem key="add" kind={kind} onDone={reload} />,
      ]}
      editable={{ type: "single", onSave: async (_k, r) => { await act(() => updateStoreItem(r), "حُفظ المنتج", reload); } }}
      columns={[
        { title: "الصورة", dataIndex: "art_url", editable: false, width: 84,
          render: (_, r) => <Image src={r.art_url} width={56} height={56} style={{ objectFit: "contain", background: "#1b1c22", borderRadius: 8 }} /> },
        { title: "الاسم", dataIndex: "name", formItemProps: { rules: [{ required: true }, { max: 40 }] } },
        { title: "التصنيف", dataIndex: "style", valueType: "select", fieldProps: { options: STORE_STYLES }, render: (_, r) => <Tag>{styleLabel(r.style)}</Tag> },
        { title: "السعر", dataIndex: "price", valueType: "digit", render: (_, r) => fmt(r.price) },
        { title: "المدة (يوم)", dataIndex: "days", valueType: "digit" },
        { title: "الترتيب", dataIndex: "sort", valueType: "digit" },
        { title: "معروض للبيع", dataIndex: "active", valueType: "switch" },
        { title: "الفيديو", dataIndex: "video_url", editable: false, width: 90, render: (_, r) => r.video_url
          ? <Tag color="purple" icon={<PlayCircleOutlined />} style={{ cursor: "pointer" }} onClick={() => onPlay(r)}>تشغيل</Tag>
          : <span style={{ color: "#999" }}>—</span> },
        { title: "مرات البيع", dataIndex: "sold_count", editable: false, render: (_, r) => fmt(r.sold_count) },
        { title: "قيمة المبيعات", dataIndex: "sold_value", editable: false, render: (_, r) => fmt(r.sold_value) },
        { title: "عند الأعضاء الآن", dataIndex: "owners_now", editable: false, render: (_, r) => fmt(r.owners_now) },
        { title: "", valueType: "option", render: (_, r, _i, a) => [
          <a key="e" onClick={() => a?.startEditable?.(r.id)}>تعديل</a>,
          <ChangeArt key="p" item={r} onDone={reload} />,
          <VideoActions key="v" item={r} onDone={reload} />,
        ] },
      ]} />
  );
}

function Store() {
  const { data, loading, error, reload } = useLoad(getStoreItems, []);
  const [play, setPlay] = useState<StoreItem | null>(null);
  const items = data ?? [];
  const sum = (f: (i: StoreItem) => number) => items.reduce((t, i) => t + f(i), 0);
  return (
    <PageContainer title="المتجر" subTitle="الإطارات والدخوليات اللي بيشتريها الأعضاء بالكوينز وتظهر في حقيبتهم">
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[["منتجات معروضة", sum((i) => (i.active ? 1 : 0))], ["مرات البيع", sum((i) => i.sold_count)],
          ["قيمة المبيعات (كوينز)", sum((i) => i.sold_value)], ["عند الأعضاء الآن", sum((i) => i.owners_now)]].map(([t, v]) => (
          <Col key={t as string} xs={12} lg={6}><StatisticCard loading={loading} statistic={{ title: t as string, value: fmt(v as number) }} /></Col>
        ))}
      </Row>
      <Card>
        <Tabs items={STORE_KINDS.map((k) => ({
          key: k.value, label: `${k.label} (${items.filter((i) => i.kind === k.value).length})`,
          children: <KindTable kind={k.value} items={items} loading={loading} reload={reload} onPlay={setPlay} />,
        }))} />
      </Card>
      <Modal open={!!play} title={play?.name} footer={null} onCancel={() => setPlay(null)} destroyOnHidden width={420} centered>
        {play?.video_url && <video src={play.video_url} controls autoPlay playsInline style={{ width: "100%", maxHeight: "70vh", background: "#000", borderRadius: 8 }} />}
      </Modal>
    </PageContainer>
  );
}
