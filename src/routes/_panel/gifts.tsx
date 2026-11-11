import { createFileRoute } from "@tanstack/react-router";
import { EditableProTable, ModalForm, PageContainer, ProForm, ProFormDigit, ProFormText } from "@ant-design/pro-components";
import { DeleteOutlined, LinkOutlined, PictureOutlined, PlayCircleOutlined, PlusOutlined, UploadOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Dropdown, Image, Modal, Segmented, Space, Tabs, Tag, Tooltip, Upload, type UploadFile } from "antd";
import { useMemo, useState } from "react";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import { ArtField } from "@/components/ArtField";
import { FrameToArt } from "@/components/VideoFramePicker";
import {
  changeGiftArt, changeGiftVideo, createGift, fmt, getGifts, getVipPrices, giftArtProblem, giftVideoProblem, giftVideoUrlOk,
  GIFT_ART_TYPES, GIFT_VIDEO_TYPES, normalizeGiftVideoUrl, removeGiftVideo, setGiftVideoUrl, updateGift, updateVipPrice,
  uploadStatusText, type AdminGift, type UploadStatus, type VipTierPrice,
} from "@/lib/admin";

export const Route = createFileRoute("/_panel/gifts")({
  head: pageHead("الهدايا والأسعار", "إضافة هدايا جديدة وهدايا فيديو وتعديل أسعار الهدايا وباقات VIP في فولي"),
  component: Gifts,
});

const ACCEPT = GIFT_ART_TYPES.join(",");
const VIDEO_ACCEPT = GIFT_VIDEO_TYPES.join(",");
const VIDEO_HELP = "MP4 أو WebM أو MOV، حتى 50 ميجا. يشتغل في التطبيق بعد إرسال الهدية. يفضّل فيديو قصير (حتى 10 ثوانٍ).";

const fileRule = (check: (f: File) => string | null) => ({
  validator: async (_: unknown, list?: UploadFile[]) => {
    const f = list?.[0]?.originFileObj;
    const problem = f ? check(f) : null;
    if (problem) throw new Error(problem);
  },
});
const lastFile = (e: { fileList: UploadFile[] }) => e.fileList.slice(-1);

/** Shows upload progress (percent, then Cloudinary processing, then saving) as a single updating message. */
function useUploadProgress() {
  const { message } = App.useApp();
  const key = useMemo(() => `gift-upload-${Math.random()}`, []);
  return {
    onProgress: (s: UploadStatus) => message.open({ key, type: "loading", content: uploadStatusText(s), duration: 0 }),
    done: () => message.destroy(key),
  };
}

function VideoPreview({ url, title, onClose }: { url: string | null; title: string; onClose: () => void }) {
  return (
    <Modal open={!!url} title={title} footer={null} onCancel={onClose} destroyOnHidden width={420} centered>
      {url && <video src={url} controls autoPlay playsInline style={{ width: "100%", maxHeight: "70vh", background: "#000", borderRadius: 8 }} />}
    </Modal>
  );
}

function AddGift({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const progress = useUploadProgress();
  return (
    <ModalForm<{ name: string; price: number; sort?: number; art: UploadFile[]; video?: UploadFile[] }>
      title="إضافة هدية جديدة" width={460} modalProps={{ destroyOnHidden: true }}
      trigger={<Button type="primary" icon={<PlusOutlined />}>إضافة هدية</Button>}
      onFinish={async (v) => {
        const file = v.art?.[0]?.originFileObj as File | undefined;
        if (!file) return false;
        const video = (v.video?.[0]?.originFileObj as File | undefined) ?? null;
        // If the gift was saved but its video could not be attached, close the form anyway so it is not added twice.
        let giftSaved = false;
        try {
          const ok = await act(async () => {
            try { await createGift({ name: v.name, price: v.price, sort: v.sort ?? null, file, video }, progress.onProgress); }
            catch (e) {
              if ((e as { hint?: string })?.hint === "video_link_failed") { giftSaved = true; onDone(); }
              throw e;
            }
          }, video ? "أُضيفت هدية الفيديو وظهرت في التطبيق" : "أُضيفت الهدية وظهرت في التطبيق", onDone);
          return ok || giftSaved;
        } finally { progress.done(); }
      }}>
      <ProFormText name="name" label="اسم الهدية" rules={[{ required: true, message: "اكتب اسم الهدية" }, { max: 40 }]} />
      <ProFormDigit name="price" label="السعر (كوينز)" min={1} fieldProps={{ precision: 0 }} rules={[{ required: true, message: "اكتب السعر" }]} />
      <ProFormDigit name="sort" label="الترتيب (فارغ = في الآخر)" min={0} fieldProps={{ precision: 0 }} />
      <ProForm.Item name="art" label="صورة الهدية"
        extra="PNG أو WebP أو GIF متحرك، حتى 5 ميجا. يفضّل خلفية شفافة ومقاس مربع. لهدايا الفيديو تقدر تختار الصورة من الفيديو نفسه."
        rules={[{ required: true, message: "اختر صورة للهدية" }, fileRule(giftArtProblem)]}>
        <ArtField editorTitle="صورة الهدية من الفيديو: ظبطها" />
      </ProForm.Item>
      <ProForm.Item name="video" label="فيديو الهدية (اختياري — يجعلها هدية فيديو)" valuePropName="fileList" getValueFromEvent={lastFile}
        extra={VIDEO_HELP} rules={[fileRule(giftVideoProblem)]}>
        <Upload accept={VIDEO_ACCEPT} maxCount={1} beforeUpload={() => false}>
          <Button icon={<VideoCameraOutlined />}>اختر فيديو</Button>
        </Upload>
      </ProForm.Item>
    </ModalForm>
  );
}

function ChangeArt({ gift, onDone }: { gift: AdminGift; onDone: () => void }) {
  const act = useAction();
  const [frameFrom, setFrameFrom] = useState<string | null>(null);
  const save = (file: File) => act(() => changeGiftArt(gift.key, file), "تغيّرت صورة الهدية", onDone);
  return (
    <>
      <Upload accept={ACCEPT} showUploadList={false} customRequest={() => {}}
        beforeUpload={(file) => { save(file); return false; }}>
        <a><UploadOutlined /> {gift.art_url ? "تغيير الصورة" : "رفع صورة"}</a>
      </Upload>
      {gift.video_url && <a onClick={() => setFrameFrom(gift.video_url)} style={{ marginInlineStart: 8 }}><PictureOutlined /> من الفيديو</a>}
      <FrameToArt source={frameFrom} title="صورة الهدية من الفيديو: ظبطها" onCancel={() => setFrameFrom(null)}
        onDone={(f) => { setFrameFrom(null); save(f); }} />
    </>
  );
}

function VideoLink({ gift, open, onClose, onDone }: { gift: AdminGift; open: boolean; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  return (
    <ModalForm<{ url: string }>
      title={`ربط فيديو موجود — ${gift.name}`} width={460} open={open}
      modalProps={{ destroyOnHidden: true, onCancel: onClose }} initialValues={{ url: gift.video_url ?? "" }}
      onFinish={async (v) => {
        const ok = await act(() => setGiftVideoUrl(gift.key, v.url), "حُفظ فيديو الهدية", onDone);
        if (ok) onClose();
        return ok;
      }}>
      <ProFormText name="url" label="رابط الفيديو على Cloudinary" placeholder="https://res.cloudinary.com/zsxxjkqg/video/upload/…"
        fieldProps={{ dir: "ltr" }}
        rules={[{ required: true, message: "الصق رابط الفيديو" }, {
          validator: async (_: unknown, value?: string) => {
            if (value && !giftVideoUrlOk(normalizeGiftVideoUrl(value))) throw new Error("لازم يكون رابط فيديو من Cloudinary الخاص بفولي");
          },
        }]} />
    </ModalForm>
  );
}

function VideoActions({ gift, onDone }: { gift: AdminGift; onDone: () => void }) {
  const act = useAction();
  const progress = useUploadProgress();
  const { modal } = App.useApp();
  const [linkOpen, setLinkOpen] = useState(false);
  const upload = (file: File) => {
    const problem = giftVideoProblem(file);
    act(async () => {
      if (problem) throw Object.assign(new Error(problem), { hint: "bad_video_file" });
      try { await changeGiftVideo(gift.key, file, progress.onProgress); } finally { progress.done(); }
    }, gift.video_url ? "تغيّر فيديو الهدية" : "أصبحت هدية فيديو", onDone);
    return false;
  };
  return (
    <Space size={4}>
      <Upload accept={VIDEO_ACCEPT} showUploadList={false} customRequest={() => {}} beforeUpload={upload}>
        <a><VideoCameraOutlined /> {gift.video_url ? "تغيير الفيديو" : "إضافة فيديو"}</a>
      </Upload>
      <Dropdown trigger={["click"]} menu={{ items: [
        { key: "link", icon: <LinkOutlined />, label: "ربط فيديو موجود برابط", onClick: () => setLinkOpen(true) },
        ...(gift.video_url ? [{
          key: "rm", danger: true, icon: <DeleteOutlined />, label: "حذف الفيديو",
          onClick: () => modal.confirm({
            title: "حذف الفيديو من الهدية؟", content: "ترجع هدية عادية. الملف يبقى محفوظ في Cloudinary.",
            okText: "حذف", cancelText: "إلغاء", okButtonProps: { danger: true },
            onOk: () => act(() => removeGiftVideo(gift.key), "حُذف الفيديو من الهدية", onDone),
          }),
        }] : []),
      ] }}>
        <a>…</a>
      </Dropdown>
      <VideoLink gift={gift} open={linkOpen} onClose={() => setLinkOpen(false)} onDone={onDone} />
    </Space>
  );
}

type Filter = "all" | "video" | "plain";

function Gifts() {
  const gifts = useLoad(getGifts, []);
  const vip = useLoad(getVipPrices, []);
  const act = useAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [preview, setPreview] = useState<AdminGift | null>(null);
  const all = gifts.data ?? [];
  const videoCount = all.filter((g) => g.video_url).length;
  const shown = filter === "all" ? all : all.filter((g) => (filter === "video") === !!g.video_url);
  return (
    <PageContainer title="الهدايا والأسعار">
      <Card>
        <Tabs items={[
          { key: "g", label: "الهدايا", children: <>
            {gifts.error && <Alert type="error" message={gifts.error} showIcon style={{ marginBottom: 16 }} />}
            <EditableProTable<AdminGift> rowKey="key" loading={gifts.loading} value={shown} recordCreatorProps={false}
              headerTitle="الهدايا اللي بتظهر في صندوق الهدايا"
              toolBarRender={() => [
                <Segmented<Filter> key="f" value={filter} onChange={setFilter} options={[
                  { value: "all", label: `الكل (${all.length})` },
                  { value: "video", label: `هدايا الفيديو (${videoCount})` },
                  { value: "plain", label: `بدون فيديو (${all.length - videoCount})` },
                ]} />,
                <AddGift key="add" onDone={gifts.reload} />,
              ]}
              editable={{ type: "single", onSave: async (_k, r) => { await act(() => updateGift(r), "حُفظت الهدية", gifts.reload); } }}
              columns={[
                { title: "الصورة", dataIndex: "art_url", editable: false, width: 90, render: (_, r) => r.art_url
                  ? <Image src={r.art_url} width={48} height={48} style={{ objectFit: "contain" }} />
                  : <Tooltip title="صورة مدمجة في التطبيق — ارفع صورة لتغييرها من هنا"><span style={{ color: "#999" }}>مدمجة</span></Tooltip> },
                { title: "الاسم", dataIndex: "name" },
                { title: "الفيديو", dataIndex: "video_url", editable: false, width: 130, render: (_, r) => r.video_url
                  ? <Tag color="purple" icon={<PlayCircleOutlined />} style={{ cursor: "pointer" }} onClick={() => setPreview(r)}>تشغيل</Tag>
                  : <span style={{ color: "#999" }}>—</span> },
                { title: "السعر", dataIndex: "price", valueType: "digit", render: (_, r) => fmt(r.price) },
                { title: "الترتيب", dataIndex: "sort", valueType: "digit" },
                { title: "معروضة", dataIndex: "active", valueType: "switch" },
                { title: "مرات الإرسال", dataIndex: "sent_count", editable: false, render: (_, r) => fmt(r.sent_count) },
                { title: "القيمة", dataIndex: "sent_value", editable: false, render: (_, r) => fmt(r.sent_value) },
                { title: "", valueType: "option", render: (_, r, _i, a) => [
                  <a key="e" onClick={() => a?.startEditable?.(r.key)}>تعديل</a>,
                  <ChangeArt key="p" gift={r} onDone={gifts.reload} />,
                  <VideoActions key="v" gift={r} onDone={gifts.reload} />,
                ] },
              ]} />
            <VideoPreview url={preview?.video_url ?? null} title={preview ? `فيديو هدية ${preview.name}` : ""} onClose={() => setPreview(null)} />
          </> },
          { key: "v", label: "أسعار VIP", children: <>
            {vip.error && <Alert type="error" message={vip.error} showIcon style={{ marginBottom: 16 }} />}
            <EditableProTable<VipTierPrice> rowKey="level" loading={vip.loading} value={vip.data ?? []} recordCreatorProps={false}
              editable={{ type: "single", onSave: async (_k, r) => { await act(() => updateVipPrice({ ...r, price_coins: r.price_coins ?? null, monthly_salary_coins: r.monthly_salary_coins ?? null }), "حُفظ السعر", vip.reload); } }}
              columns={[
                { title: "المستوى", dataIndex: "level", editable: false },
                { title: "الاسم", dataIndex: "name_ar", editable: false },
                { title: "السعر (فارغ = غير معروض للبيع)", dataIndex: "price_coins", valueType: "digit", render: (_, r) => r.price_coins == null ? "غير معروض للبيع" : fmt(r.price_coins) },
                { title: "المدة (يوم)", dataIndex: "duration_days", valueType: "digit" },
                { title: "الراتب الشهري", dataIndex: "monthly_salary_coins", valueType: "digit", render: (_, r) => fmt(r.monthly_salary_coins) },
                { title: "", valueType: "option", render: (_, r, _i, a) => <a onClick={() => a?.startEditable?.(r.level)}>تعديل</a> },
              ]} />
          </> },
        ]} />
      </Card>
    </PageContainer>
  );
}
