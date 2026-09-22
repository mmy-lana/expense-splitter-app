import type { ThemeConfig } from 'antd';

export const cleanFinanceMintTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00A86B',
    colorInfo: '#00A86B',
    colorSuccess: '#059669',
    colorWarning: '#F59E0B',
    colorError: '#E11D48',
    colorTextBase: '#0F172A',
    colorBgBase: '#FFFFFF',
    colorBgLayout: '#F8FAFC',
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
    boxShadowSecondary: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    controlHeight: 38,
    controlHeightLG: 46,
    controlHeightSM: 30,
  },
  components: {
    Button: {
      fontWeight: 600,
      controlHeight: 38,
      primaryShadow: '0 2px 4px 0 rgba(0, 168, 107, 0.25)',
    },
    Card: {
      paddingLG: 20,
      colorBorderSecondary: '#EDF2F7',
    },
    Table: {
      headerBg: '#F0FDF7',
      headerColor: '#047857',
      rowHoverBg: '#F8FAFC',
    },
    Tabs: {
      itemSelectedColor: '#00A86B',
      itemHoverColor: '#059669',
      inkBarColor: '#00A86B',
    },
    Modal: {
      borderRadiusLG: 16,
    },
  },
};
