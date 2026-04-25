import { Eye, EyeOff, X } from 'lucide-react';
import { useState } from 'react';

import { getStoredApiKey, setStoredApiKey } from '@/lib/api';
import { BubbleStyle } from '@/hooks/useBubbleStyle';
import { MODELS } from '@/lib/models';

interface SettingsModalProps {
  onClose: () => void;
  bubbleStyle: BubbleStyle;
  onBubbleStyleChange: (style: BubbleStyle) => void;
}

const API_KEY_CONFIGS = [
  {
    id: 'dashscope' as const,
    label: 'DashScope API Key',
    placeholder: 'sk-xxxxxxxxxxxxxxxx',
    hint: '用于 Qwen 系列模型',
  },
];

export function SettingsModal({ onClose, bubbleStyle, onBubbleStyleChange }: SettingsModalProps) {
  const [keys, setKeys] = useState({
    dashscope: getStoredApiKey('qwen3.6-flash'),
  });
  const [visible, setVisible] = useState({ dashscope: false });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setStoredApiKey('dashscope', keys.dashscope);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex w-[480px] flex-col rounded-2xl bg-white shadow-2xl dark:bg-[var(--dark-surface)] dark:shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-[var(--dark-text)]">设置</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-8 pb-8 space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              气泡风格
            </h3>
            <div className="flex gap-2">
              {([
                { value: 'glass', label: '毛玻璃', desc: '半透明背景' },
                { value: 'classic', label: '经典灰', desc: '纯色背景' },
              ] as { value: BubbleStyle; label: string; desc: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onBubbleStyleChange(opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                    bubbleStyle === opt.value
                      ? 'border-slate-800 bg-slate-800 text-white dark:border-[var(--dark-text)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]'
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className={`mt-0.5 text-xs ${bubbleStyle === opt.value ? 'text-white/70' : 'text-slate-400 dark:text-[var(--dark-muted)]'}`}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              可用模型
            </h3>
            <div className="space-y-2">
              {MODELS.map((model) => (
                <div
                  key={model.value}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-[var(--dark-text)]">{model.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-[var(--dark-muted)]">{model.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400 dark:text-[var(--dark-muted)]">模型在上传时选择，每个课件独立绑定。</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              API Key
            </h3>
            <div className="space-y-3">
              {API_KEY_CONFIGS.map((cfg) => (
                <div key={cfg.id}>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-[var(--dark-text)]">
                    {cfg.label}
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]">
                    <input
                      type={visible[cfg.id] ? 'text' : 'password'}
                      value={keys[cfg.id]}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [cfg.id]: e.target.value }))}
                      placeholder={cfg.placeholder}
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-300 outline-none dark:text-[var(--dark-text)] dark:placeholder-[var(--dark-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible((prev) => ({ ...prev, [cfg.id]: !prev[cfg.id] }))}
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:text-[var(--dark-text)]"
                    >
                      {visible[cfg.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-[var(--dark-muted)]">{cfg.hint}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400 dark:text-[var(--dark-muted)]">
              Key 仅保存在本地浏览器，不会上传服务器。
            </p>
          </section>

          <div className="flex items-center justify-between">
            <a
              href="https://github.com/liijiann/CourseLens"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-slate-400 transition hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:text-[var(--dark-text)]"
              title="GitHub"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </a>
            <button
              onClick={handleSave}
              className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-[var(--dark-accent)] dark:hover:opacity-90"
            >
              {saved ? '已保存' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

