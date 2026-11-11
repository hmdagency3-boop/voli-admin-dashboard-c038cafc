import { PictureOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Typography, Upload, type UploadFile } from "antd";
import { useState } from "react";
import { ImageEdgeEditor } from "@/components/ImageEdgeEditor";
import { FrameToArt } from "@/components/VideoFramePicker";
import { GIFT_ART_TYPES } from "@/lib/admin";

const asItem = (f: File): UploadFile => ({
  uid: `${Date.now()}`, name: f.name, size: f.size, type: f.type, status: "done", thumbUrl: URL.createObjectURL(f),
  originFileObj: f as NonNullable<UploadFile["originFileObj"]>,
});

/**
 * Picture field for add forms: choose a picture, or take one from the video chosen in the same form ("video" field).
 * alwaysEdit = every chosen picture goes through the square / soft-edge editor (entrances).
 */
export function ArtField({ value, onChange, alwaysEdit = false, editorTitle }: {
  value?: UploadFile[]; onChange?: (v: UploadFile[]) => void; alwaysEdit?: boolean; editorTitle: string;
}) {
  const form = Form.useFormInstance();
  const videoList = Form.useWatch("video", form) as UploadFile[] | undefined;
  const video = (videoList?.[0]?.originFileObj as File | undefined) ?? null;
  const [pending, setPending] = useState<File | null>(null);
  const [frameFrom, setFrameFrom] = useState<File | null>(null);
  const set = (f: File) => onChange?.([asItem(f)]);
  return (
    <>
      <Upload accept={GIFT_ART_TYPES.join(",")} listType="picture-card" maxCount={1} fileList={value ?? []}
        beforeUpload={(f) => { if (alwaysEdit) setPending(f); else set(f); return Upload.LIST_IGNORE; }} onRemove={() => onChange?.([])}>
        {!value?.length && <div><PlusOutlined /><div style={{ marginTop: 6 }}>اختر صورة</div></div>}
      </Upload>
      <Button size="small" icon={<PictureOutlined />} disabled={!video} onClick={() => setFrameFrom(video)}>اختيار الصورة من الفيديو</Button>
      {!video && <Typography.Text type="secondary" style={{ fontSize: 12, marginInlineStart: 8 }}>اختر الفيديو تحت الأول</Typography.Text>}
      <ImageEdgeEditor file={pending} title={editorTitle} onCancel={() => setPending(null)} onDone={(f) => { setPending(null); set(f); }} />
      <FrameToArt source={frameFrom} title={editorTitle} onCancel={() => setFrameFrom(null)} onDone={(f) => { setFrameFrom(null); set(f); }} />
    </>
  );
}
