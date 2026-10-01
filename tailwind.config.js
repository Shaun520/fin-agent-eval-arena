/* Tailwind v3：设计令牌全部落在 theme.extend，与 assets/main.css 的 :root 一一对应 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      /* 颜色（对应原型 :root 的 --bg / --text / --muted / --brand …） */
      colors: {
        bg: { DEFAULT: '#ffffff', soft: '#f7f8fa', sunken: '#f2f3f5' },
        sidebar: '#fafbfc',
        border: { DEFAULT: '#e8eaed', strong: '#dcdfe4' },
        content: { DEFAULT: '#14171a', soft: '#41474d' }, // --text / --text-2
        muted: { DEFAULT: '#6b7280', soft: '#9aa1a9' }, // --muted / --muted-2
        brand: { DEFAULT: '#1f6feb', soft: '#eaf1fe' },
        ok: { DEFAULT: '#0e9f6e', soft: '#e7f7f1' },
        warn: { DEFAULT: '#c2790a', soft: '#fdf3e2' },
        danger: { DEFAULT: '#d92b2b', soft: '#fdeceb' },
        risk: { DEFAULT: '#96650a', border: '#f2d6a8', soft: '#fffaf0' }, // .chip.risk
      },
      /* 圆角：14 / 10 / 7 */
      borderRadius: { lg: '14px', md: '10px', sm: '7px' },
      /* 字号：11 / 12 / 13 / 14 / 16 / 18 / 22 */
      fontSize: {
        11: '11px',
        12: '12px',
        13: '13px',
        14: '14px',
        16: '16px',
        18: '18px',
        22: '22px',
      },
      /* 卡片阴影 */
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.05)',
      },
      /* 字体栈：正文 / 等宽数字 */
      fontFamily: {
        sans: ['"Segoe UI"', '"Microsoft YaHei"', '"PingFang SC"', '"Hiragino Sans GB"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}