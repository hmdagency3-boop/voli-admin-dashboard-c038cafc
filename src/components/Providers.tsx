import '@ant-design/v5-patch-for-react-19';
import { App as AntApp, ConfigProvider } from 'antd';
import arEG from 'antd/locale/ar_EG';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider direction="rtl" locale={arEG}
      theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6, fontFamily: "'Cairo', system-ui, sans-serif" } }}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
